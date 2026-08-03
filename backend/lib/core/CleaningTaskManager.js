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
// resetting room positioning. RESUMABLE is handled separately.
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
const CLEANING_PHASE_BY_STATUS_FLAG = new Map([
    [stateAttrs.StatusStateAttribute.FLAG.VACUUMING, stateAttrs.PresetSelectionStateAttribute.MODE.VACUUM],
    [stateAttrs.StatusStateAttribute.FLAG.MOPPING, stateAttrs.PresetSelectionStateAttribute.MODE.MOP],
    [
        stateAttrs.StatusStateAttribute.FLAG.VACUUMING_AND_MOPPING,
        stateAttrs.PresetSelectionStateAttribute.MODE.VACUUM_AND_MOP
    ],
]);
const SEPARATE_CLEANING_PHASES = new Set([
    stateAttrs.PresetSelectionStateAttribute.MODE.VACUUM,
    stateAttrs.PresetSelectionStateAttribute.MODE.MOP,
]);

// Entity types that represent trace the robot has actually driven (as opposed to PREDICTED_PATH,
// which is a projected go-to route). Used to detect whether the robot is still laying new path.
const TRAVELED_PATH_TYPES = [
    PathMapEntity.TYPE.PATH,
    PathMapEntity.TYPE.MOP_PATH,
    PathMapEntity.TYPE.VACUUM_AND_MOP_PATH,
];

const MAX_HISTORY = 50;
const TASK_TERMINAL_STATES = ["completed", "cancelled", "stopped", "failed"];
const ROOM_DWELL_MS = 4_000;
const SAVE_DEBOUNCE_MS = 2_000;
const ESTIMATE_REFRESH_MS = 15_000;
const STATISTICS_TIMEOUT_MS = 5_000;
const TERMINAL_OUTCOME_GRACE_MS = 2_000;
const ROOM_DETECTION_INTERVAL_MS = 1_000;
const ROOM_BOUNDARY_TOLERANCE_PIXELS = 2;
const PATH_CONFIRMATION_DISTANCE_CM = 50;
const PATH_CONFIRMATION_UPDATES = 2;
const PATH_SAMPLE_DISTANCE_CM = 25;
const MAX_PATH_SAMPLES_PER_UPDATE = 24;
const DEFAULT_COVERAGE_RATE_M2_PER_MINUTE = 1;
const FIRMWARE_TARGET_TYPES = Object.freeze({
    [stateAttrs.StatusStateAttribute.FLAG.ZONE]: "zones",
    [stateAttrs.StatusStateAttribute.FLAG.SEGMENT]: "segments",
    [stateAttrs.StatusStateAttribute.FLAG.SPOT]: "spot"
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
        this.pathTrackers = new Map();
        this.pathCandidate = null;
        this.pathCandidateDistance = 0;
        this.pathCandidateUpdates = 0;
        this.segmentRowIndex = new Map();
        this.segmentIndexGeometryVersion = null;
        this.lastEstimatePublishAt = 0;
        this.lastRoomDetectionAt = 0;
        this.lastDetectedPositionKey = null;
        this.lastDetectedSegment = null;
        this.saveTimer = null;
        this.publishTimer = null;
        this.estimateRefreshMs = options.estimateRefreshMs ?? ESTIMATE_REFRESH_MS;
        this.statisticsTimeoutMs = options.statisticsTimeoutMs ?? STATISTICS_TIMEOUT_MS;
        this.terminalOutcomeGraceMs = options.terminalOutcomeGraceMs ?? TERMINAL_OUTCOME_GRACE_MS;
        this.history = [];
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
            if (outcome === "completed" && this.isAwaitingMoppingPhase()) {
                // Dreame reports the vacuum pass as a completed cleanup before it docks and starts
                // the mop pass. That is a phase outcome, not the outcome of the shared task.
                this.pendingOutcome = null;
                return;
            }
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
            }
        } catch (e) {
            if (e?.code !== "ENOENT") {
                Logger.warn("Unable to load cleaning history", e);
            }
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
                history: this.history
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
        this.resetPathTracking();
        const segmentIds = target?.value === stateAttrs.CleaningTargetStateAttribute.VALUE.SEGMENTS ?
            [...target.segmentIds] : [];
        const targetType = [
            stateAttrs.CleaningTargetStateAttribute.VALUE.ALL,
            stateAttrs.CleaningTargetStateAttribute.VALUE.AUTOMATIC,
            stateAttrs.CleaningTargetStateAttribute.VALUE.SEGMENTS,
            stateAttrs.CleaningTargetStateAttribute.VALUE.ZONES
        ].includes(target?.value) ? target.value :
            FIRMWARE_TARGET_TYPES[status.flag] ?? status.metaData.cleaningTargetType ?? "all";
        const trackedSegmentIds = segmentIds.length > 0 ? [...segmentIds] : (this.robot.state.map?.layers ?? [])
            .filter(layer => layer.type === MapLayer.TYPE.SEGMENT && !layer.metaData.hidden)
            .map(layer => String(layer.metaData.segmentId));
        const effectiveOperationMode = target?.profile?.operationMode ?? operationMode ?? null;
        const currentPhase = effectiveOperationMode === stateAttrs.PresetSelectionStateAttribute.MODE.VACUUM_AND_MOP ?
            stateAttrs.PresetSelectionStateAttribute.MODE.VACUUM_AND_MOP :
            (CLEANING_PHASE_BY_STATUS_FLAG.get(status.flag) ?? null);
        this.activeTask = {
            id: crypto.randomUUID(),
            state: "running",
            // An active target is published by a Valetudo control surface before it starts the
            // robot. If cleaning begins without one, it came from the firmware itself (button,
            // onboard schedule, vendor automation, etc.).
            source: !target || target.source === "robot" ? "firmware" : target.source,
            startedAt: new Date().toISOString(),
            startedAtMs: Date.now(),
            mapId: target?.mapId ?? this.robot.state.map?.metaData?.id ?? "unknown",
            pausedAt: null,
            pausedMs: 0,
            target: {
                type: targetType,
                segmentIds: segmentIds,
                segmentNames: segmentIds.map(id => this.getSegmentName(id))
            },
            trackedSegmentIds: trackedSegmentIds,
            profile: {
                operationMode: effectiveOperationMode,
                fanPreset: target?.profile?.fanPreset ?? fanPreset ?? null,
                waterPreset: target?.profile?.waterPreset ?? waterPreset ?? null,
                cleanRoute: target?.profile?.cleanRoute ?? route,
                iterations: target?.iterations ?? 1
            },
            rooms: {},
            completedSegmentIds: [],
            currentSegmentId: null,
            currentPhase: currentPhase,
            passVisitedSegmentIds: [],
            // A revisit within the same vacuuming or mopping pass means the task is not proceeding
            // room-by-room (e.g. Carpet First), so exact room ordinals are no longer reliable.
            nonSequential: false,
            estimatedDurationSeconds: null,
            phaseEstimatedDurationSeconds: {},
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
        const firmwareTargetType = status.metaData.cleaningTargetType;
        if (this.activeTask.source === "firmware" && this.activeTask.target.type === "all" &&
            ["zones", "segments", "spot"].includes(firmwareTargetType)) {
            this.activeTask.target.type = firmwareTargetType;
        }
        if (["stopping", "cancelling"].includes(this.activeTask.state)) {
            // The command service owns this transition and publishes a terminal outcome only
            // after firmware verification. Do not race it with status-based inference.
            return;
        }
        if (active) {
            this.updateCleaningPhase(status.flag);
        }
        if (status.value === stateAttrs.StatusStateAttribute.VALUE.ERROR) {
            this.clearTerminalStatusTimer();
            if (this.activeTask.pausedAt === null) {
                this.activeTask.pausedAt = Date.now();
            }
            this.activeTask.state = "error";
            this.publish();
            return;
        }
        if (status.value === stateAttrs.StatusStateAttribute.VALUE.PAUSED) {
            this.clearTerminalStatusTimer();
            if (this.activeTask.pausedAt === null) {
                this.activeTask.pausedAt = Date.now();
            }
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
            this.activeTask.state = "returning";
            this.publish();
            return;
        }
        if (active) {
            this.clearTerminalStatusTimer();
            if (this.activeTask.state !== "running") {
                // Discard path accumulated while paused, returning, or at the dock. Only trace
                // drawn after active cleaning resumes may confirm the next room.
                this.resetPathTracking();
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
            if (status.flag === stateAttrs.StatusStateAttribute.FLAG.RESUMABLE) {
                if (this.activeTask.pausedAt === null) {
                    this.activeTask.pausedAt = Date.now();
                }
                this.activeTask.state = "paused";
            }
            this.publish();
            return;
        }
        if (status.value === stateAttrs.StatusStateAttribute.VALUE.DOCKED && this.isAwaitingMoppingPhase()) {
            // Some Dreame firmwares briefly expose an unflagged docked state between the vacuum
            // and mop passes. Keep the shared task open until mopping starts.
            this.clearTerminalStatusTimer();
            if (this.activeTask.pausedAt === null) {
                this.activeTask.pausedAt = Date.now();
            }
            this.activeTask.state = "paused";
            this.publish();
            return;
        }
        if (this.pendingOutcome) {
            const outcome = this.pendingOutcome;
            this.pendingOutcome = null;
            this.finishTask(outcome);
            return;
        }
        const vendorGraceMs = status.metaData.operationOutcomeGraceMs;
        if (Number.isFinite(vendorGraceMs)) {
            this.clearTerminalStatusTimer();
        }
        const vendorFallbackOutcome = TASK_TERMINAL_STATES.includes(status.metaData.operationOutcomeFallback) ?
            status.metaData.operationOutcomeFallback : "stopped";
        this.scheduleUnconfirmedTerminalStatus(vendorGraceMs, vendorFallbackOutcome);
    }

    isAwaitingMoppingPhase() {
        return this.activeTask?.profile.operationMode ===
                stateAttrs.PresetSelectionStateAttribute.MODE.VACUUM_THEN_MOP &&
            this.activeTask.currentPhase === stateAttrs.PresetSelectionStateAttribute.MODE.VACUUM;
    }

    updateCleaningPhase(statusFlag) {
        if (!this.activeTask) {
            return;
        }
        const operationMode = this.activeTask.profile.operationMode;
        const nextPhase = operationMode === stateAttrs.PresetSelectionStateAttribute.MODE.VACUUM_AND_MOP ?
            stateAttrs.PresetSelectionStateAttribute.MODE.VACUUM_AND_MOP :
            CLEANING_PHASE_BY_STATUS_FLAG.get(statusFlag);
        if (nextPhase === undefined) {
            return;
        }
        if (this.activeTask.currentPhase === null) {
            this.activeTask.currentPhase = nextPhase;
            return;
        }
        if (this.activeTask.currentPhase === nextPhase) {
            return;
        }

        const shouldRestartRoomOrdinals =
            operationMode === stateAttrs.PresetSelectionStateAttribute.MODE.VACUUM_THEN_MOP &&
            SEPARATE_CLEANING_PHASES.has(this.activeTask.currentPhase) &&
            SEPARATE_CLEANING_PHASES.has(nextPhase);
        if (shouldRestartRoomOrdinals && Number.isFinite(this.activeTask.estimatedDurationSeconds)) {
            this.activeTask.phaseEstimatedDurationSeconds[this.activeTask.currentPhase] =
                this.activeTask.estimatedDurationSeconds;
        }
        this.activeTask.currentPhase = nextPhase;
        if (!shouldRestartRoomOrdinals) {
            return;
        }
        this.activeTask.completedSegmentIds = [];
        this.activeTask.currentSegmentId = null;
        this.activeTask.passVisitedSegmentIds = [];
        this.roomCandidate = null;
        this.roomCandidateSince = 0;
        this.resetPathTracking();
    }

    scheduleUnconfirmedTerminalStatus(vendorGraceMs, fallbackOutcome = "stopped") {
        if (this.terminalStatusTimer !== null || !this.activeTask) {
            return;
        }
        const graceMs = Number.isFinite(vendorGraceMs) ? Math.max(0, vendorGraceMs) : this.terminalOutcomeGraceMs;
        const taskId = this.activeTask.id;
        this.terminalStatusTimer = setTimeout(() => {
            this.terminalStatusTimer = null;
            if (this.activeTask?.id === taskId && !this.finishing) {
                // Idle/Docked confirms that the task ended, but not that it succeeded. Give a
                // vendor task-result event a short opportunity to provide the authoritative reason.
                this.finishTask(fallbackOutcome);
            }
        }, graceMs);
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
        this.ensureSegmentRowIndex();
        const x = Math.round(position.points[0] / this.robot.state.map.pixelSize);
        const y = Math.round(position.points[1] / this.robot.state.map.pixelSize);
        const positionKey = `${this.segmentIndexGeometryVersion}|${x}|${y}`;
        if (positionKey === this.lastDetectedPositionKey) {
            return this.lastDetectedSegment;
        }
        const detected = this.findSegmentAtPixel(x, y, ROOM_BOUNDARY_TOLERANCE_PIXELS, true);
        this.lastDetectedPositionKey = positionKey;
        this.lastDetectedSegment = detected;
        return detected;
    }

    getMapGeometryVersion() {
        const map = this.robot.state.map;
        return [map?.metaData?.id ?? "unknown", map?.pixelSize ?? 0, ...(map?.layers ?? [])
            .filter(layer => layer.type === MapLayer.TYPE.SEGMENT)
            .map(layer => [layer.metaData.segmentId, layer.compressedPixels?.length ?? 0,
                layer.dimensions?.x?.min, layer.dimensions?.x?.max,
                layer.dimensions?.y?.min, layer.dimensions?.y?.max].join(":"))].join("|");
    }

    ensureSegmentRowIndex() {
        const geometryVersion = this.getMapGeometryVersion();
        if (geometryVersion === this.segmentIndexGeometryVersion) {
            return;
        }
        const rows = new Map();
        for (const layer of this.robot.state.map?.layers ?? []) {
            if (layer.type !== MapLayer.TYPE.SEGMENT || layer.metaData.hidden) {
                continue;
            }
            const segmentId = String(layer.metaData.segmentId);
            const runs = layer.compressedPixels ?? [];
            for (let i = 0; i < runs.length; i += 3) {
                const row = runs[i + 1];
                const intervals = rows.get(row) ?? [];
                intervals.push({start: runs[i], end: runs[i] + runs[i + 2] - 1, segmentId: segmentId});
                rows.set(row, intervals);
            }
        }
        for (const intervals of rows.values()) {
            intervals.sort((a, b) => a.start - b.start);
        }
        this.segmentRowIndex = rows;
        this.segmentIndexGeometryVersion = geometryVersion;
        this.lastDetectedPositionKey = null;
        this.lastDetectedSegment = null;
    }

    findSegmentAtPixel(x, y, tolerance = 0, indexReady = false) {
        if (!indexReady) {
            this.ensureSegmentRowIndex();
        }
        for (let radius = 0; radius <= tolerance; radius++) {
            let closest = null;
            for (let row = y - radius; row <= y + radius; row++) {
                for (const interval of this.segmentRowIndex.get(row) ?? []) {
                    const horizontalDistance = x < interval.start ? interval.start - x :
                        x > interval.end ? x - interval.end : 0;
                    const distance = horizontalDistance + Math.abs(row - y);
                    if (distance <= radius && (closest === null || distance < closest.distance)) {
                        closest = {distance: distance, segmentId: interval.segmentId};
                    }
                }
            }
            if (closest !== null) {
                return closest.segmentId;
            }
        }
        return null;
    }

    getTraveledPathEntities() {
        return (this.robot.state.map?.entities ?? []).filter(entity =>
            TRAVELED_PATH_TYPES.includes(entity.type) && Array.isArray(entity.points));
    }

    resetPathTracking() {
        this.pathTrackers.clear();
        const typeOccurrences = new Map();
        for (const entity of this.getTraveledPathEntities()) {
            const occurrence = typeOccurrences.get(entity.type) ?? 0;
            typeOccurrences.set(entity.type, occurrence + 1);
            const key = `${entity.type}:${occurrence}`;
            this.pathTrackers.set(key, {
                pointCount: entity.points.length,
                lastX: entity.points.at(-2),
                lastY: entity.points.at(-1)
            });
        }
        this.pathCandidate = null;
        this.pathCandidateDistance = 0;
        this.pathCandidateUpdates = 0;
    }

    collectPathRoomEvidence() {
        const entities = this.getTraveledPathEntities();
        this.ensureSegmentRowIndex();
        const nextTrackers = new Map();
        const typeOccurrences = new Map();
        const evidence = new Map();
        const trackedSegmentIds = new Set(this.getTrackedSegmentIds());
        let samplesRemaining = MAX_PATH_SAMPLES_PER_UPDATE;
        let tailSegmentId = null;

        for (const entity of entities) {
            const occurrence = typeOccurrences.get(entity.type) ?? 0;
            typeOccurrences.set(entity.type, occurrence + 1);
            const key = `${entity.type}:${occurrence}`;
            const previous = this.pathTrackers.get(key);
            const points = entity.points;
            let start = 0;
            if (previous) {
                const prefixUnchanged = previous.pointCount <= points.length && previous.pointCount >= 2 &&
                    points[previous.pointCount - 2] === previous.lastX &&
                    points[previous.pointCount - 1] === previous.lastY;
                // A shorter/replaced path is a new baseline, not newly traveled distance.
                start = prefixUnchanged ? previous.pointCount : points.length;
            }
            nextTrackers.set(key, {
                pointCount: points.length,
                lastX: points.at(-2),
                lastY: points.at(-1)
            });

            if (start >= points.length) {
                continue;
            }
            start = Math.max(start, 2);
            const pixelSize = this.robot.state.map?.pixelSize;
            if (!Number.isFinite(pixelSize) || pixelSize <= 0) {
                continue;
            }
            const endpointSegmentId = this.findSegmentAtPixel(
                Math.round(points.at(-2) / pixelSize), Math.round(points.at(-1) / pixelSize),
                ROOM_BOUNDARY_TOLERANCE_PIXELS, true
            );
            if (endpointSegmentId !== null && trackedSegmentIds.has(endpointSegmentId)) {
                tailSegmentId = endpointSegmentId;
            }
            for (let i = start; i < points.length && samplesRemaining > 0; i += 2) {
                const fromX = points[i - 2];
                const fromY = points[i - 1];
                const toX = points[i];
                const toY = points[i + 1];
                const distance = Math.hypot(toX - fromX, toY - fromY);
                const sampleCount = Math.max(1, Math.min(samplesRemaining,
                    Math.ceil(distance / PATH_SAMPLE_DISTANCE_CM)));
                for (let sample = 1; sample <= sampleCount; sample++) {
                    const ratio = sample / sampleCount;
                    const x = fromX + (toX - fromX) * ratio;
                    const y = fromY + (toY - fromY) * ratio;
                    const segmentId = this.findSegmentAtPixel(
                        Math.round(x / pixelSize), Math.round(y / pixelSize), ROOM_BOUNDARY_TOLERANCE_PIXELS, true
                    );
                    if (segmentId !== null && trackedSegmentIds.has(segmentId)) {
                        const roomEvidence = evidence.get(segmentId) ?? {distance: 0, samples: 0};
                        roomEvidence.distance += distance / sampleCount;
                        roomEvidence.samples++;
                        evidence.set(segmentId, roomEvidence);
                    }
                }
                samplesRemaining -= sampleCount;
            }
        }
        this.pathTrackers = nextTrackers;

        if (tailSegmentId === null && evidence.size > 0) {
            tailSegmentId = [...evidence.entries()].sort((a, b) =>
                b[1].distance - a[1].distance || b[1].samples - a[1].samples)[0][0];
        }
        return {
            hasPathData: entities.some(entity => entity.points.length >= 2),
            segmentId: tailSegmentId,
            distance: tailSegmentId === null ? 0 : evidence.get(tailSegmentId)?.distance ?? 0
        };
    }

    confirmPathCandidate(evidence) {
        if (evidence.segmentId === null) {
            return null;
        }
        if (evidence.segmentId !== this.pathCandidate) {
            this.pathCandidate = evidence.segmentId;
            this.pathCandidateDistance = evidence.distance;
            this.pathCandidateUpdates = 1;
        } else {
            this.pathCandidateDistance += evidence.distance;
            this.pathCandidateUpdates++;
        }
        return this.pathCandidateDistance >= PATH_CONFIRMATION_DISTANCE_CM ||
            this.pathCandidateUpdates >= PATH_CONFIRMATION_UPDATES ? this.pathCandidate : null;
    }

    handleMapUpdate(immediate = false) {
        if (!this.activeTask || this.activeTask.state !== "running") {
            return;
        }
        if (!immediate && Date.now() - this.lastRoomDetectionAt < ROOM_DETECTION_INTERVAL_MS) {
            return;
        }
        this.lastRoomDetectionAt = Date.now();
        // Newly drawn trace is room-local proof of cleaning. Position/dwell remains a fallback for
        // vendors that do not expose traveled paths at all.
        const pathEvidence = this.collectPathRoomEvidence();
        const detected = pathEvidence.hasPathData ? this.confirmPathCandidate(pathEvidence) :
            this.detectCurrentSegment();
        if (detected === null) {
            return;
        }
        if (!pathEvidence.hasPathData && detected !== this.roomCandidate) {
            this.roomCandidate = detected;
            this.roomCandidateSince = Date.now();
            if (!immediate) {
                return;
            }
        }
        if (!pathEvidence.hasPathData && !immediate && Date.now() - this.roomCandidateSince < ROOM_DWELL_MS) {
            return;
        }
        if (detected === this.activeTask.currentSegmentId) {
            if (this.activeTask.state === "running" && Date.now() - this.lastEstimatePublishAt >= ESTIMATE_REFRESH_MS) {
                this.publish();
            }
            return;
        }
        if (this.activeTask.currentSegmentId !== null &&
            !this.activeTask.completedSegmentIds.includes(this.activeTask.currentSegmentId)) {
            this.activeTask.completedSegmentIds.push(this.activeTask.currentSegmentId);
        }
        if (this.activeTask.passVisitedSegmentIds.includes(detected)) {
            // Re-entering a room during the same pass => the robot is not cleaning room-by-room
            // (e.g. Carpet First). A vacuum-then-mop phase change resets the pass-local list.
            this.activeTask.nonSequential = true;
            this.activeTask.completedSegmentIds = [];
        }
        if (!this.activeTask.passVisitedSegmentIds.includes(detected)) {
            this.activeTask.passVisitedSegmentIds.push(detected);
        }
        const room = this.activeTask.rooms[detected] ?? {
            segmentId: detected,
            name: this.getSegmentName(detected),
            visits: 0
        };
        room.visits++;
        this.activeTask.rooms[detected] = room;
        this.activeTask.currentSegmentId = detected;
        this.publish();
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
        return trackedSegmentIds.filter(id => this.activeTask.completedSegmentIds.includes(id));
    }

    getCurrentRoomNumber(trackedSegmentIds) {
        if (!this.activeTask || this.activeTask.nonSequential || this.activeTask.currentSegmentId === null ||
            !trackedSegmentIds.includes(this.activeTask.currentSegmentId)) {
            return null;
        }
        return Math.min(trackedSegmentIds.length,
            this.getCompletedRoomCount(trackedSegmentIds) + 1);
    }

    getFallbackTotalEstimateSeconds() {
        if (!this.activeTask) {
            return null;
        }
        const map = this.robot.state.map;
        const trackedIds = new Set(this.getTrackedSegmentIds().map(String));
        const areaCm2 = (map?.layers ?? []).filter(layer =>
            layer.type === MapLayer.TYPE.SEGMENT && !layer.metaData.hidden &&
            trackedIds.has(String(layer.metaData.segmentId))
        ).reduce((total, layer) => {
            const area = layer.metaData.area ?? layer.dimensions?.pixelCount * (map?.pixelSize ?? 0) ** 2;
            return total + (Number.isFinite(area) && area > 0 ? area : 0);
        }, 0);
        return areaCm2 > 0 ? areaCm2 / 10_000 / DEFAULT_COVERAGE_RATE_M2_PER_MINUTE * 60 : null;
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

    getCompletedRoomCount(trackedSegmentIds) {
        if (!this.activeTask) {
            return 0;
        }
        if (this.activeTask.nonSequential) {
            return 0;
        }
        return this.getCompletedSegmentIds(trackedSegmentIds).length;
    }

    estimateRemaining(completedPercent, cleaningElapsedSeconds) {
        if (!this.activeTask) {
            return null;
        }
        if (Number.isFinite(completedPercent)) {
            if (completedPercent === 100) {
                return 0;
            }
            if (completedPercent >= 5 && Number.isFinite(cleaningElapsedSeconds) && cleaningElapsedSeconds > 0) {
                return Math.max(0, Math.round(
                    cleaningElapsedSeconds * (100 - completedPercent) / completedPercent
                ));
            }
        }
        const total = this.getFallbackTotalEstimateSeconds();
        if (total === null) {
            return null;
        }
        if (Number.isFinite(cleaningElapsedSeconds) && cleaningElapsedSeconds > 0) {
            return Math.max(0, Math.round(total - cleaningElapsedSeconds));
        }
        if (Number.isFinite(completedPercent)) {
            return Math.max(0, Math.round(total * (1 - completedPercent / 100)));
        }
        return Math.max(0, Math.round(total - this.getActiveElapsedSeconds()));
    }

    publish() {
        if (!this.activeTask) {
            return;
        }
        const status = this.robot.state.getFirstMatchingAttributeByConstructor(stateAttrs.StatusStateAttribute);
        const completedPercent = Number.isFinite(status?.metaData?.completedPercent) ?
            Math.max(0, Math.min(100, status.metaData.completedPercent)) : undefined;
        const cleaningElapsedSeconds = Number.isFinite(status?.metaData?.cleaningElapsedSeconds) ?
            Math.max(0, status.metaData.cleaningElapsedSeconds) : undefined;
        const estimate = this.estimateRemaining(completedPercent, cleaningElapsedSeconds);
        if (estimate !== null && completedPercent !== 100) {
            const firmwareCalibrated = Number.isFinite(completedPercent) && completedPercent >= 5 &&
                Number.isFinite(cleaningElapsedSeconds) && cleaningElapsedSeconds > 0;
            const total = firmwareCalibrated ? cleaningElapsedSeconds + estimate :
                this.getFallbackTotalEstimateSeconds();
            const mayUpdateTaskEstimate = status?.value === stateAttrs.StatusStateAttribute.VALUE.CLEANING ||
                this.activeTask.estimatedDurationSeconds === null;
            if (total !== null && mayUpdateTaskEstimate) {
                this.activeTask.estimatedDurationSeconds = Math.round(total);
                if (this.activeTask.currentPhase !== null) {
                    this.activeTask.phaseEstimatedDurationSeconds[this.activeTask.currentPhase] = Math.round(total);
                }
            }
        }
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
                currentRoomNumber: this.getCurrentRoomNumber(trackedSegmentIds),
                totalRooms: trackedSegmentIds.length,
                sequential: !this.activeTask.nonSequential,
                completedPercent: completedPercent,
                estimatedRemainingSeconds: estimate,
                estimatedCompletionTime: estimate === null ? null : new Date(Date.now() + estimate * 1000).toISOString()
            },
            outcome: this.activeTask.outcome,
            revision: this.revision
        };
        this.robot.state.upsertFirstMatchingAttribute(new Attribute(payload));
        this.robot.emitStateAttributesUpdated();
    }

    finishTask(outcome) {
        this.finishing = true;
        this.clearTerminalStatusTimer();
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
            this.robot.setCleaningTarget({
                value: retainWholeHomeMode ? currentTarget.value : Target.VALUE.ALL,
                segmentIds: [],
                source: "task",
                active: false,
                expectedRevision: currentTarget.revision
            });
        }
        const completedAt = new Date().toISOString();
        const separatePhaseEstimates = [
            stateAttrs.PresetSelectionStateAttribute.MODE.VACUUM,
            stateAttrs.PresetSelectionStateAttribute.MODE.MOP
        ].map(phase => finishedTask.phaseEstimatedDurationSeconds[phase]);
        const estimatedDurationSeconds =
            finishedTask.profile.operationMode === stateAttrs.PresetSelectionStateAttribute.MODE.VACUUM_THEN_MOP &&
            separatePhaseEstimates.every(Number.isFinite) ?
                separatePhaseEstimates.reduce((total, estimate) => total + estimate, 0) :
                finishedTask.estimatedDurationSeconds;
        const record = {
            id: finishedTask.id,
            startedAt: finishedTask.startedAt,
            completedAt: completedAt,
            source: finishedTask.source,
            outcome: outcome,
            target: finishedTask.target,
            profile: finishedTask.profile,
            rooms: Object.values(finishedTask.rooms),
            estimatedDurationSeconds: estimatedDurationSeconds,
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
            // Dreame resets its current-cleaning timer between the vacuum and mop passes. Using
            // that value here would store only the final phase instead of the full shared task.
            if (finishedTask.profile.operationMode !== stateAttrs.PresetSelectionStateAttribute.MODE.VACUUM_THEN_MOP &&
                Number.isFinite(firmwareDuration) && firmwareDuration > 0) {
                record.totalDurationSeconds = Math.round(firmwareDuration);
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
    clearHistory() {
        this.history = [];
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
