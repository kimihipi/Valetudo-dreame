const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const CallbackAttributeSubscriber = require("../entities/CallbackAttributeSubscriber");
const CleanRouteControlCapability = require("./capabilities/CleanRouteControlCapability");
const CurrentStatisticsCapability = require("./capabilities/CurrentStatisticsCapability");
const env = require("../res/env");
const Logger = require("../Logger");
const MapLayer = require("../entities/map/MapLayer");
const PathMapEntity = require("../entities/map/entities/PathMapEntity");
const PointMapEntity = require("../entities/map/entities/PointMapEntity");
const stateAttrs = require("../entities/state/attributes");
const ValetudoDataPoint = require("../entities/core/ValetudoDataPoint");

// Docked/returning states the robot passes through mid-cleanup (e.g. between the vacuum and mop
// passes of vacuum_then_mop, or between carpet-first phases). The firmware briefly reports
// task_status = COMPLETED during these, so without this list an intermediate empty/refill dock
// would be misread as the end of the task, splitting one run into several history records and
// resetting room positioning and estimates. RESUMABLE is handled separately.
const MID_CYCLE_FLAGS = new Set([
    stateAttrs.StatusStateAttribute.FLAG.EMPTYING,
    stateAttrs.StatusStateAttribute.FLAG.TO_EMPTY,
    stateAttrs.StatusStateAttribute.FLAG.WASHING,
    stateAttrs.StatusStateAttribute.FLAG.TO_WASH,
    stateAttrs.StatusStateAttribute.FLAG.DRAINING,
    stateAttrs.StatusStateAttribute.FLAG.TO_DRAIN,
    stateAttrs.StatusStateAttribute.FLAG.ADD_WATER,
    stateAttrs.StatusStateAttribute.FLAG.CHANGING_MOP,
    stateAttrs.StatusStateAttribute.FLAG.INSTALL_MOP,
    stateAttrs.StatusStateAttribute.FLAG.REMOVE_MOP,
    stateAttrs.StatusStateAttribute.FLAG.AUTO_RECLEANING,
]);

const MAX_HISTORY = 100;
const TASK_TERMINAL_STATES = ["completed", "cancelled", "stopped", "failed"];
const ROOM_DWELL_MS = 4_000;
const SAVE_DEBOUNCE_MS = 2_000;
const ESTIMATE_REFRESH_MS = 15_000;
const STATISTICS_TIMEOUT_MS = 5_000;
const TERMINAL_OUTCOME_GRACE_MS = 2_000;
const ROOM_DETECTION_INTERVAL_MS = 1_000;
const MAX_ESTIMATES = 500;
const MAX_ESTIMATE_MAPS = 5;
const DREAME_COVERAGE_RATES_M2_PER_MINUTE = Object.freeze({
    routine: 0.9,
    quick: 0.9,
    intensive: 0.6,
    deep: 0.6
});
// Some operation modes traverse the full floor area more than once (e.g. vacuum_then_mop
// runs a vacuum pass followed by a separate mop pass), so the cold-start baseline must
// account for the extra pass. Learned estimates are already keyed by operationMode and
// override this once a run completes.
const DREAME_OPERATION_MODE_PASS_FACTORS = Object.freeze({
    [stateAttrs.PresetSelectionStateAttribute.MODE.VACUUM_THEN_MOP]: 2
});

class CleaningTaskManager {
    constructor(options) {
        this.robot = options.robot;
        this.config = options.config;
        this.activeTask = null;
        this.revision = 0;
        this.roomCandidate = null;
        this.roomCandidateSince = 0;
        this.pendingOutcome = null;
        this.finishing = false;
        this.lastPathPointCount = 0;
        this.lastEstimatePublishAt = 0;
        this.lastRoomDetectionAt = 0;
        this.lastDetectedPositionKey = null;
        this.lastDetectedSegment = null;
        this.lastDraftReconcileKey = null;
        this.saveTimer = null;
        this.publishTimer = null;
        this.estimateRefreshMs = options.estimateRefreshMs ?? ESTIMATE_REFRESH_MS;
        this.statisticsTimeoutMs = options.statisticsTimeoutMs ?? STATISTICS_TIMEOUT_MS;
        this.terminalOutcomeGraceMs = options.terminalOutcomeGraceMs ?? TERMINAL_OUTCOME_GRACE_MS;
        this.history = [];
        this.estimates = {};
        this.estimateSequence = 0;
        this.lastTaskPayload = null;
        this.transitionCommandId = null;
        this.preTransitionState = null;
        this.terminalStatusTimer = null;
        const base = process.env[env.DataPath] ?? path.dirname(this.config.location ?? path.join(os.tmpdir(), "valetudo.json"));
        this.storagePath = path.join(base, "cleaning_history.json");
        this.load();

        this.attributeSubscriber = new CallbackAttributeSubscriber((eventType, attribute) => {
            if (attribute instanceof stateAttrs.StatusStateAttribute) {
                this.handleStatus(attribute);
            } else if (attribute instanceof stateAttrs.CleaningCommandStateAttribute) {
                this.handleCommandState(attribute);
            }
        });
        this.robot.state.subscribe(this.attributeSubscriber, {attributeClass: stateAttrs.StatusStateAttribute.name});
        this.robot.state.subscribe(this.attributeSubscriber, {
            attributeClass: stateAttrs.CleaningCommandStateAttribute.name
        });
        this.mapListener = () => this.handleMapUpdate();
        this.robot.onMapUpdated(this.mapListener);
        this.outcomeListener = outcome => {
            this.pendingOutcome = outcome;
            if (this.activeTask && !this.finishing) {
                this.clearTerminalStatusTimer();
                this.pendingOutcome = null;
                this.finishTask(outcome);
            }
        };
        this.robot.onOperationOutcome?.(this.outcomeListener);
    }

    load() {
        try {
            const stored = JSON.parse(fs.readFileSync(this.storagePath, "utf8"));
            if (stored?.version === 1) {
                this.history = Array.isArray(stored.history) ? stored.history.slice(0, MAX_HISTORY) : [];
                this.estimates = stored.estimates && typeof stored.estimates === "object" ? stored.estimates : {};
                this.estimateSequence = Object.values(this.estimates).reduce((latest, estimate) =>
                    Math.max(latest, estimate.updatedAt ?? 0), 0);
                this.pruneEstimates();
                if (stored.lastTask && TASK_TERMINAL_STATES.includes(stored.lastTask.state)) {
                    this.restoreLastTask(stored.lastTask);
                }
            }
        } catch (e) {
            if (e?.code !== "ENOENT") {
                Logger.warn("Unable to load cleaning history", e);
            }
        }
    }

    // Re-publish the last terminal task summary on startup so the UI keeps showing the previous
    // run's target/room progress/total time after a reboot (Valetudo runs on the robot, so a daily
    // robot reboot wipes the in-memory state attribute). activeTask stays null, so a fresh run that
    // reports CLEANING still starts a new task and overwrites this.
    restoreLastTask(payload) {
        try {
            this.revision = payload.revision ?? 0;
            this.lastTaskPayload = payload;
            this.robot.state.upsertFirstMatchingAttribute(new stateAttrs.ActiveCleaningTaskStateAttribute(payload));
        } catch (e) {
            Logger.warn("Unable to restore last cleaning task", e);
        }
    }

    scheduleSave() {
        if (this.saveTimer !== null) {
            clearTimeout(this.saveTimer);
        }
        this.saveTimer = setTimeout(() => this.flush(), SAVE_DEBOUNCE_MS);
        this.saveTimer.unref?.();
    }

    flush() {
        if (this.saveTimer !== null) {
            clearTimeout(this.saveTimer);
            this.saveTimer = null;
        }
        try {
            fs.mkdirSync(path.dirname(this.storagePath), {recursive: true});
            const temporary = this.storagePath + ".tmp";
            fs.writeFileSync(temporary, JSON.stringify({
                version: 1,
                history: this.history,
                estimates: this.estimates,
                lastTask: this.lastTaskPayload
            }));
            fs.renameSync(temporary, this.storagePath);
        } catch (e) {
            Logger.warn("Unable to persist cleaning history", e);
        }
    }

    startPublishTimer() {
        this.stopPublishTimer();
        this.publishTimer = setInterval(() => {
            if (this.activeTask) {
                this.publish();
            }
        }, this.estimateRefreshMs);
        this.publishTimer.unref?.();
    }

    stopPublishTimer() {
        if (this.publishTimer !== null) {
            clearInterval(this.publishTimer);
            this.publishTimer = null;
        }
    }

    async startTask(status) {
        this.pendingOutcome = null;
        const configuredTarget = this.robot.state.getFirstMatchingAttributeByConstructor(
            stateAttrs.CleaningTargetStateAttribute
        );
        // Only service-promoted targets describe the physical task being started. An inactive
        // Web UI/Matter draft must not be attached to an onboard schedule or physical-button run.
        const target = configuredTarget?.active ? configuredTarget : null;
        const operationMode = this.robot.state.getFirstMatchingAttribute({
            attributeClass: stateAttrs.PresetSelectionStateAttribute.name,
            attributeType: stateAttrs.PresetSelectionStateAttribute.TYPE.OPERATION_MODE
        })?.value;
        const fanPreset = this.robot.state.getFirstMatchingAttribute({
            attributeClass: stateAttrs.PresetSelectionStateAttribute.name,
            attributeType: stateAttrs.PresetSelectionStateAttribute.TYPE.FAN_SPEED
        })?.value;
        const waterPreset = this.robot.state.getFirstMatchingAttribute({
            attributeClass: stateAttrs.PresetSelectionStateAttribute.name,
            attributeType: stateAttrs.PresetSelectionStateAttribute.TYPE.WATER_GRADE
        })?.value;
        let route = null;
        try {
            route = await this.robot.capabilities[CleanRouteControlCapability.TYPE]?.getRoute();
        } catch (e) {
            Logger.debug("Unable to read clean route for task history", e);
        }
        if (this.activeTask) {
            return;
        }
        const currentStatus = this.robot.state.getFirstMatchingAttributeByConstructor(stateAttrs.StatusStateAttribute);
        if (currentStatus?.value !== stateAttrs.StatusStateAttribute.VALUE.CLEANING) {
            return;
        }
        this.lastPathPointCount = this.getCleaningPathPointCount();
        const segmentIds = target?.value === stateAttrs.CleaningTargetStateAttribute.VALUE.SEGMENTS ?
            [...target.segmentIds] : [];
        const trackedSegmentIds = segmentIds.length > 0 ? [...segmentIds] : (this.robot.state.map?.layers ?? [])
            .filter(layer => layer.type === MapLayer.TYPE.SEGMENT && !layer.metaData.hidden)
            .map(layer => String(layer.metaData.segmentId));
        this.activeTask = {
            id: crypto.randomUUID(),
            state: "running",
            source: target?.source ?? "robot",
            startedAt: new Date().toISOString(),
            startedAtMs: Date.now(),
            mapId: target?.mapId ?? this.robot.state.map?.metaData?.id ?? "unknown",
            pausedAt: null,
            pausedMs: 0,
            target: {
                type: segmentIds.length > 0 ? "segments" : "all",
                segmentIds: segmentIds,
                segmentNames: segmentIds.map(id => this.getSegmentName(id))
            },
            trackedSegmentIds: trackedSegmentIds,
            profile: {
                operationMode: target?.profile?.operationMode ?? operationMode ?? null,
                fanPreset: target?.profile?.fanPreset ?? fanPreset ?? null,
                waterPreset: target?.profile?.waterPreset ?? waterPreset ?? null,
                cleanRoute: target?.profile?.cleanRoute ?? route,
                iterations: target?.iterations ?? 1
            },
            rooms: {},
            currentSegmentId: null,
            // Non-sequential jobs revisit rooms instead of finishing them one at a time, so the
            // "left the room => room done" heuristic under-counts remaining time and over-counts
            // completed rooms. vacuum_then_mop is known to be non-sequential up front; Carpet First
            // (a firmware setting we can't cheaply read here) is detected empirically on first revisit.
            nonSequential: (target?.profile?.operationMode ?? operationMode) ===
                stateAttrs.PresetSelectionStateAttribute.MODE.VACUUM_THEN_MOP,
            outcome: null,
            statusFlag: status.flag
        };
        this.activeTask.targetRevision = target?.revision;
        this.startPublishTimer();
        this.handleMapUpdate(true);
        this.publish();
    }

    handleStatus(status) {
        const active = status.value === stateAttrs.StatusStateAttribute.VALUE.CLEANING;
        if (active && !this.activeTask) {
            this.startTask(status).catch(err => Logger.warn("Unable to start cleaning task tracking", err));
            return;
        }
        if (!this.activeTask) {
            return;
        }
        if (this.finishing) {
            return;
        }
        if (["stopping", "cancelling"].includes(this.activeTask.state)) {
            // The command service owns this transition and publishes a terminal outcome only
            // after firmware verification. Do not race it with status-based inference.
            return;
        }
        if (status.value === stateAttrs.StatusStateAttribute.VALUE.ERROR) {
            this.clearTerminalStatusTimer();
            if (this.activeTask.pausedAt === null) {
                this.activeTask.pausedAt = Date.now();
            }
            this.closeCurrentRoom();
            this.activeTask.state = "error";
            this.publish();
            return;
        }
        if (status.value === stateAttrs.StatusStateAttribute.VALUE.PAUSED) {
            this.clearTerminalStatusTimer();
            if (this.activeTask.pausedAt === null) {
                this.activeTask.pausedAt = Date.now();
            }
            this.closeCurrentRoom();
            this.activeTask.state = "paused";
            this.publish();
            return;
        }
        if (this.activeTask.pausedAt !== null) {
            this.activeTask.pausedMs += Date.now() - this.activeTask.pausedAt;
            this.activeTask.pausedAt = null;
        }
        if (status.value === stateAttrs.StatusStateAttribute.VALUE.RETURNING) {
            this.clearTerminalStatusTimer();
            this.closeCurrentRoom();
            this.activeTask.state = "returning";
            this.publish();
            return;
        }
        if (active) {
            this.clearTerminalStatusTimer();
            const room = this.activeTask.rooms[this.activeTask.currentSegmentId];
            if (room && !room.startedAtMs) {
                room.startedAtMs = Date.now();
            }
            this.activeTask.state = "running";
            this.publish();
            return;
        }
        // The robot is docked/returning but not finished: it is resuming after a low-battery charge
        // (RESUMABLE) or performing mid-cleanup maintenance (emptying the bin, refilling/washing,
        // swapping the mop) between passes. Keep the task open so the run stays a single record.
        if (status.value !== stateAttrs.StatusStateAttribute.VALUE.ERROR &&
            (status.flag === stateAttrs.StatusStateAttribute.FLAG.RESUMABLE || MID_CYCLE_FLAGS.has(status.flag))) {
            this.clearTerminalStatusTimer();
            this.closeCurrentRoom();
            if (status.flag === stateAttrs.StatusStateAttribute.FLAG.RESUMABLE) {
                if (this.activeTask.pausedAt === null) {
                    this.activeTask.pausedAt = Date.now();
                }
                this.activeTask.state = "paused";
            }
            this.publish();
            return;
        }
        if (this.pendingOutcome) {
            const outcome = this.pendingOutcome;
            this.pendingOutcome = null;
            this.finishTask(outcome);
            return;
        }
        this.scheduleUnconfirmedTerminalStatus();
    }

    scheduleUnconfirmedTerminalStatus() {
        if (this.terminalStatusTimer !== null || !this.activeTask) {
            return;
        }
        const taskId = this.activeTask.id;
        this.terminalStatusTimer = setTimeout(() => {
            this.terminalStatusTimer = null;
            if (this.activeTask?.id === taskId && !this.finishing) {
                // Idle/Docked confirms that the task ended, but not that it succeeded. Give a
                // vendor task-result event a short opportunity to provide the authoritative reason.
                this.finishTask("stopped");
            }
        }, this.terminalOutcomeGraceMs);
        this.terminalStatusTimer.unref?.();
    }

    clearTerminalStatusTimer() {
        if (this.terminalStatusTimer !== null) {
            clearTimeout(this.terminalStatusTimer);
            this.terminalStatusTimer = null;
        }
    }

    handleCommandState(command) {
        if (!this.activeTask || !["stop", "home"].includes(command.command)) {
            return;
        }
        if (command.state === "pending") {
            this.clearTerminalStatusTimer();
            this.transitionCommandId = command.id;
            this.preTransitionState = this.activeTask.state;
            this.activeTask.state = command.command === "home" ? "cancelling" : "stopping";
            this.publish();
            return;
        }
        if (command.id !== this.transitionCommandId) {
            return;
        }
        if (["failed", "uncertain"].includes(command.state) &&
            ["stopping", "cancelling"].includes(this.activeTask.state)) {
            const status = this.robot.state.getFirstMatchingAttributeByConstructor(stateAttrs.StatusStateAttribute);
            this.activeTask.state = status?.value === stateAttrs.StatusStateAttribute.VALUE.PAUSED ? "paused" :
                status?.value === stateAttrs.StatusStateAttribute.VALUE.RETURNING ? "returning" :
                    status?.value === stateAttrs.StatusStateAttribute.VALUE.CLEANING ? "running" :
                        this.preTransitionState ?? "running";
            this.transitionCommandId = null;
            this.preTransitionState = null;
            this.publish();
        }
    }

    getSegmentName(segmentId) {
        const layer = this.robot.state.map?.layers?.find(item =>
            item.type === MapLayer.TYPE.SEGMENT && String(item.metaData.segmentId) === String(segmentId));
        return layer?.metaData?.name ?? `Room ${segmentId}`;
    }

    detectCurrentSegment() {
        const layers = this.robot.state.map?.layers?.filter(layer => layer.type === MapLayer.TYPE.SEGMENT) ?? [];
        const active = layers.filter(layer => layer.metaData.active === true);
        if (active.length === 1) {
            return String(active[0].metaData.segmentId);
        }
        if (this.activeTask?.target.segmentIds.length === 1) {
            return this.activeTask.target.segmentIds[0];
        }
        const position = this.robot.state.map?.entities?.find(entity => entity.type === PointMapEntity.TYPE.ROBOT_POSITION);
        if (!position) {
            return null;
        }
        const x = Math.round(position.points[0] / this.robot.state.map.pixelSize);
        const y = Math.round(position.points[1] / this.robot.state.map.pixelSize);
        const positionKey = `${this.getMapGeometryVersion()}|${x}|${y}`;
        if (positionKey === this.lastDetectedPositionKey) {
            return this.lastDetectedSegment;
        }
        for (const layer of layers) {
            const runs = layer.compressedPixels ?? [];
            for (let i = 0; i < runs.length; i += 3) {
                if (runs[i + 1] === y && x >= runs[i] && x < runs[i] + runs[i + 2]) {
                    this.lastDetectedPositionKey = positionKey;
                    this.lastDetectedSegment = String(layer.metaData.segmentId);
                    return this.lastDetectedSegment;
                }
            }
        }
        this.lastDetectedPositionKey = positionKey;
        this.lastDetectedSegment = null;
        return null;
    }

    getMapGeometryVersion() {
        const map = this.robot.state.map;
        return [map?.metaData?.id ?? "unknown", map?.pixelSize ?? 0, ...(map?.layers ?? [])
            .filter(layer => layer.type === MapLayer.TYPE.SEGMENT)
            .map(layer => [layer.metaData.segmentId, layer.compressedPixels?.length ?? 0,
                layer.dimensions?.x?.min, layer.dimensions?.x?.max,
                layer.dimensions?.y?.min, layer.dimensions?.y?.max].join(":"))].join("|");
    }

    getCleaningPathPointCount() {
        let count = 0;
        for (const entity of this.robot.state.map?.entities ?? []) {
            if (entity.type === PathMapEntity.TYPE.PATH && Array.isArray(entity.points)) {
                count += entity.points.length;
            }
        }
        return count;
    }

    // True when the cleaning path has grown since the previous map update, i.e. the robot is
    // laying new trace rather than sitting docked/emptying or otherwise stationary. Returns true
    // when no path data is available (e.g. non-Dreame) so tracking falls back to position only.
    updateDrawingState() {
        const count = this.getCleaningPathPointCount();
        if (count === 0) {
            return true;
        }
        const drawing = count > this.lastPathPointCount;
        this.lastPathPointCount = count;
        return drawing;
    }

    handleMapUpdate(immediate = false) {
        this.reconcileDraftCleaningTarget();
        if (!this.activeTask || !["running", "paused"].includes(this.activeTask.state)) {
            return;
        }
        if (!immediate && Date.now() - this.lastRoomDetectionAt < ROOM_DETECTION_INTERVAL_MS) {
            return;
        }
        this.lastRoomDetectionAt = Date.now();
        // Tie room tracking to the robot actually drawing cleaning trace on the live map. When it
        // travels back to the dock to auto-empty and sits there, the path stops growing, so we
        // freeze on the current room instead of mis-attributing the transited/dock rooms (which
        // also used to inflate completedRooms and falsely flip nonSequential on resume).
        const drawing = this.updateDrawingState();
        if (!immediate && !drawing) {
            return;
        }
        const detected = this.detectCurrentSegment();
        if (detected === null) {
            return;
        }
        if (detected !== this.roomCandidate) {
            this.roomCandidate = detected;
            this.roomCandidateSince = Date.now();
            if (!immediate) {
                return;
            }
        }
        if (!immediate && Date.now() - this.roomCandidateSince < ROOM_DWELL_MS) {
            return;
        }
        if (detected === this.activeTask.currentSegmentId) {
            if (this.activeTask.state === "running" && Date.now() - this.lastEstimatePublishAt >= ESTIMATE_REFRESH_MS) {
                this.publish();
            }
            return;
        }
        this.closeCurrentRoom();
        if (this.activeTask.rooms[detected] !== undefined) {
            // Re-entering a room we already tracked => the robot is not cleaning room-by-room
            // (e.g. Carpet First). Switch to whole-job estimation for the rest of this task.
            this.activeTask.nonSequential = true;
        }
        const room = this.activeTask.rooms[detected] ?? {
            segmentId: detected,
            name: this.getSegmentName(detected),
            durationSeconds: 0,
            visits: 0,
            estimatedDurationSeconds: this.estimates[this.getEstimateKey(detected)]?.value ??
                this.getBaselineRoomEstimate(detected)
        };
        room.startedAtMs = Date.now();
        room.visits++;
        this.activeTask.rooms[detected] = room;
        this.activeTask.currentSegmentId = detected;
        this.publish();
    }

    reconcileDraftCleaningTarget() {
        const Target = stateAttrs.CleaningTargetStateAttribute;
        const target = this.robot.state.getFirstMatchingAttributeByConstructor(Target);
        if (!target || target.active || target.value !== Target.VALUE.SEGMENTS) {
            return;
        }
        const reconcileKey = `${target.revision}|${this.getMapGeometryVersion()}`;
        if (reconcileKey === this.lastDraftReconcileKey) {
            return;
        }
        this.lastDraftReconcileKey = reconcileKey;
        const availableIds = new Set((this.robot.state.map?.layers ?? [])
            .filter(layer => layer.type === MapLayer.TYPE.SEGMENT && !layer.metaData.hidden)
            .map(layer => String(layer.metaData.segmentId)));
        if (availableIds.size === 0) {
            return;
        }
        const validIds = target.segmentIds.filter(id => availableIds.has(String(id)));
        if (validIds.length === target.segmentIds.length) {
            return;
        }
        this.robot.setCleaningTarget({
            ...target,
            value: Target.VALUE.SEGMENTS,
            segmentIds: validIds,
            source: "system",
            active: false,
            expectedRevision: target.revision
        });
    }

    closeCurrentRoom() {
        const id = this.activeTask?.currentSegmentId;
        const room = id ? this.activeTask.rooms[id] : null;
        if (room?.startedAtMs) {
            room.durationSeconds += Math.max(0, Math.round((Date.now() - room.startedAtMs) / 1000));
            delete room.startedAtMs;
        }
    }

    getEstimateKey(segmentId, profile = this.activeTask?.profile, mapId = this.activeTask?.mapId ??
        this.robot.state.map?.metaData?.id ?? "unknown") {
        return [mapId, segmentId, profile?.operationMode ?? "unknown", profile?.cleanRoute ?? "unknown",
            profile?.iterations ?? 1].join("|");
    }

    learnRoom(room, profile, mapId) {
        if (room.durationSeconds < 30) {
            return;
        }
        const key = this.getEstimateKey(room.segmentId, profile, mapId);
        const previous = this.estimates[key];
        const value = previous ? previous.value * 0.8 + room.durationSeconds * 0.2 : room.durationSeconds;
        this.estimateSequence = Math.max(Date.now(), this.estimateSequence + 1);
        this.estimates[key] = {
            value: value,
            samples: Math.min(1000, (previous?.samples ?? 0) + 1),
            updatedAt: this.estimateSequence
        };
        this.pruneEstimates();
    }

    pruneEstimates() {
        const entries = Object.entries(this.estimates);
        const mapRecency = new Map();
        entries.forEach(([key, estimate], index) => {
            const mapId = key.split("|", 1)[0];
            mapRecency.set(mapId, Math.max(mapRecency.get(mapId) ?? 0, estimate.updatedAt ?? index + 1));
        });
        const retainedMaps = new Set([...mapRecency.entries()]
            .sort((left, right) => right[1] - left[1])
            .slice(0, MAX_ESTIMATE_MAPS)
            .map(([mapId]) => mapId));
        this.estimates = Object.fromEntries(entries
            .filter(([key]) => retainedMaps.has(key.split("|", 1)[0]))
            .sort((left, right) => (right[1].updatedAt ?? 0) - (left[1].updatedAt ?? 0))
            .slice(0, MAX_ESTIMATES));
    }

    getTrackedSegmentIds() {
        if (this.activeTask?.trackedSegmentIds?.length > 0) {
            return this.activeTask.trackedSegmentIds;
        }
        const segmentIds = (this.robot.state.map?.layers ?? [])
            .filter(layer => layer.type === MapLayer.TYPE.SEGMENT && !layer.metaData.hidden)
            .map(layer => String(layer.metaData.segmentId));
        if (this.activeTask && segmentIds.length > 0) {
            // If tracking began before the first complete map arrived, capture the first usable
            // room set and keep it stable for the rest of this task.
            this.activeTask.trackedSegmentIds = segmentIds;
        }
        return segmentIds;
    }

    getCompletedSegmentIds(trackedSegmentIds) {
        if (!this.activeTask || this.activeTask.nonSequential) {
            return [];
        }
        return trackedSegmentIds.filter(id => {
            const room = this.activeTask.rooms[id];
            return room !== undefined && !room.startedAtMs && id !== this.activeTask.currentSegmentId;
        });
    }

    getSegmentArea(segmentId) {
        const map = this.robot.state.map;
        const layer = map?.layers?.find(item =>
            item.type === MapLayer.TYPE.SEGMENT && !item.metaData.hidden &&
            String(item.metaData.segmentId) === String(segmentId));
        if (!layer) {
            return null;
        }
        const area = layer.metaData.area ?? layer.dimensions?.pixelCount * (map?.pixelSize ?? 0) ** 2;
        return Number.isFinite(area) && area > 0 ? area : null;
    }

    getBaselineRoomEstimate(segmentId, profile = this.activeTask?.profile) {
        if (this.robot.getManufacturer?.().toLowerCase() !== "dreame") {
            return null;
        }
        const areaCm2 = this.getSegmentArea(segmentId);
        const coverageRate = DREAME_COVERAGE_RATES_M2_PER_MINUTE[profile?.cleanRoute] ??
            DREAME_COVERAGE_RATES_M2_PER_MINUTE.routine;
        if (areaCm2 === null || !coverageRate) {
            return null;
        }
        const passFactor = DREAME_OPERATION_MODE_PASS_FACTORS[profile?.operationMode] ?? 1;
        return areaCm2 / 10_000 / coverageRate * 60 * (profile?.iterations ?? 1) * passFactor;
    }

    getRoomElapsedSeconds(segmentId) {
        const room = this.activeTask?.rooms[segmentId];
        if (!room) {
            return 0;
        }
        return room.durationSeconds + (room.startedAtMs ? (Date.now() - room.startedAtMs) / 1000 : 0);
    }

    getActiveElapsedSeconds() {
        if (!this.activeTask) {
            return 0;
        }
        let ms = Date.now() - this.activeTask.startedAtMs - this.activeTask.pausedMs;
        if (this.activeTask.pausedAt !== null) {
            ms -= Date.now() - this.activeTask.pausedAt;
        }
        return Math.max(0, ms / 1000);
    }

    getJobTotalEstimateSeconds() {
        if (!this.activeTask) {
            return null;
        }
        let total = 0;
        let found = false;
        for (const id of this.getTrackedSegmentIds()) {
            const estimate = this.estimates[this.getEstimateKey(id)]?.value ?? this.getBaselineRoomEstimate(id);
            if (estimate !== null && estimate !== undefined) {
                total += estimate;
                found = true;
            }
        }
        return found ? total : null;
    }

    getCompletedRoomCount(trackedSegmentIds) {
        if (!this.activeTask) {
            return 0;
        }
        if (this.activeTask.nonSequential) {
            // Rooms are revisited, so count completion by elapsed fraction of the total estimate
            // rather than by which rooms we've left. Never reaches totalRooms until the task ends.
            const total = this.getJobTotalEstimateSeconds();
            if (total === null || total <= 0) {
                return 0;
            }
            const fraction = Math.min(1, this.getActiveElapsedSeconds() / total);
            return Math.min(trackedSegmentIds.length - 1, Math.floor(trackedSegmentIds.length * fraction));
        }
        return trackedSegmentIds.filter(id => {
            const room = this.activeTask.rooms[id];
            return room !== undefined && !room.startedAtMs && id !== this.activeTask.currentSegmentId;
        }).length;
    }

    estimateRemaining() {
        if (!this.activeTask) {
            return null;
        }
        if (this.activeTask.nonSequential) {
            // Rooms get revisited, so per-room "done" state is unreliable. Estimate the whole job
            // against total wall-clock cleaning time instead.
            const total = this.getJobTotalEstimateSeconds();
            return total === null ? null : Math.max(0, Math.round(total - this.getActiveElapsedSeconds()));
        }
        let remaining = 0;
        let found = false;
        for (const id of this.getTrackedSegmentIds()) {
            const room = this.activeTask.rooms[id];
            if (room && !room.startedAtMs && id !== this.activeTask.currentSegmentId) {
                continue;
            }
            const learned = this.estimates[this.getEstimateKey(id)]?.value;
            const estimate = learned ?? this.getBaselineRoomEstimate(id);
            if (estimate !== null && estimate !== undefined) {
                const elapsed = id === this.activeTask.currentSegmentId ? this.getRoomElapsedSeconds(id) : 0;
                remaining += Math.max(0, estimate - elapsed);
                found = true;
            }
        }
        return found ? Math.round(remaining) : null;
    }

    publish() {
        if (!this.activeTask) {
            return;
        }
        const estimate = this.estimateRemaining();
        const trackedSegmentIds = this.getTrackedSegmentIds();
        const Attribute = stateAttrs.ActiveCleaningTaskStateAttribute;
        this.lastEstimatePublishAt = Date.now();
        this.revision++;
        const payload = {
            id: this.activeTask.id,
            state: this.activeTask.state,
            source: this.activeTask.source,
            mapId: this.activeTask.mapId,
            startedAt: this.activeTask.startedAt,
            target: {...this.activeTask.target, currentSegmentId: this.activeTask.currentSegmentId},
            profile: this.activeTask.profile,
            progress: {
                completedRooms: this.getCompletedRoomCount(trackedSegmentIds),
                completedSegmentIds: this.getCompletedSegmentIds(trackedSegmentIds),
                totalRooms: trackedSegmentIds.length,
                estimatedRemainingSeconds: estimate,
                estimatedCompletionTime: estimate === null ? null : new Date(Date.now() + estimate * 1000).toISOString()
            },
            outcome: this.activeTask.outcome,
            revision: this.revision
        };
        this.lastTaskPayload = payload;
        this.robot.state.upsertFirstMatchingAttribute(new Attribute(payload));
        this.robot.emitStateAttributesUpdated();
    }

    finishTask(outcome) {
        this.finishing = true;
        this.clearTerminalStatusTimer();
        this.closeCurrentRoom();
        const finishedTask = this.activeTask;
        this.transitionCommandId = null;
        this.preTransitionState = null;
        finishedTask.outcome = outcome;
        finishedTask.state = outcome;
        this.publish();
        const Target = stateAttrs.CleaningTargetStateAttribute;
        const currentTarget = this.robot.state.getFirstMatchingAttributeByConstructor(Target);
        if (currentTarget?.active && currentTarget.revision === finishedTask.targetRevision) {
            const retainWholeHomeMode = [Target.VALUE.ALL, Target.VALUE.AUTOMATIC].includes(currentTarget.value);
            const resetAfterInterruption = ["cancelled", "stopped"].includes(outcome);
            this.robot.setCleaningTarget({
                value: resetAfterInterruption ?
                    (retainWholeHomeMode ? currentTarget.value : Target.VALUE.ALL) : Target.VALUE.NONE,
                segmentIds: [],
                source: "task",
                active: false,
                expectedRevision: currentTarget.revision
            });
        }
        const completedAt = new Date().toISOString();
        const trackedSegmentIds = this.getTrackedSegmentIds();
        const record = {
            id: finishedTask.id,
            startedAt: finishedTask.startedAt,
            completedAt: completedAt,
            source: finishedTask.source,
            outcome: outcome,
            target: finishedTask.target,
            profile: finishedTask.profile,
            rooms: Object.values(finishedTask.rooms).map(room => ({...room, startedAtMs: undefined})),
            estimatedDurationSeconds: trackedSegmentIds.reduce((sum, id) => sum +
                (this.estimates[this.getEstimateKey(id)]?.value ?? this.getBaselineRoomEstimate(id) ?? 0), 0) || null,
            totalDurationSeconds: Math.max(0, Math.round((Date.now() - finishedTask.startedAtMs -
                finishedTask.pausedMs) / 1000))
        };
        this.stopPublishTimer();
        this.activeTask = null;
        this.finishing = false;
        let finalized = false;
        let statisticsTimer = null;
        const finalize = firmwareDuration => {
            if (finalized) {
                return;
            }
            finalized = true;
            if (statisticsTimer !== null) {
                clearTimeout(statisticsTimer);
            }
            if (Number.isFinite(firmwareDuration) && firmwareDuration > 0) {
                record.totalDurationSeconds = Math.round(firmwareDuration);
            }
            if (outcome === "completed" &&
                finishedTask.mapId === (this.robot.state.map?.metaData?.id ?? "unknown")) {
                const observedRoomDuration = record.rooms.reduce((sum, room) => sum + room.durationSeconds, 0);
                const learningScale = observedRoomDuration > 0 && Number.isFinite(firmwareDuration) && firmwareDuration > 0 ?
                    firmwareDuration / observedRoomDuration : 1;
                record.rooms.forEach(room => this.learnRoom({
                    ...room,
                    durationSeconds: room.durationSeconds * learningScale
                }, record.profile, finishedTask.mapId));
            }
            this.history.push(record);
            this.history.sort((left, right) => right.completedAt.localeCompare(left.completedAt));
            this.history.length = Math.min(this.history.length, MAX_HISTORY);
            this.scheduleSave();
        };
        const statisticsCapability = this.robot.capabilities[CurrentStatisticsCapability.TYPE];
        if (!statisticsCapability) {
            finalize(null);
            return;
        }
        statisticsTimer = setTimeout(() => finalize(null), this.statisticsTimeoutMs);
        statisticsTimer.unref?.();
        statisticsCapability.getStatistics().then(statistics => {
            finalize(statistics.find(statistic => statistic.type === ValetudoDataPoint.TYPES.TIME)?.value);
        }).catch(error => {
            Logger.debug("Unable to use firmware task time for cleaning history", error);
            finalize(null);
        });
    }

    getHistory() {
        return structuredClone(this.history);
    }
    getEstimates() {
        return structuredClone(this.estimates);
    }
    clearHistory() {
        this.history = [];
        this.estimates = {};
        this.lastTaskPayload = null;
        this.scheduleSave();
    }

    shutdown() {
        this.robot.state.unsubscribeAll(this.attributeSubscriber);
        this.robot.offMapUpdated(this.mapListener);
        this.robot.offOperationOutcome?.(this.outcomeListener);
        this.stopPublishTimer();
        this.clearTerminalStatusTimer();
        if (this.saveTimer !== null) {
            this.flush();
        }
    }
}

module.exports = CleaningTaskManager;
