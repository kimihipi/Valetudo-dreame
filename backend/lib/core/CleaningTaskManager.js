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

const MAX_HISTORY = 100;
const TASK_TERMINAL_STATES = ["completed", "cancelled", "stopped", "failed"];
const ROOM_DWELL_MS = 4_000;
const SAVE_DEBOUNCE_MS = 2_000;
const ESTIMATE_REFRESH_MS = 15_000;
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
        this.saveTimer = null;
        this.history = [];
        this.estimates = {};
        this.lastTaskPayload = null;
        const base = process.env[env.DataPath] ?? path.dirname(this.config.location ?? path.join(os.tmpdir(), "valetudo.json"));
        this.storagePath = path.join(base, "cleaning_history.json");
        this.load();

        this.attributeSubscriber = new CallbackAttributeSubscriber((eventType, attribute) => {
            if (attribute instanceof stateAttrs.StatusStateAttribute) {
                this.handleStatus(attribute);
            }
        });
        this.robot.state.subscribe(this.attributeSubscriber, {attributeClass: stateAttrs.StatusStateAttribute.name});
        this.mapListener = () => this.handleMapUpdate();
        this.robot.onMapUpdated(this.mapListener);
        this.outcomeListener = outcome => {
            this.pendingOutcome = outcome;
        };
        this.robot.onOperationOutcome?.(this.outcomeListener);
    }

    load() {
        try {
            const stored = JSON.parse(fs.readFileSync(this.storagePath, "utf8"));
            if (stored?.version === 1) {
                this.history = Array.isArray(stored.history) ? stored.history.slice(0, MAX_HISTORY) : [];
                this.estimates = stored.estimates && typeof stored.estimates === "object" ? stored.estimates : {};
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
        this.saveTimer = setTimeout(() => {
            this.saveTimer = null;
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
        }, SAVE_DEBOUNCE_MS);
    }

    async startTask(status) {
        const target = this.robot.state.getFirstMatchingAttributeByConstructor(stateAttrs.CleaningTargetStateAttribute);
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
        this.lastPathPointCount = this.getCleaningPathPointCount();
        const segmentIds = target?.value === stateAttrs.CleaningTargetStateAttribute.VALUE.SEGMENTS ?
            [...target.segmentIds] : [];
        this.activeTask = {
            id: crypto.randomUUID(),
            state: "running",
            source: target?.source ?? "robot",
            startedAt: new Date().toISOString(),
            startedAtMs: Date.now(),
            mapId: this.robot.state.map?.metaData?.id ?? "unknown",
            pausedAt: null,
            pausedMs: 0,
            target: {
                type: segmentIds.length > 0 ? "segments" : "all",
                segmentIds: segmentIds,
                segmentNames: segmentIds.map(id => this.getSegmentName(id))
            },
            profile: {
                operationMode: operationMode ?? null,
                fanPreset: fanPreset ?? null,
                waterPreset: waterPreset ?? null,
                cleanRoute: route,
                iterations: 1
            },
            rooms: {},
            currentSegmentId: null,
            // Non-sequential jobs revisit rooms instead of finishing them one at a time, so the
            // "left the room => room done" heuristic under-counts remaining time and over-counts
            // completed rooms. vacuum_then_mop is known to be non-sequential up front; Carpet First
            // (a firmware setting we can't cheaply read here) is detected empirically on first revisit.
            nonSequential: operationMode === stateAttrs.PresetSelectionStateAttribute.MODE.VACUUM_THEN_MOP,
            outcome: null,
            statusFlag: status.flag
        };
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
        if (status.value === stateAttrs.StatusStateAttribute.VALUE.PAUSED) {
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
            this.closeCurrentRoom();
            this.activeTask.state = "returning";
            this.publish();
            return;
        }
        if (active) {
            const room = this.activeTask.rooms[this.activeTask.currentSegmentId];
            if (room && !room.startedAtMs) {
                room.startedAtMs = Date.now();
            }
            this.activeTask.state = "running";
            this.publish();
            return;
        }
        if (status.flag === stateAttrs.StatusStateAttribute.FLAG.RESUMABLE) {
            this.closeCurrentRoom();
            this.publish();
            return;
        }
        const outcome = this.pendingOutcome ?? (status.value === stateAttrs.StatusStateAttribute.VALUE.ERROR ? "failed" :
            status.value === stateAttrs.StatusStateAttribute.VALUE.DOCKED ? "completed" : "stopped");
        this.pendingOutcome = null;
        this.finishTask(outcome);
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
        for (const layer of layers) {
            const runs = layer.compressedPixels ?? [];
            for (let i = 0; i < runs.length; i += 3) {
                if (runs[i + 1] === y && x >= runs[i] && x < runs[i] + runs[i + 2]) {
                    return String(layer.metaData.segmentId);
                }
            }
        }
        return null;
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
        if (!this.activeTask || !["running", "paused"].includes(this.activeTask.state)) {
            return;
        }
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

    closeCurrentRoom() {
        const id = this.activeTask?.currentSegmentId;
        const room = id ? this.activeTask.rooms[id] : null;
        if (room?.startedAtMs) {
            room.durationSeconds += Math.max(0, Math.round((Date.now() - room.startedAtMs) / 1000));
            delete room.startedAtMs;
        }
    }

    getEstimateKey(segmentId, profile = this.activeTask?.profile) {
        const mapId = this.activeTask?.mapId ?? this.robot.state.map?.metaData?.id ?? "unknown";
        return [mapId, segmentId, profile?.operationMode ?? "unknown", profile?.cleanRoute ?? "unknown",
            profile?.iterations ?? 1].join("|");
    }

    learnRoom(room, profile) {
        if (room.durationSeconds < 30) {
            return;
        }
        const key = this.getEstimateKey(room.segmentId, profile);
        const previous = this.estimates[key];
        const value = previous ? previous.value * 0.8 + room.durationSeconds * 0.2 : room.durationSeconds;
        this.estimates[key] = {value: value, samples: Math.min(1000, (previous?.samples ?? 0) + 1)};
    }

    getTrackedSegmentIds() {
        if (this.activeTask?.target.segmentIds.length > 0) {
            return this.activeTask.target.segmentIds;
        }
        return (this.robot.state.map?.layers ?? [])
            .filter(layer => layer.type === MapLayer.TYPE.SEGMENT && !layer.metaData.hidden)
            .map(layer => String(layer.metaData.segmentId));
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
        this.closeCurrentRoom();
        this.activeTask.outcome = outcome;
        this.activeTask.state = outcome;
        this.publish();
        const completedAt = new Date().toISOString();
        const record = {
            id: this.activeTask.id,
            startedAt: this.activeTask.startedAt,
            completedAt: completedAt,
            source: this.activeTask.source,
            outcome: outcome,
            target: this.activeTask.target,
            profile: this.activeTask.profile,
            rooms: Object.values(this.activeTask.rooms).map(room => ({...room, startedAtMs: undefined})),
            estimatedDurationSeconds: this.getTrackedSegmentIds().reduce((sum, id) => sum +
                (this.estimates[this.getEstimateKey(id)]?.value ?? this.getBaselineRoomEstimate(id) ?? 0), 0) || null,
            totalDurationSeconds: Math.max(0, Math.round((Date.now() - this.activeTask.startedAtMs -
                this.activeTask.pausedMs) / 1000))
        };
        const finalize = firmwareDuration => {
            if (Number.isFinite(firmwareDuration) && firmwareDuration > 0) {
                record.totalDurationSeconds = Math.round(firmwareDuration);
            }
            if (outcome === "completed" &&
                this.activeTask.mapId === (this.robot.state.map?.metaData?.id ?? "unknown")) {
                const observedRoomDuration = record.rooms.reduce((sum, room) => sum + room.durationSeconds, 0);
                const learningScale = observedRoomDuration > 0 && Number.isFinite(firmwareDuration) && firmwareDuration > 0 ?
                    firmwareDuration / observedRoomDuration : 1;
                record.rooms.forEach(room => this.learnRoom({
                    ...room,
                    durationSeconds: room.durationSeconds * learningScale
                }, record.profile));
            }
            this.history.unshift(record);
            this.history.length = Math.min(this.history.length, MAX_HISTORY);
            this.scheduleSave();
            this.activeTask = null;
            this.finishing = false;
        };
        const statisticsCapability = this.robot.capabilities[CurrentStatisticsCapability.TYPE];
        if (!statisticsCapability) {
            finalize(null);
            return;
        }
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
        if (this.saveTimer !== null) {
            clearTimeout(this.saveTimer);
        }
    }
}

module.exports = CleaningTaskManager;
