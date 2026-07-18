const crypto = require("crypto");

const ActiveCleaningTaskStateAttribute = require("../entities/state/attributes/ActiveCleaningTaskStateAttribute");
const AttributeSubscriber = require("../entities/AttributeSubscriber");
const AutomaticControlCapability = require("./capabilities/AutomaticControlCapability");
const BasicControlCapability = require("./capabilities/BasicControlCapability");
const CallbackAttributeSubscriber = require("../entities/CallbackAttributeSubscriber");
const CleaningCommandStateAttribute = require("../entities/state/attributes/CleaningCommandStateAttribute");
const CleaningTargetStateAttribute = require("../entities/state/attributes/CleaningTargetStateAttribute");
const DockStatusStateAttribute = require("../entities/state/attributes/DockStatusStateAttribute");
const Logger = require("../Logger");
const MapLayer = require("../entities/map/MapLayer");
const MapSegmentationCapability = require("./capabilities/MapSegmentationCapability");
const PresetSelectionStateAttribute = require("../entities/state/attributes/PresetSelectionStateAttribute");
const StatusStateAttribute = require("../entities/state/attributes/StatusStateAttribute");
const ValetudoMapSegment = require("../entities/core/ValetudoMapSegment");
const ValetudoZone = require("../entities/core/ValetudoZone");
const ZoneCleaningCapability = require("./capabilities/ZoneCleaningCapability");

const CREATE_CONFLICT_ERROR = (name, message) => {
    const error = /** @type {Error & {statusCode: number}} */ (new Error(message));
    error.name = name;
    error.statusCode = 409;
    return error;
};

class CleaningTaskService {
    /**
     * @param {object} options
     * @param {import("./ValetudoRobot")} options.robot
     * @param {number} [options.verificationTimeoutMs]
     */
    constructor(options) {
        this.robot = options.robot;
        this.verificationTimeoutMs = options.verificationTimeoutMs ?? 5_000;
        this.commandQueue = Promise.resolve();
        this.initializeDefaultTarget();
    }

    getTarget() {
        return this.robot.state.getFirstMatchingAttributeByConstructor(CleaningTargetStateAttribute);
    }

    /**
     * Cleaning drafts are process-local. Seed a safe whole-home target at startup and, when
     * supported, replace only that untouched seed with the first firmware-reported automatic mode.
     * @private
     */
    initializeDefaultTarget() {
        if (this.getTarget()) {
            return;
        }
        const matcher = {
            attributeClass: PresetSelectionStateAttribute.name,
            attributeType: PresetSelectionStateAttribute.TYPE.AUTOMATIC_CONTROL
        };
        const automaticAttribute = /** @type {import("../entities/state/attributes/PresetSelectionStateAttribute")|null} */ (
            this.robot.state.getFirstMatchingAttribute(matcher)
        );
        const initialTarget = this.robot.setCleaningTarget(this.normalizeTarget({
            value: this.getFirmwareWholeHomeTargetValue(),
            segmentIds: [],
            source: "system",
            active: false
        }));

        if (automaticAttribute || !this.robot.capabilities[AutomaticControlCapability.TYPE]) {
            return;
        }

        const subscriber = new CallbackAttributeSubscriber((eventType, attribute) => {
            if (eventType !== AttributeSubscriber.EVENT_TYPE.ADD &&
                eventType !== AttributeSubscriber.EVENT_TYPE.CHANGE) {
                return;
            }
            this.robot.state.unsubscribe(subscriber, matcher);
            const currentTarget = this.getTarget();
            if (/** @type {any} */ (attribute).value === "off" ||
                currentTarget?.revision !== initialTarget?.revision ||
                currentTarget.active) {
                return;
            }
            this.robot.setCleaningTarget(this.normalizeTarget({
                value: CleaningTargetStateAttribute.VALUE.AUTOMATIC,
                segmentIds: [],
                source: "system",
                active: false,
                expectedRevision: currentTarget.revision
            }));
        });
        this.robot.state.subscribe(subscriber, matcher);
    }

    getFirmwareWholeHomeTargetValue() {
        const automatic = this.robot.state.getFirstMatchingAttribute({
            attributeClass: PresetSelectionStateAttribute.name,
            attributeType: PresetSelectionStateAttribute.TYPE.AUTOMATIC_CONTROL
        });
        return automatic?.value !== undefined && automatic.value !== "off" ?
            CleaningTargetStateAttribute.VALUE.AUTOMATIC : CleaningTargetStateAttribute.VALUE.ALL;
    }

    /**
     * Validates and publishes a cleaning draft without executing it.
     * @param {object} requestedTarget
     * @return {import("../entities/state/attributes/CleaningTargetStateAttribute")}
     */
    stageTarget(requestedTarget) {
        if (this.getTarget()?.active) {
            throw CREATE_CONFLICT_ERROR("CleaningTaskActiveError", "The active cleaning target cannot be replaced");
        }
        const target = this.normalizeTarget(requestedTarget);
        const published = this.robot.setCleaningTarget(target);
        if (!published) {
            throw CREATE_CONFLICT_ERROR(
                "CleaningTargetRevisionError",
                "The cleaning target changed before the operation could be applied"
            );
        }
        return published;
    }

    /** @param {{source?: string}} [options] */
    startAll(options = {}) {
        return this.serializeCommand(() => this.startAllLocked(options));
    }

    /**
     * Starts exactly the currently staged target revision.
     * @param {{source?: string, expectedRevision: number}} options
     */
    startTarget(options) {
        return this.serializeCommand(() => this.startTargetLocked(options));
    }

    async startTargetLocked(options) {
        if (!Number.isInteger(options.expectedRevision) || options.expectedRevision < 0) {
            throw new RangeError("A valid cleaning-target revision is required");
        }
        const target = this.getTarget();
        if (!target || target.revision !== options.expectedRevision) {
            throw CREATE_CONFLICT_ERROR(
                "CleaningTargetRevisionError",
                "The cleaning target changed before the operation could be applied"
            );
        }
        const status = this.robot.state.getFirstMatchingAttributeByConstructor(StatusStateAttribute);
        if (this.isExplicitResumeState(status)) {
            this.assertDockMaintenanceInactive();
            return this.resumeLocked(this.createCommand(CleaningCommandStateAttribute.COMMAND.RESUME, options.source));
        }
        if (target.active) {
            throw CREATE_CONFLICT_ERROR("CleaningTaskActiveError", "The cleaning target is already active");
        }
        this.assertNewCleaningCanStart();
        if (target.value === CleaningTargetStateAttribute.VALUE.SEGMENTS) {
            const command = this.createCommand(CleaningCommandStateAttribute.COMMAND.START_SEGMENTS, options.source);
            return this.executeSegmentTarget(target, command);
        }
        if (target.value === CleaningTargetStateAttribute.VALUE.ZONES) {
            const command = this.createCommand(CleaningCommandStateAttribute.COMMAND.START_ZONES, options.source);
            return this.executeZoneTarget(target, command);
        }
        if (target.value === CleaningTargetStateAttribute.VALUE.ALL ||
            target.value === CleaningTargetStateAttribute.VALUE.AUTOMATIC) {
            const command = this.createCommand(CleaningCommandStateAttribute.COMMAND.START_ALL, options.source);
            return this.executeWholeHomeTarget(target, command);
        }
        throw new RangeError("No startable cleaning target is staged");
    }

    async startAllLocked(options) {
        const status = this.robot.state.getFirstMatchingAttributeByConstructor(StatusStateAttribute);
        if (this.isExplicitResumeState(status)) {
            this.assertDockMaintenanceInactive();
            return this.resumeLocked(this.createCommand(CleaningCommandStateAttribute.COMMAND.RESUME, options.source));
        }
        this.assertNewCleaningCanStart();
        const command = this.createCommand(CleaningCommandStateAttribute.COMMAND.START_ALL, options.source);
        const targetValue = this.getFirmwareWholeHomeTargetValue();
        const draft = this.stageTarget({
            value: targetValue,
            segmentIds: [],
            iterations: 1,
            source: options.source ?? "webui",
            active: false,
            expectedRevision: options.expectedRevision
        });
        return this.executeWholeHomeTarget(draft, command);
    }

    /**
     * @param {object} options
     * @param {Array<string|number>} options.segmentIds
     * @param {number} [options.iterations]
     * @param {boolean} [options.customOrder]
     * @param {string} [options.source]
     * @param {number} [options.expectedRevision]
     */
    startSegments(options) {
        const command = this.createCommand(CleaningCommandStateAttribute.COMMAND.START_SEGMENTS, options.source);
        return this.serializeCommand(() => this.startSegmentsLocked(options, command));
    }

    /**
     * @param {object} options
     * @param {Array<object>} options.zones
     * @param {number} [options.iterations]
     * @param {string} [options.source]
     * @param {number} [options.expectedRevision]
     */
    startZones(options) {
        const command = this.createCommand(CleaningCommandStateAttribute.COMMAND.START_ZONES, options.source);
        return this.serializeCommand(() => this.startZonesLocked(options, command));
    }

    home(options = {}) {
        const command = this.createCommand(CleaningCommandStateAttribute.COMMAND.HOME, options.source);
        return this.serializeCommand(() => this.homeLocked(command));
    }

    /** @param {{source?: string}} [options] */
    pause(options = {}) {
        const command = this.createCommand(CleaningCommandStateAttribute.COMMAND.PAUSE, options.source);
        return this.serializeCommand(() => this.pauseLocked(command));
    }

    /** @param {{source?: string}} [options] */
    resume(options = {}) {
        const command = this.createCommand(CleaningCommandStateAttribute.COMMAND.RESUME, options.source);
        return this.serializeCommand(() => this.resumeLocked(command));
    }

    /** @param {{source?: string}} [options] */
    stop(options = {}) {
        const command = this.createCommand(CleaningCommandStateAttribute.COMMAND.STOP, options.source);
        return this.serializeCommand(() => this.stopLocked(command));
    }

    async homeLocked(command) {
        const capability = this.robot.capabilities[BasicControlCapability.TYPE];
        if (!capability) {
            throw new Error("Basic control is not supported");
        }
        const status = this.robot.state.getFirstMatchingAttributeByConstructor(StatusStateAttribute);
        const activeTask = this.robot.state.getFirstMatchingAttributeByConstructor(
            ActiveCleaningTaskStateAttribute
        );
        const cancelsTask = Boolean(activeTask &&
            !["completed", "cancelled", "stopped", "failed"].includes(activeTask.state)) || [
            StatusStateAttribute.VALUE.CLEANING,
            StatusStateAttribute.VALUE.PAUSED,
            StatusStateAttribute.VALUE.RETURNING
        ].includes(status?.value);
        const mustDiscardResumableTask = status?.value === StatusStateAttribute.VALUE.PAUSED ||
            status?.flag === StatusStateAttribute.FLAG.RESUMABLE;
        return this.executeControlCommand(command, async () => {
            // A number of firmwares interpret Home while paused as "return and keep this job
            // resumable". Explicitly stop first so Send to Dock discards the paused job.
            if (cancelsTask && mustDiscardResumableTask) {
                await capability.stop();
                // The MIOT/RPC response only acknowledges the Stop command. Wait until the
                // firmware has actually left its resumable state before issuing Home; otherwise
                // some Dreame firmwares ignore Home and remain paused-resumable.
                const stopped = await this.waitForStatus([
                    StatusStateAttribute.VALUE.IDLE,
                    StatusStateAttribute.VALUE.DOCKED
                ], this.verificationTimeoutMs);
                if (!stopped) {
                    throw new Error("Robot stop verification timed out while discarding the paused cleaning task");
                }
                const stoppedStatus = this.robot.state.getFirstMatchingAttributeByConstructor(StatusStateAttribute);
                if (stoppedStatus?.value !== StatusStateAttribute.VALUE.DOCKED) {
                    await capability.home();
                    const returning = await this.waitForStatus([
                        StatusStateAttribute.VALUE.RETURNING,
                        StatusStateAttribute.VALUE.DOCKED
                    ], this.verificationTimeoutMs);
                    if (!returning) {
                        throw new Error("Robot return-to-dock verification timed out");
                    }
                }
            } else {
                await capability.home();
                const returning = await this.waitForStatus([
                    StatusStateAttribute.VALUE.RETURNING,
                    StatusStateAttribute.VALUE.DOCKED
                ], this.verificationTimeoutMs);
                if (!returning) {
                    throw new Error("Robot return-to-dock verification timed out");
                }
            }
            if (cancelsTask) {
                this.robot.reportOperationOutcome("cancelled");
            }
        }, [StatusStateAttribute.VALUE.RETURNING, StatusStateAttribute.VALUE.DOCKED],
        "Robot did not confirm that it is returning to the dock");
    }

    async pauseLocked(command) {
        const capability = this.robot.capabilities[BasicControlCapability.TYPE];
        if (!capability) {
            throw new Error("Basic control is not supported");
        }
        return this.executeControlCommand(command, () => capability.pause(),
            [StatusStateAttribute.VALUE.PAUSED], "Robot did not confirm that cleaning is paused");
    }

    async resumeLocked(command) {
        const capability = this.robot.capabilities[BasicControlCapability.TYPE];
        if (!capability) {
            throw new Error("Basic control is not supported");
        }
        const status = this.robot.state.getFirstMatchingAttributeByConstructor(StatusStateAttribute);
        const resumable = status?.value === StatusStateAttribute.VALUE.PAUSED ||
            status?.flag === StatusStateAttribute.FLAG.RESUMABLE;
        if (!resumable) {
            throw CREATE_CONFLICT_ERROR("CleaningTaskNotResumableError", "Robot has no paused operation to resume");
        }
        return this.executeControlCommand(command, () => capability.start(),
            [StatusStateAttribute.VALUE.CLEANING], "Robot did not confirm that cleaning resumed");
    }

    async stopLocked(command) {
        const capability = this.robot.capabilities[BasicControlCapability.TYPE];
        if (!capability) {
            throw new Error("Basic control is not supported");
        }
        const status = this.robot.state.getFirstMatchingAttributeByConstructor(StatusStateAttribute);
        const activeTask = this.robot.state.getFirstMatchingAttributeByConstructor(
            ActiveCleaningTaskStateAttribute
        );
        const stopsTask = Boolean(activeTask &&
            !["completed", "cancelled", "stopped", "failed"].includes(activeTask.state)) || [
            StatusStateAttribute.VALUE.CLEANING,
            StatusStateAttribute.VALUE.PAUSED,
            StatusStateAttribute.VALUE.RETURNING
        ].includes(status?.value);
        return this.executeControlCommand(command, async () => {
            await capability.stop();
            if (stopsTask) {
                const stopped = await this.waitForStatus([
                    StatusStateAttribute.VALUE.IDLE,
                    StatusStateAttribute.VALUE.DOCKED
                ], this.verificationTimeoutMs);
                if (!stopped) {
                    throw new Error("Robot stop verification timed out");
                }
                this.robot.reportOperationOutcome("stopped");
            }
        }, [
            StatusStateAttribute.VALUE.IDLE,
            StatusStateAttribute.VALUE.DOCKED
        ], "Robot did not confirm that cleaning stopped");
    }

    async startSegmentsLocked(options, command) {
        this.assertNewCleaningCanStart();
        if (!Array.isArray(options.segmentIds) || options.segmentIds.length === 0) {
            throw new RangeError("At least one room must be selected");
        }
        const draft = this.stageTarget({
            value: CleaningTargetStateAttribute.VALUE.SEGMENTS,
            segmentIds: options.segmentIds,
            iterations: options.iterations ?? 1,
            source: options.source ?? "webui",
            active: false,
            expectedRevision: options.expectedRevision
        });
        return this.executeSegmentTarget(draft, command, options.customOrder === true);
    }

    async startZonesLocked(options, command) {
        this.assertNewCleaningCanStart();
        if (!Array.isArray(options.zones) || options.zones.length === 0) {
            throw new RangeError("At least one zone must be selected");
        }
        const draft = this.stageTarget({
            value: CleaningTargetStateAttribute.VALUE.ZONES,
            segmentIds: [],
            zones: options.zones,
            iterations: options.iterations ?? 1,
            source: options.source ?? "webui",
            active: false,
            expectedRevision: options.expectedRevision
        });
        return this.executeZoneTarget(draft, command);
    }

    /**
     * Rejects only genuinely new cleaning tasks. Resume paths call resumeLocked() before reaching
     * this guard so a low-battery or recoverable-error task can continue.
     *
     * @private
     */
    assertNewCleaningCanStart() {
        const activeTask = this.robot.state.getFirstMatchingAttributeByConstructor(
            ActiveCleaningTaskStateAttribute
        );
        if (activeTask && !TERMINAL_TASK_STATES.has(activeTask.state)) {
            throw CREATE_CONFLICT_ERROR(
                "CleaningStartBlockedError",
                "Cannot start a new cleaning while another cleaning task is active"
            );
        }

        this.assertDockMaintenanceInactive();

        const status = this.robot.state.getFirstMatchingAttributeByConstructor(StatusStateAttribute);
        if (BLOCKING_ROBOT_STATES.has(status?.value)) {
            throw CREATE_CONFLICT_ERROR(
                "CleaningStartBlockedError",
                `Cannot start cleaning while the robot is ${status.value.replaceAll("_", " ")}`
            );
        }
    }

    /**
     * @param {StatusStateAttribute|undefined|null} status
     * @private
     */
    isExplicitResumeState(status) {
        return status?.value === StatusStateAttribute.VALUE.PAUSED ||
            (status?.value === StatusStateAttribute.VALUE.ERROR &&
                status?.flag === StatusStateAttribute.FLAG.RESUMABLE);
    }

    /** @private */
    assertDockMaintenanceInactive() {
        const dockStatus = this.robot.state.getFirstMatchingAttributeByConstructor(DockStatusStateAttribute);
        if (BLOCKING_DOCK_STATES.has(dockStatus?.value)) {
            throw CREATE_CONFLICT_ERROR(
                "CleaningStartBlockedError",
                `Cannot start cleaning while dock maintenance is ${dockStatus.value}`
            );
        }

        const status = this.robot.state.getFirstMatchingAttributeByConstructor(StatusStateAttribute);
        if (BLOCKING_MAINTENANCE_FLAGS.has(status?.flag)) {
            throw CREATE_CONFLICT_ERROR(
                "CleaningStartBlockedError",
                `Cannot start cleaning while robot maintenance is ${status.flag.replaceAll("_", " ")}`
            );
        }
    }

    async executeWholeHomeTarget(target, command) {
        const capability = this.robot.capabilities[BasicControlCapability.TYPE];
        if (!capability) {
            throw new Error("Basic control is not supported");
        }
        if (target.value !== CleaningTargetStateAttribute.VALUE.AUTOMATIC) {
            await this.disableAutomaticControlForManualTarget();
        }
        return this.startDraft(target, command, () => capability.start());
    }

    async executeSegmentTarget(target, command, customOrder) {
        const capability = this.robot.capabilities[MapSegmentationCapability.TYPE];
        if (!capability) {
            throw new Error("Segment cleaning is not supported");
        }
        if (target.segmentIds.length === 0) {
            throw new RangeError("At least one room must be selected");
        }
        this.validateSegments(target.segmentIds, target.iterations);
        const segments = target.segmentIds.map(id => new ValetudoMapSegment({id: id}));
        await this.disableAutomaticControlForManualTarget();
        return this.startDraft(target, command, () => capability.executeSegmentAction(segments, {
            iterations: target.iterations,
            customOrder: customOrder ?? capability.getProperties()?.customOrderSupport === true
        }));
    }

    async executeZoneTarget(target, command) {
        const capability = this.robot.capabilities[ZoneCleaningCapability.TYPE];
        if (!capability) {
            throw new Error("Zone cleaning is not supported");
        }
        if (target.zones.length === 0) {
            throw new RangeError("At least one zone must be selected");
        }
        this.validateZones(target.zones, target.iterations);
        const zones = target.zones.map(zone => new ValetudoZone(zone));
        await this.disableAutomaticControlForManualTarget();
        return this.startDraft(target, command, () => capability.start({
            zones: zones,
            iterations: target.iterations
        }));
    }

    async disableAutomaticControlForManualTarget() {
        const automaticAttribute = this.robot.state.getFirstMatchingAttribute({
            attributeClass: PresetSelectionStateAttribute.name,
            attributeType: PresetSelectionStateAttribute.TYPE.AUTOMATIC_CONTROL
        });
        if (automaticAttribute?.value === undefined || automaticAttribute.value === "off") {
            return;
        }
        const capability = this.robot.capabilities[AutomaticControlCapability.TYPE];
        if (!capability) {
            throw new Error("Automatic control cannot be disabled for a manual cleaning target");
        }
        await capability.selectPreset("off");
    }

    async startDraft(draft, command, execute) {
        const activeTarget = this.robot.setCleaningTarget({
            ...draft,
            // The draft source describes who selected the target. History needs the control
            // surface that actually issued Start, which is carried by the command.
            source: command.source,
            active: true,
            expectedRevision: draft.revision
        });
        if (!activeTarget) {
            throw CREATE_CONFLICT_ERROR(
                "CleaningTargetRevisionError",
                "The cleaning target changed before the operation could be applied"
            );
        }
        return this.executeStartCommand(activeTarget, command, execute, draft);
    }

    createCommand(command, source = "webui") {
        const now = new Date().toISOString();
        return {
            id: crypto.randomUUID(),
            command: command,
            source: source ?? "webui",
            createdAt: now
        };
    }

    /**
     * @template T
     * @param {() => T | Promise<T>} execute
     * @return {Promise<T>}
     */
    serializeCommand(execute) {
        const queued = this.commandQueue.then(execute, execute);
        this.commandQueue = queued.then(() => undefined, () => undefined);
        return queued;
    }

    async executeStartCommand(activeTarget, command, execute, rollbackTarget = null) {
        this.publishCommandState(command, CleaningCommandStateAttribute.STATE.PENDING, {
            targetRevision: activeTarget?.revision ?? null
        }, true);
        try {
            await execute();
            this.publishCommandState(command, CleaningCommandStateAttribute.STATE.ACCEPTED);
            this.verifyStartCommand(command);
            return {target: activeTarget, commandId: command.id};
        } catch (error) {
            error.commandId = command.id;
            if (this.isAmbiguousCommandError(error)) {
                this.publishCommandState(command, CleaningCommandStateAttribute.STATE.UNCERTAIN, {
                    error: error.message
                });
                this.verifyStartCommand(command);
            } else {
                if (rollbackTarget && activeTarget) {
                    const rollback = this.robot.setCleaningTarget({
                        ...rollbackTarget,
                        active: false,
                        expectedRevision: activeTarget.revision
                    });
                    if (!rollback) {
                        error.rollbackConflict = true;
                        Logger.warn(`Unable to roll back cleaning target for command ${command.id}; ` +
                            "a newer target revision is already active");
                    }
                }
                this.publishCommandState(command, CleaningCommandStateAttribute.STATE.FAILED, {
                    error: error.rollbackConflict ?
                        `${error.message}; target rollback skipped because a newer revision exists` : error.message
                });
            }
            throw error;
        }
    }

    async executeControlCommand(command, execute, verifiedStatuses, uncertaintyMessage) {
        this.publishCommandState(command, CleaningCommandStateAttribute.STATE.PENDING, {
            targetRevision: this.getTarget()?.revision ?? null
        }, true);
        try {
            await execute();
            this.publishCommandState(command, CleaningCommandStateAttribute.STATE.ACCEPTED);
            this.verifyCommand(command, verifiedStatuses, uncertaintyMessage);
            return {target: this.getTarget(), commandId: command.id};
        } catch (error) {
            error.commandId = command.id;
            const ambiguous = this.isAmbiguousCommandError(error);
            this.publishCommandState(command, ambiguous ? CleaningCommandStateAttribute.STATE.UNCERTAIN :
                CleaningCommandStateAttribute.STATE.FAILED, {error: error.message});
            if (ambiguous) {
                this.verifyCommand(command, verifiedStatuses, uncertaintyMessage);
            }
            throw error;
        }
    }

    verifyStartCommand(command) {
        this.verifyCommand(command, [StatusStateAttribute.VALUE.CLEANING],
            "Robot did not confirm that cleaning started");
    }

    verifyCommand(command, values, uncertaintyMessage) {
        this.waitForStatus(values, this.verificationTimeoutMs).then(verified => {
            if (verified) {
                this.publishCommandState(command, CleaningCommandStateAttribute.STATE.VERIFIED, {error: null});
            } else {
                this.publishCommandState(command, CleaningCommandStateAttribute.STATE.UNCERTAIN, {
                    error: uncertaintyMessage
                });
            }
        }).catch(() => {});
    }

    waitForStatus(values, timeoutMs) {
        const current = this.robot.state.getFirstMatchingAttributeByConstructor(StatusStateAttribute);
        if (values.includes(current?.value)) {
            return Promise.resolve(true);
        }
        return new Promise(resolve => {
            let settled = false;
            const matcher = {attributeClass: StatusStateAttribute.name};
            const finish = result => {
                if (settled) {
                    return;
                }
                settled = true;
                clearTimeout(timer);
                this.robot.state.unsubscribe(subscriber, matcher);
                resolve(result);
            };
            const subscriber = new CallbackAttributeSubscriber((eventType, attribute) => {
                if (values.includes(/** @type {any} */ (attribute).value)) {
                    finish(true);
                }
            });
            const timer = setTimeout(() => finish(false), timeoutMs);
            timer.unref?.();
            this.robot.state.subscribe(subscriber, matcher);
        });
    }

    publishCommandState(command, state, changes = {}, initial = false) {
        const current = this.robot.state.getFirstMatchingAttributeByConstructor(CleaningCommandStateAttribute);
        if (!initial && current?.id !== command.id) {
            return null;
        }
        const attribute = new CleaningCommandStateAttribute({
            ...command,
            ...changes,
            state: state,
            targetRevision: changes.targetRevision ?? current?.targetRevision ?? null,
            updatedAt: new Date().toISOString(),
            error: changes.error === undefined ? current?.error ?? null : changes.error,
            revision: (current?.revision ?? 0) + 1
        });
        this.robot.publishCleaningCommandState(attribute);
        return attribute;
    }

    isAmbiguousCommandError(error) {
        const name = error?.constructor?.name?.toLowerCase() ?? "";
        const message = error?.message?.toLowerCase() ?? "";
        return name.includes("timeout") || message.includes("timed out") || message.includes("timeout");
    }

    normalizeTarget(requestedTarget) {
        const values = Object.values(CleaningTargetStateAttribute.VALUE);
        if (!values.includes(requestedTarget.value)) {
            throw new RangeError("Unsupported cleaning target");
        }
        const requestedSegmentIds = requestedTarget.segmentIds ?? [];
        const zones = requestedTarget.zones ?? [];
        if (!Array.isArray(requestedSegmentIds) || !Array.isArray(zones)) {
            throw new TypeError("Cleaning target selections must be arrays");
        }
        const segmentIds = [...new Set(requestedSegmentIds.map(String))];
        if (requestedTarget.value !== CleaningTargetStateAttribute.VALUE.SEGMENTS && segmentIds.length > 0) {
            throw new RangeError("Room IDs are only valid for segment targets");
        }
        if (requestedTarget.value !== CleaningTargetStateAttribute.VALUE.ZONES && zones.length > 0) {
            throw new RangeError("Zones are only valid for zone targets");
        }
        const iterations = requestedTarget.iterations ?? 1;
        if (!Number.isInteger(iterations) || iterations < 1) {
            throw new RangeError("Iterations must be a positive integer");
        }
        if (requestedTarget.value === CleaningTargetStateAttribute.VALUE.SEGMENTS && segmentIds.length > 0) {
            this.validateSegments(segmentIds, iterations);
        }
        if (requestedTarget.value === CleaningTargetStateAttribute.VALUE.ZONES && zones.length > 0) {
            this.validateZones(zones, iterations);
        }
        const map = this.robot.state.map;
        return {
            value: requestedTarget.value,
            segmentIds: segmentIds,
            zones: zones,
            iterations: iterations,
            mapId: map?.metaData?.id ?? null,
            mapVersion: map?.metaData?.version ?? null,
            profile: requestedTarget.profile ?? this.getCurrentProfile(),
            source: requestedTarget.source ?? "webui",
            active: requestedTarget.active === true,
            expectedRevision: requestedTarget.expectedRevision,
            updatedAt: new Date().toISOString()
        };
    }

    validateSegments(segmentIds, iterations) {
        const validIds = new Set((this.robot.state.map?.layers ?? [])
            .filter(layer => layer.type === MapLayer.TYPE.SEGMENT && !layer.metaData.hidden)
            .map(layer => String(layer.metaData.segmentId)));
        if (validIds.size === 0) {
            throw new RangeError("Map segments are not available yet");
        }
        if (segmentIds.some(id => !validIds.has(id))) {
            throw new RangeError("One or more selected rooms are no longer available");
        }
        const properties = this.robot.capabilities[MapSegmentationCapability.TYPE]?.getProperties();
        const iterationCount = properties?.iterationCount;
        if (iterationCount && (iterations < iterationCount.min || iterations > iterationCount.max)) {
            throw new RangeError("Iteration count is not supported");
        }
    }

    validateZones(zones, iterations) {
        zones.forEach(zone => new ValetudoZone(zone));
        const properties = this.robot.capabilities[ZoneCleaningCapability.TYPE]?.getProperties();
        if (properties?.zoneCount &&
            (zones.length < properties.zoneCount.min || zones.length > properties.zoneCount.max)) {
            throw new RangeError("Zone count is not supported");
        }
        if (properties?.iterationCount &&
            (iterations < properties.iterationCount.min || iterations > properties.iterationCount.max)) {
            throw new RangeError("Iteration count is not supported");
        }
    }

    getCurrentProfile() {
        const findPreset = type => this.robot.state.getFirstMatchingAttribute({
            attributeClass: PresetSelectionStateAttribute.name,
            attributeType: type
        })?.value ?? null;
        return {
            operationMode: findPreset(PresetSelectionStateAttribute.TYPE.OPERATION_MODE),
            fanPreset: findPreset(PresetSelectionStateAttribute.TYPE.FAN_SPEED),
            waterPreset: findPreset(PresetSelectionStateAttribute.TYPE.WATER_GRADE),
            automaticMode: findPreset(PresetSelectionStateAttribute.TYPE.AUTOMATIC_CONTROL),
            automaticSubMode: findPreset(PresetSelectionStateAttribute.TYPE.AUTOMATIC_SUB_MODE),
            cleanRoute: findPreset(PresetSelectionStateAttribute.TYPE.CLEAN_ROUTE)
        };
    }
}

const TERMINAL_TASK_STATES = new Set(["completed", "cancelled", "stopped", "failed"]);
const BLOCKING_DOCK_STATES = new Set([
    DockStatusStateAttribute.VALUE.CLEANING,
    DockStatusStateAttribute.VALUE.EMPTYING,
    DockStatusStateAttribute.VALUE.PAUSE
]);
const BLOCKING_MAINTENANCE_FLAGS = new Set([
    StatusStateAttribute.FLAG.WASHING,
    StatusStateAttribute.FLAG.TO_WASH,
    StatusStateAttribute.FLAG.EMPTYING,
    StatusStateAttribute.FLAG.TO_EMPTY,
    StatusStateAttribute.FLAG.DRAINING,
    StatusStateAttribute.FLAG.TO_DRAIN,
    StatusStateAttribute.FLAG.ADD_WATER,
    StatusStateAttribute.FLAG.CHANGING_MOP,
    StatusStateAttribute.FLAG.INSTALL_MOP,
    StatusStateAttribute.FLAG.REMOVE_MOP,
    StatusStateAttribute.FLAG.AUTO_RECLEANING
]);
const BLOCKING_ROBOT_STATES = new Set([
    StatusStateAttribute.VALUE.CLEANING,
    StatusStateAttribute.VALUE.RETURNING,
    StatusStateAttribute.VALUE.MANUAL_CONTROL,
    StatusStateAttribute.VALUE.MOVING
]);

module.exports = CleaningTaskService;
