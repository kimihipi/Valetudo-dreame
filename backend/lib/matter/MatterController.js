const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Semaphore = require("semaphore");

const BasicControlCapability = require("../core/capabilities/BasicControlCapability");
const CallbackAttributeSubscriber = require("../entities/CallbackAttributeSubscriber");
const CleanRouteControlCapability = require("../core/capabilities/CleanRouteControlCapability");
const ConsumableMonitoringCapability = require("../core/capabilities/ConsumableMonitoringCapability");
const CurrentStatisticsCapability = require("../core/capabilities/CurrentStatisticsCapability");
const env = require("../res/env");
const FanSpeedControlCapability = require("../core/capabilities/FanSpeedControlCapability");
const LocateCapability = require("../core/capabilities/LocateCapability");
const Logger = require("../Logger");
const MapLayer = require("../entities/map/MapLayer");
const MapSegmentationCapability = require("../core/capabilities/MapSegmentationCapability");
const MopDockMopDryingTimeControlCapability = require("../core/capabilities/MopDockMopDryingTimeControlCapability");
const OperationModeControlCapability = require("../core/capabilities/OperationModeControlCapability");
const PointMapEntity = require("../entities/map/entities/PointMapEntity");
const stateAttrs = require("../entities/state/attributes");
const Tools = require("../utils/Tools");
const ValetudoConsumable = require("../entities/core/ValetudoConsumable");
const ValetudoDataPoint = require("../entities/core/ValetudoDataPoint");
const ValetudoRobotError = require("../entities/core/ValetudoRobotError");
const WaterUsageControlCapability = require("../core/capabilities/WaterUsageControlCapability");

// matter.js has to be required at MatterController module-load time (i.e. during
// new Valetudo()), not lazily from start(). backend/index.js runs
// Object.freeze(Object.prototype) synchronously right after new Valetudo(),
// and matter.js's namespace-emulation pattern (`Bytes.toString = ...`) then
// blows up in strict mode because the inherited Object.prototype.toString
// has become non-writable.
//
// The generated bundle contains only the Matter runtime entry points used by
// Valetudo and avoids pkg having to resolve matter.js package-import aliases.
/** @type {any} */
let matterModules = null;
/** @type {any} */
let matterLoadError = null;
try {
    // The generated bundle is a build artifact that may not exist yet during type-checking
    // (it is produced by util/build_matter_bundle.mjs at build time and is gitignored).
    // @ts-ignore
    matterModules = require("./MatterRuntime.generated");
} catch (e) {
    matterLoadError = e;
}

const STATE = Object.freeze({
    DISABLED: "disabled",
    STARTING: "starting",
    READY: "ready",
    ERROR: "error"
});

const STORAGE_SUBDIR = "matter";
const NODE_ID = "valetudo";
const CLEAN_MODE_VERIFICATION_ATTEMPTS = 3;
const CLEAN_MODE_VERIFICATION_DELAY_MS = 150;
const STATE_SYNC_DEBOUNCE_MS = 75;
const MAP_STATE_SYNC_INTERVAL_MS = 2_000;
const SERVICE_AREA_TOPOLOGY_INTERVAL_MS = 10_000;
const ROOM_DETECTION_INTERVAL_MS = 5_000;
const FILTER_RESOURCE_POLL_INTERVAL_MS = 300_000;
const AUXILIARY_REFRESH_INTERVAL_MS = 30_000;
const MATTER_TRANSACTION_RETRY_MS = 100;
const MATTER_STORAGE_LOCK_RETRY_MS = 250;
const MATTER_STORAGE_LOCK_RETRY_ATTEMPTS = 40;
const TARGETED_SYNC_DELAY_MS = 25;
const TARGETED_SYNC_MAX_RETRIES = 20;
const CLEAN_MODE_STORAGE_SCHEMA = 3;
const CLEAN_MODE_IDS = Object.freeze({
    vacuum: 0,
    mop: 16,
    combined: 32
});
const MATTER_PHASES = Object.freeze([
    "Cleaning",
    "Returning",
    "Charging",
    "Mop washing",
    "Auto-emptying",
    "Drying",
    "Idle"
]);
const STATE_VALUES_EQUAL = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const IS_SYNCHRONOUS_TRANSACTION_CONFLICT = error =>
    error?.constructor?.name === "SynchronousTransactionConflictError" ||
    (typeof error?.message === "string" && error.message.includes("Cannot lock ") &&
        error.message.includes(" synchronously"));
const IS_MATTER_STORAGE_LOCK_ERROR = error =>
    error?.constructor?.name === "StorageLockError" ||
    (typeof error?.message === "string" && (
        error.message.includes("Storage is locked by another process") ||
        error.message.includes("Storage is already locked by this process")
    ));

class MatterController {
    /**
     * Step-2 lifecycle: dynamically loads matter.js when the user enables Matter,
     * boots a ServerNode as a Robot Vacuum Cleaner device using static defaults,
     * and exposes commissioning info (QR + manual code + fabric list) so a
     * commissioner can pair. No Valetudo capability/state wiring yet — that
     * lands in step 3.
     *
     * @param {object} options
     * @param {import("../core/ValetudoRobot")} options.robot
     * @param {import("../Configuration")} options.config
     * @param {import("../ValetudoEventStore")} options.valetudoEventStore
     * @param {import("../utils/ValetudoHelper")} options.valetudoHelper
     * @param {import("../core/CleaningTaskManager")} options.cleaningTaskManager
     * @param {import("../core/CleaningTaskService")} options.cleaningTaskService
     */
    constructor(options) {
        this.config = options.config;
        this.robot = options.robot;
        this.valetudoEventStore = options.valetudoEventStore;
        this.valetudoHelper = options.valetudoHelper;
        this.cleaningTaskManager = options.cleaningTaskManager;
        this.cleaningTaskService = options.cleaningTaskService;

        this.mutexes = {
            configUpdate: Semaphore(1)
        };

        /** @type {string} */
        this.state = STATE.DISABLED;
        /** @type {string|null} */
        this.lastError = null;

        /** @type {any} */
        this.node = null;
        /** @type {any} */
        this.rvcEndpoint = null;
        /** @type {any} */
        this.batteryEndpoint = null;
        this.cleanModeMatterModeToPreset = new Map();
        this.serviceAreaSegments = new Map();
        this.serviceAreaProgress = new Map();
        this.currentServiceArea = null;
        this.lastDockActivity = null;
        this.pendingOperationOutcome = null;
        this.pendingMatterOperationCompletion = null;
        this.filterResourceMeta = null;
        this.waterTankResourceSupported = false;
        this.lastFilterResourcePoll = 0;
        this.estimation = null;
        this.statisticsCache = {timestamp: 0, data: null};
        this.filterResourceStateCache = null;
        this.dryingDurationSecondsCache = null;
        this.auxiliaryRefreshTimer = null;
        this.auxiliaryRefreshRunning = false;
        this.auxiliaryRefreshEnabled = false;
        this.phaseEstimate = {phase: null, startedAt: null, total: null};
        this.chargingSample = null;
        this.currentCleaningRate = null;
        this.lastServiceAreaTopologyHash = null;
        this.lastServiceAreaTopologyCheck = 0;
        this.mapTopologyVersion = null;
        this.lastPublishedCountdown = {value: null, phase: null, timestamp: 0};
        this.lastPublishedRvcState = null;
        this.lastPublishedBatteryState = null;
        this.mapSegmentCache = {version: null, dirty: true, bySegmentId: new Map(), byAreaId: new Map()};
        this.lastRoomDetectionAt = 0;
        this.robotStateSyncTimer = null;
        this.robotStateSyncDueAt = 0;
        this.robotStateSyncRunning = false;
        this.rvcStateSyncPending = false;
        this.batteryStateSyncPending = false;
        this.serviceAreaSyncPending = false;
        this.matterCommandDepth = 0;
        this.suppressNextMatterConfigUpdate = false;
        this.suppressCleaningTargetMirror = false;
        this.pendingCleaningTargetMirror = null;
        this.cleaningTargetMirrorTimer = null;
        this.cleaningTargetMirrorRetries = 0;
        this.pendingTaskProjection = null;
        this.taskProjectionTimer = null;
        this.taskProjectionRetries = 0;
        this.lastPublishedTaskProjection = null;
        this.mapUpdateListener = () => this.handleMapUpdated();
        this.mapUpdatesSubscribed = false;
        this.matterOperation = MatterController.NEW_OPERATION_TRACKER();
        this.robotStateSync = Promise.resolve();
        this.robotStateSubscriber = new CallbackAttributeSubscriber((eventType, attribute) => {
            // CleaningTargetStateAttribute mirrors a Matter selection to other
            // Valetudo consumers. Feeding it back into Matter would cause an
            // unnecessary RVC transaction and can restore stale room progress
            // immediately after a commissioner re-selects all rooms.
            if (attribute instanceof stateAttrs.CleaningTargetStateAttribute) {
                if (attribute.source !== "matter" && !this.suppressCleaningTargetMirror) {
                    this.queueCleaningTargetMirror(attribute);
                }
                return;
            }
            if (attribute instanceof stateAttrs.ActiveCleaningTaskStateAttribute) {
                this.handleActiveCleaningTaskState(attribute);
                return;
            }
            const batteryOnly = attribute instanceof stateAttrs.BatteryStateAttribute;
            this.queueRobotStateSync({
                rvc: !batteryOnly,
                battery: batteryOnly || attribute instanceof stateAttrs.StatusStateAttribute
            });
            this.scheduleAuxiliaryRefresh();
        });
        this.loadConfig();

        if (this.currentConfig.enabled) {
            this.runExclusive(() => {
                return this.start();
            }).catch(err => {
                Logger.error("Error during Matter start", err);
            });
        }

        this.config.onUpdate((key) => {
            if (key === "matter" && this.suppressNextMatterConfigUpdate) {
                this.suppressNextMatterConfigUpdate = false;
                return;
            }
            if (key === "matter" || key === "valetudo") {
                this.handleConfigUpdated().catch((err) => {
                    Logger.warn("Error while reconfiguring Matter after configuration change", err);
                });
            }
        });
    }

    /**
     * Projects shared task progress and treats its terminal state as the
     * authoritative Matter operation-completion signal.
     *
     * @private
     * @param {import("../entities/state/attributes/ActiveCleaningTaskStateAttribute")} attribute
     */
    handleActiveCleaningTaskState(attribute) {
        const terminal = ["completed", "cancelled", "stopped", "failed"].includes(attribute.state);
        if (!terminal) {
            if (!this.matterOperation.active) {
                const startedAt = Date.parse(attribute.startedAt ?? "");
                this.matterOperation = MatterController.NEW_OPERATION_TRACKER();
                this.matterOperation.active = true;
                this.matterOperation.startedAt = Number.isFinite(startedAt) ? startedAt : Date.now();
            }
            this.matterOperation.taskId = attribute.id;
            this.queueTaskProjection(attribute);
        } else if (this.matterOperation.active &&
            (!this.matterOperation.taskId || this.matterOperation.taskId === attribute.id)) {
            this.pendingOperationOutcome = attribute.outcome ?? attribute.state;
            this.queueRobotStateSync({rvc: true, serviceAreas: true, immediate: true});
        }
    }

    /**
     * @private
     * Serialises all lifecycle transitions (start/stop/reconfigure/reset).
     * Without this, simultaneous UI updates, shutdowns and commissioning
     * resets could operate on the same ServerNode concurrently.
     *
     * @param {() => Promise<void>} fn
     * @return {Promise<void>}
     */
    async runExclusive(fn) {
        await new Promise((/** @type {(value?: any) => void} */ resolve) => {
            this.mutexes.configUpdate.take(() => {
                resolve();
            });
        });

        try {
            await fn();
        } finally {
            this.mutexes.configUpdate.leave();
        }
    }

    /**
     * Prevents robot callbacks emitted by a Matter command from attempting to
     * synchronously write clusters still locked by that command transaction.
     *
     * @private
     * @param {() => Promise<any>} fn
     * @return {Promise<any>}
     */
    async executeMatterCommand(fn) {
        this.matterCommandDepth++;
        try {
            return await fn();
        } finally {
            this.matterCommandDepth--;
            if (this.matterCommandDepth === 0) {
                this.queueRobotStateSync({rvc: true, battery: true, immediate: true});
            }
        }
    }

    /**
     * Coalesces bursts of robot attribute and map events into one Matter transaction.
     *
     * @private
     * @param {{immediate?: boolean, rvc?: boolean, battery?: boolean, serviceAreas?: boolean,
     *     delayMs?: number}} [options]
     */
    queueRobotStateSync(options = {}) {
        this.rvcStateSyncPending ||= options.rvc !== false && options.battery !== true;
        this.rvcStateSyncPending ||= options.rvc === true;
        this.batteryStateSyncPending ||= options.battery === true;
        this.serviceAreaSyncPending ||= options.serviceAreas === true;
        const delay = options.immediate ? 0 : options.delayMs ?? STATE_SYNC_DEBOUNCE_MS;
        const dueAt = Date.now() + delay;
        if (this.robotStateSyncTimer !== null) {
            if (dueAt >= this.robotStateSyncDueAt) {
                return;
            }
            clearTimeout(this.robotStateSyncTimer);
        }
        this.robotStateSyncDueAt = dueAt;
        this.robotStateSyncTimer = setTimeout(() => {
            this.robotStateSyncTimer = null;
            this.robotStateSyncDueAt = 0;
            if (this.robotStateSyncRunning) {
                return;
            }
            const syncServiceAreas = this.serviceAreaSyncPending;
            const syncRvc = this.rvcStateSyncPending;
            const syncBattery = this.batteryStateSyncPending;
            this.rvcStateSyncPending = false;
            this.batteryStateSyncPending = false;
            this.serviceAreaSyncPending = false;
            this.robotStateSyncRunning = true;
            let transactionRetry = false;
            this.robotStateSync = this.robotStateSync.then(async () => {
                if (syncServiceAreas) {
                    await this.syncServiceAreas();
                }
                await this.syncRobotState({rvc: syncRvc, battery: syncBattery});
            }).catch(err => {
                if (IS_SYNCHRONOUS_TRANSACTION_CONFLICT(err)) {
                    transactionRetry = true;
                    this.rvcStateSyncPending ||= syncRvc;
                    this.batteryStateSyncPending ||= syncBattery;
                    this.serviceAreaSyncPending ||= syncServiceAreas;
                    Logger.debug("Matter state synchronization deferred until the active transaction completes");
                } else {
                    Logger.warn("Unable to synchronize robot state with Matter", err);
                }
            }).finally(() => {
                this.robotStateSyncRunning = false;
                if (this.rvcStateSyncPending || this.batteryStateSyncPending || this.serviceAreaSyncPending) {
                    this.queueRobotStateSync({
                        rvc: false,
                        battery: false,
                        immediate: !transactionRetry,
                        delayMs: transactionRetry ? MATTER_TRANSACTION_RETRY_MS : undefined
                    });
                }
            });
        }, delay);
    }

    /** @private */
    handleMapUpdated() {
        const topologyVersion = this.getMapTopologyVersion();
        const topologyChanged = topologyVersion !== this.mapTopologyVersion;
        if (topologyChanged) {
            this.mapSegmentCache.dirty = true;
            this.mapTopologyVersion = topologyVersion;
            this.lastServiceAreaTopologyCheck = 0;
            this.lastServiceAreaTopologyHash = null;
            this.lastRoomDetectionAt = 0;
        }
        if (!topologyChanged) {
            return;
        }
        this.queueRobotStateSync({
            rvc: false,
            serviceAreas: true,
            delayMs: MAP_STATE_SYNC_INTERVAL_MS
        });
    }

    /**
     * @private
     */
    loadConfig() {
        this.currentConfig = structuredClone(this.config.get("matter"));
        this.estimation = structuredClone(this.config.get("matterEstimation")) ?? {
            cleaningRates: {},
            washingDuration: {value: 0, samples: 0},
            chargingRate: {value: 0, samples: 0}
        };
    }

    /**
     * @private
     * Fills in any auto-generated credentials on the raw stored config and
     * writes them back so future starts use the same values (stable QR code).
     *
     * @return {boolean} true if anything was mutated
     */
    ensureCredentials() {
        const stored = structuredClone(this.config.get("matter"));
        let dirty = false;

        if (!Number.isInteger(stored.commissioning.discriminator) || stored.commissioning.discriminator <= 0) {
            // 12-bit; avoid 0 which some commissioners treat as "any"
            stored.commissioning.discriminator = 1 + (crypto.randomInt(4095));
            dirty = true;
        }

        if (!Number.isInteger(stored.commissioning.passcode) || stored.commissioning.passcode <= 0) {
            // 27-bit space with several forbidden values (0, 11111111, ...). Use a safe range.
            stored.commissioning.passcode = MatterController.GENERATE_PASSCODE();
            dirty = true;
        }

        if (typeof stored.identity.serialNumber !== "string" || stored.identity.serialNumber.length === 0) {
            stored.identity.serialNumber = ("val-" + Tools.GET_HUMAN_READABLE_SYSTEM_ID()).slice(0, 32);
            dirty = true;
        }

        if (dirty) {
            // Persist generated credentials without restarting the node that is
            // currently starting. Configuration emits this update synchronously.
            this.suppressNextMatterConfigUpdate = true;
            try {
                this.config.set("matter", stored);
            } catch (e) {
                this.suppressNextMatterConfigUpdate = false;
                throw e;
            }
            this.currentConfig = stored;
        }

        return dirty;
    }

    /**
     * @private
     */
    getStorageLocation() {
        const dataPath = process.env[env.DataPath] ?? os.tmpdir();
        const location = path.join(dataPath, STORAGE_SUBDIR);
        try {
            fs.mkdirSync(location, {recursive: true});
        } catch (e) {
            // best-effort; matter.js will surface a clearer error if the path is unusable
        }
        return location;
    }

    /**
     * A previous Valetudo process can still be releasing matter.js's directory lock while its
     * replacement starts. matter.js already reclaims provably stale lock files, so retrying the
     * atomic acquisition is safer than deleting a lock that may still have a live owner.
     *
     * @private
     * @param {new (options: object) => any} ServerNode
     * @param {object} options
     * @return {Promise<any>}
     */
    async createServerNodeWithLockRetry(ServerNode, options) {
        for (let attempt = 1; ; attempt++) {
            let node;
            try {
                // Keep the instance reference while asynchronous construction runs. The library's
                // static create() helper throws without returning that reference, which prevents
                // cleanup when construction fails after acquiring storage.
                node = new ServerNode(options);
                await node.construction.ready;
                return node;
            } catch (error) {
                if (node) {
                    try {
                        await node.close();
                    } catch (closeError) {
                        Logger.debug("Unable to close partially constructed Matter ServerNode", closeError);
                    }
                }
                if (!IS_MATTER_STORAGE_LOCK_ERROR(error) || attempt >= MATTER_STORAGE_LOCK_RETRY_ATTEMPTS) {
                    throw error;
                }

                if (attempt === 1) {
                    Logger.info("Matter storage is still locked; waiting for the previous owner to release it");
                }
                await this.waitForMatterStorageLockRetry();
            }
        }
    }

    /** @private */
    async waitForMatterStorageLockRetry() {
        await new Promise(resolve => setTimeout(resolve, MATTER_STORAGE_LOCK_RETRY_MS));
    }

    /**
     * Repairs persisted clean-mode state before matter.js validates it. Mode IDs
     * are non-volatile, so capability/configuration changes can otherwise leave
     * an ID that is unsupported or now has different semantics.
     *
     * @private
     * @param {Array<{mode: number}>} supportedModes
     * @param {number|undefined} desiredMode
     */
    migratePersistedCleanMode(supportedModes, desiredMode) {
        if (supportedModes.length === 0 || desiredMode === undefined) {
            return;
        }
        const storageLocation = this.getStorageLocation();
        const nodeStorage = path.join(storageLocation, NODE_ID);
        const currentModePath = path.join(nodeStorage, "root.parts.rvc.rvcCleanMode.currentMode");
        const schemaPath = path.join(storageLocation, "clean-mode-schema");
        const supportedIds = new Set(supportedModes.map(mode => mode.mode));
        let storedMode;
        let storedSchema;
        try {
            storedMode = JSON.parse(fs.readFileSync(currentModePath, "utf8"));
        } catch (e) {
            storedMode = undefined;
        }
        try {
            storedSchema = Number(fs.readFileSync(schemaPath, "utf8"));
        } catch (e) {
            storedSchema = 0;
        }
        if (storedSchema !== CLEAN_MODE_STORAGE_SCHEMA ||
            (storedMode !== undefined && !supportedIds.has(storedMode))) {
            try {
                fs.mkdirSync(nodeStorage, {recursive: true});
                const temporaryPath = currentModePath + ".migration";
                fs.writeFileSync(temporaryPath, JSON.stringify(desiredMode));
                fs.renameSync(temporaryPath, currentModePath);
                fs.writeFileSync(schemaPath, String(CLEAN_MODE_STORAGE_SCHEMA));
                Logger.info(`Migrated persisted Matter clean mode to ${desiredMode}`);
            } catch (e) {
                Logger.warn("Unable to migrate persisted Matter clean mode", e);
            }
        }
    }

    /**
     * Build the Matter Basic Information identity from Valetudo and the
     * physical robot instead of exposing editable duplicate configuration.
     *
     * @private
     * @returns {Promise<{deviceName: string, manufacturer: string, model: string, serialNumber: string, softwareVersion: number, softwareVersionString: string}>}
     */
    async getDeviceIdentity() {
        const deviceName = this.valetudoHelper.getFriendlyName().slice(0, 32);
        const manufacturer = this.robot.getManufacturer().slice(0, 32);
        const model = this.robot.getModelName().slice(0, 32);
        const valetudoVersion = Tools.GET_VALETUDO_VERSION();
        const versionParts = valetudoVersion.match(/\d+/g)?.slice(0, 3).map(Number) ?? [];
        const softwareVersion = Math.min(
            0xffffffff,
            ((versionParts[0] ?? 0) * 10000) + ((versionParts[1] ?? 0) * 100) + (versionParts[2] ?? 0)
        );

        let serialNumber = null;
        try {
            serialNumber = await this.robot.getSerialNumber();
        } catch (e) {
            Logger.warn("Unable to retrieve robot serial number for Matter", e);
        }

        return {
            deviceName: deviceName,
            manufacturer: manufacturer,
            model: model,
            serialNumber: (serialNumber ?? this.currentConfig.identity.serialNumber).slice(0, 32),
            softwareVersion: softwareVersion,
            softwareVersionString: valetudoVersion.slice(0, 64)
        };
    }

    /**
     * @private
     * @return {boolean}
     */
    hasActiveSharedCleaningTask() {
        const task = this.robot.state.getFirstMatchingAttributeByConstructor(
            stateAttrs.ActiveCleaningTaskStateAttribute
        );
        return Boolean(task && !["completed", "cancelled", "stopped", "failed"].includes(task.state));
    }

    /**
     * @private
     * @return {number}
     */
    getMatterOperationalState() {
        const status = this.robot.state.getFirstMatchingAttributeByConstructor(stateAttrs.StatusStateAttribute);
        const battery = this.robot.state.getFirstMatchingAttributeByConstructor(stateAttrs.BatteryStateAttribute);
        const operationalState = matterModules.RvcOperationalState.OperationalState;

        if (this.getMatterOperationalError().errorStateId !==
            matterModules.RvcOperationalState.ErrorState.NoError) {
            return operationalState.Error;
        }

        if (
            battery?.flag === stateAttrs.BatteryStateAttribute.FLAG.CHARGING &&
            [stateAttrs.StatusStateAttribute.VALUE.DOCKED, stateAttrs.StatusStateAttribute.VALUE.IDLE]
                .includes(status?.value)
        ) {
            return operationalState.Charging;
        }

        if (status?.flag === stateAttrs.StatusStateAttribute.FLAG.RESUMABLE &&
            this.hasActiveSharedCleaningTask()) {
            return operationalState.Paused;
        }

        switch (status?.value) {
            case stateAttrs.StatusStateAttribute.VALUE.CLEANING:
            case stateAttrs.StatusStateAttribute.VALUE.MANUAL_CONTROL:
            case stateAttrs.StatusStateAttribute.VALUE.MOVING:
                return operationalState.Running;
            case stateAttrs.StatusStateAttribute.VALUE.PAUSED:
                return this.hasActiveSharedCleaningTask() ? operationalState.Paused : operationalState.Stopped;
            case stateAttrs.StatusStateAttribute.VALUE.RETURNING:
                return operationalState.SeekingCharger;
            case stateAttrs.StatusStateAttribute.VALUE.DOCKED:
                return operationalState.Docked;
            case stateAttrs.StatusStateAttribute.VALUE.IDLE:
            default:
                return operationalState.Stopped;
        }
    }

    /**
     * @private
     * @return {{errorStateId: number, errorStateDetails?: string}}
     */
    getMatterOperationalError() {
        const status = this.robot.state.getFirstMatchingAttributeByConstructor(stateAttrs.StatusStateAttribute);
        const dockStatus = this.robot.state.getFirstMatchingAttributeByConstructor(stateAttrs.DockStatusStateAttribute);
        const error = status?.error;
        const errorState = matterModules.RvcOperationalState.ErrorState;

        const componentFault = this.getDockResourceFault();
        if (status?.value !== stateAttrs.StatusStateAttribute.VALUE.ERROR &&
            dockStatus?.value !== stateAttrs.DockStatusStateAttribute.VALUE.ERROR && !componentFault) {
            return {errorStateId: errorState.NoError};
        }

        const dockActivityError = this.lastDockActivity === stateAttrs.DockStatusStateAttribute.VALUE.CLEANING ?
            "Mop cleaning failed" : this.lastDockActivity === stateAttrs.DockStatusStateAttribute.VALUE.DRYING ?
                "Mop drying failed" : "Dock error";
        const message = componentFault?.message ?? error?.message ??
            (dockStatus?.value === stateAttrs.DockStatusStateAttribute.VALUE.ERROR ? dockActivityError : "Unknown robot error");
        const normalized = message.toLowerCase();
        let errorStateId = componentFault?.errorStateId ?? errorState.UnableToCompleteOperation;

        if (/dust.?bin.*missing|dust.?box.*missing/.test(normalized)) {
            errorStateId = errorState.DustBinMissing;
        } else if (/dust.?bin.*full|dust.?bag.*full/.test(normalized)) {
            errorStateId = errorState.DustBinFull;
        } else if (/dirty|wastewater/.test(normalized) && /tank/.test(normalized) && /missing|not installed/.test(normalized)) {
            errorStateId = errorState.DirtyWaterTankMissing;
        } else if (/dirty|wastewater/.test(normalized) && /tank|tray/.test(normalized) && /full/.test(normalized)) {
            errorStateId = errorState.DirtyWaterTankFull;
        } else if (/clean water/.test(normalized) && /tank/.test(normalized) && /missing|not installed/.test(normalized)) {
            errorStateId = errorState.WaterTankMissing;
        } else if (/clean water/.test(normalized) && /empty/.test(normalized)) {
            errorStateId = errorState.WaterTankEmpty;
        } else if (/water tank.*lid.*open/.test(normalized)) {
            errorStateId = errorState.WaterTankLidOpen;
        } else if (/mop|cleaning pad/.test(normalized) && /missing|not installed|removed/.test(normalized)) {
            errorStateId = errorState.MopCleaningPadMissing;
        } else if (/brush/.test(normalized) && /jam|block|stuck|fault/.test(normalized)) {
            errorStateId = errorState.BrushJammed;
        } else if (/wheel/.test(normalized) && /jam|block|stuck|fault/.test(normalized)) {
            errorStateId = errorState.WheelsJammed;
        } else if (/stuck|trapped|lifted|suspended/.test(normalized)) {
            errorStateId = errorState.Stuck;
        } else if (/low battery|battery.*low/.test(normalized) || error?.subsystem === ValetudoRobotError.SUBSYSTEM.POWER) {
            errorStateId = errorState.LowBattery;
        } else if (/cannot.*dock|find.*dock|reach.*dock|navigate.*dock/.test(normalized)) {
            errorStateId = errorState.FailedToFindChargingDock;
        } else if (/sensor.*(obscured|blocked|dirty)|lidar.*(obscured|blocked|dirty)/.test(normalized)) {
            errorStateId = errorState.NavigationSensorObscured;
        } else if (/cannot reach|unreachable|target area/.test(normalized)) {
            errorStateId = errorState.CannotReachTargetArea;
        } else if (error?.subsystem === ValetudoRobotError.SUBSYSTEM.NAVIGATION) {
            errorStateId = errorState.CannotReachTargetArea;
        }

        const vendorCode = error?.vendorErrorCode ? ` (${error.vendorErrorCode})` : "";
        return {
            errorStateId: errorStateId,
            errorStateDetails: (message + vendorCode).slice(0, 64)
        };
    }

    /**
     * Converts reliable Valetudo attachment/dock-component states into the
     * closest standard Matter RVC operational error.
     *
     * @private
     * @return {{errorStateId: number, message: string}|null}
     */
    getDockResourceFault() {
        const errorState = matterModules.RvcOperationalState.ErrorState;
        const component = type => this.robot.state.getFirstMatchingAttribute({
            attributeClass: stateAttrs.DockComponentStateAttribute.name,
            attributeType: type
        });
        const attachment = type => this.robot.state.getFirstMatchingAttribute({
            attributeClass: stateAttrs.AttachmentStateAttribute.name,
            attributeType: type
        });
        const types = stateAttrs.DockComponentStateAttribute.TYPE;
        const values = stateAttrs.DockComponentStateAttribute.VALUE;
        const checks = [
            [component(types.WATER_TANK_CLEAN), values.MISSING, errorState.WaterTankMissing, "Clean-water tank missing"],
            [component(types.WATER_TANK_CLEAN), values.EMPTY, errorState.WaterTankEmpty, "Clean-water tank empty"],
            [component(types.WATER_TANK_DIRTY), values.MISSING, errorState.DirtyWaterTankMissing, "Dirty-water tank missing"],
            [component(types.WATER_TANK_DIRTY), values.FULL, errorState.DirtyWaterTankFull, "Dirty-water tank full"],
            [component(types.DUSTBAG), values.MISSING, errorState.DustBinMissing, "Dock dust bag missing"],
            [component(types.DUSTBAG), values.FULL, errorState.DustBinFull, "Dock dust bag full"],
            [component(types.DETERGENT), values.MISSING, errorState.UnableToCompleteOperation, "Dock detergent missing"],
            [component(types.DETERGENT), values.EMPTY, errorState.UnableToCompleteOperation, "Dock detergent empty"]
        ];
        for (const [attribute, value, errorStateId, message] of checks) {
            if (attribute?.value === value) {
                return {errorStateId: errorStateId, message: message};
            }
        }
        if (attachment(stateAttrs.AttachmentStateAttribute.TYPE.DUSTBIN)?.attached === false) {
            return {errorStateId: errorState.DustBinMissing, message: "Robot dustbin missing"};
        }
        return null;
    }

    /** @private */
    getFilterResourceMeta() {
        const capability = this.robot.capabilities[ConsumableMonitoringCapability.TYPE];
        const available = capability?.getProperties()?.availableConsumables ?? [];
        return available.find(item => item.type === ValetudoConsumable.TYPE.FILTER &&
            [ValetudoConsumable.SUB_TYPE.MAIN, ValetudoConsumable.SUB_TYPE.NONE].includes(item.subType)) ??
            available.find(item => item.type === ValetudoConsumable.TYPE.FILTER) ?? null;
    }

    /**
     * @private
     * @return {Promise<{
     *   condition: number,
     *   degradationDirection: number,
     *   changeIndication: number,
     *   inPlaceIndicator: boolean
     * }|null>}
     */
    async getFilterResourceState() {
        const capability = this.robot.capabilities[ConsumableMonitoringCapability.TYPE];
        if (!capability || !this.filterResourceMeta) {
            return null;
        }
        try {
            const consumables = await capability.getConsumables();
            const filter = consumables.find(item => item.type === this.filterResourceMeta.type &&
                item.subType === this.filterResourceMeta.subType);
            if (!filter) {
                return null;
            }
            let condition = filter.remaining.value;
            if (filter.remaining.unit === ValetudoConsumable.UNITS.MINUTES) {
                condition = this.filterResourceMeta.maxValue > 0 ?
                    (filter.remaining.value / this.filterResourceMeta.maxValue) * 100 : 100;
            }
            condition = Math.round(Math.max(0, Math.min(100, condition)));
            return {
                condition: condition,
                degradationDirection: matterModules.ResourceMonitoring.DegradationDirection.Down,
                changeIndication: condition <= 5 ? matterModules.ResourceMonitoring.ChangeIndication.Critical :
                    condition <= 20 ? matterModules.ResourceMonitoring.ChangeIndication.Warning :
                        matterModules.ResourceMonitoring.ChangeIndication.Ok,
                inPlaceIndicator: true
            };
        } catch (e) {
            Logger.debug("Unable to retrieve filter condition for Matter", e);
            return null;
        }
    }

    /**
     * Refreshes Matter-only auxiliary data independently from attribute publication.
     * Live Matter synchronization must never wait for robot firmware reads.
     *
     * @private
     * @param {number} [delayMs]
     */
    scheduleAuxiliaryRefresh(delayMs = 0) {
        if (!this.auxiliaryRefreshEnabled || this.auxiliaryRefreshRunning) {
            return;
        }
        if (this.auxiliaryRefreshTimer !== null) {
            if (delayMs !== 0) {
                return;
            }
            clearTimeout(this.auxiliaryRefreshTimer);
        }
        this.auxiliaryRefreshTimer = setTimeout(() => {
            this.auxiliaryRefreshTimer = null;
            this.refreshAuxiliaryData().catch(e => {
                Logger.debug("Unable to refresh auxiliary Matter data", e);
            });
        }, delayMs);
    }

    /** @private */
    async refreshAuxiliaryData() {
        if (this.auxiliaryRefreshRunning || !this.auxiliaryRefreshEnabled) {
            return;
        }
        this.auxiliaryRefreshRunning = true;
        let changed = false;
        let timedStateUpdate = false;
        try {
            if (this.filterResourceMeta &&
                Date.now() - this.lastFilterResourcePoll >= FILTER_RESOURCE_POLL_INTERVAL_MS) {
                const filterResource = await this.getFilterResourceState();
                this.lastFilterResourcePoll = Date.now();
                if (filterResource && !STATE_VALUES_EQUAL(filterResource, this.filterResourceStateCache)) {
                    this.filterResourceStateCache = filterResource;
                    changed = true;
                }
            }

            const phase = this.getMatterPhase();
            const phaseName = phase === null ? null : MATTER_PHASES[phase];
            timedStateUpdate = ["Cleaning", "Charging", "Mop washing", "Drying"].includes(phaseName);
            if (phaseName === "Cleaning" &&
                Date.now() - this.statisticsCache.timestamp >= AUXILIARY_REFRESH_INTERVAL_MS) {
                const previousStatistics = this.statisticsCache.data;
                await this.getCurrentStatisticsCached(true);
                changed ||= !STATE_VALUES_EQUAL(previousStatistics, this.statisticsCache.data);
            }
            if (phaseName === "Drying" && this.dryingDurationSecondsCache === null) {
                const capability = this.robot.capabilities[MopDockMopDryingTimeControlCapability.TYPE];
                try {
                    const duration = await capability?.getDuration();
                    const hours = typeof duration === "string" ? Number.parseInt(duration) : NaN;
                    if (Number.isFinite(hours)) {
                        this.dryingDurationSecondsCache = hours * 3600;
                        changed = true;
                    }
                } catch (e) {
                    Logger.debug("Unable to retrieve mop drying duration for Matter", e);
                }
            } else if (phaseName !== "Drying") {
                this.dryingDurationSecondsCache = null;
            }
        } finally {
            this.auxiliaryRefreshRunning = false;
            if (changed || timedStateUpdate) {
                this.queueRobotStateSync({rvc: true});
            }
            if (this.auxiliaryRefreshEnabled) {
                this.scheduleAuxiliaryRefresh(AUXILIARY_REFRESH_INTERVAL_MS);
            }
        }
    }

    /** @private */
    getWaterTankResourceState() {
        const component = this.robot.state.getFirstMatchingAttribute({
            attributeClass: stateAttrs.DockComponentStateAttribute.name,
            attributeType: stateAttrs.DockComponentStateAttribute.TYPE.WATER_TANK_CLEAN
        });
        const value = component?.value;
        const missing = value === stateAttrs.DockComponentStateAttribute.VALUE.MISSING;
        const empty = value === stateAttrs.DockComponentStateAttribute.VALUE.EMPTY;
        return {
            condition: empty || missing ? 0 : 100,
            degradationDirection: matterModules.ResourceMonitoring.DegradationDirection.Down,
            changeIndication: empty || missing ? matterModules.ResourceMonitoring.ChangeIndication.Critical :
                matterModules.ResourceMonitoring.ChangeIndication.Ok,
            inPlaceIndicator: !missing
        };
    }

    /** @private */
    async resetFilterResource() {
        await this.robot.capabilities[ConsumableMonitoringCapability.TYPE].resetConsumable(
            this.filterResourceMeta.type,
            this.filterResourceMeta.subType
        );
        this.lastFilterResourcePoll = 0;
        this.scheduleAuxiliaryRefresh();
    }

    /** @private */
    getMatterBatteryFaults() {
        const status = this.robot.state.getFirstMatchingAttributeByConstructor(stateAttrs.StatusStateAttribute);
        const powerError = status?.value === stateAttrs.StatusStateAttribute.VALUE.ERROR &&
            status.error?.subsystem === ValetudoRobotError.SUBSYSTEM.POWER;
        const charging = this.robot.state.getFirstMatchingAttributeByConstructor(stateAttrs.BatteryStateAttribute)
            ?.flag === stateAttrs.BatteryStateAttribute.FLAG.CHARGING;
        return {
            activeBatFaults: powerError ? [matterModules.PowerSource.BatFault.Unspecified] : [],
            activeBatChargeFaults: powerError && charging ?
                [matterModules.PowerSource.BatChargeFault.Unspecified] : []
        };
    }

    /**
     * @private
     * @return {number|null}
     */
    getCurrentOperationDuration() {
        const time = this.statisticsCache.data?.time;
        if (Number.isFinite(time) && time >= 0 && time <= 0xffffffff) {
            return Math.round(time);
        }

        if (this.matterOperation.startedAt !== null) {
            return Math.min(0xffffffff, Math.max(0, Math.round((Date.now() - this.matterOperation.startedAt) / 1000)));
        }
        return null;
    }

    /** @private */
    getEstimationKey() {
        const mode = this.getMatterCleanMode();
        const mapping = this.cleanModeMatterModeToPreset.get(mode);
        return mapping ? `${mapping.operationMode}:${mapping.profile}` : "default";
    }

    /**
     * @private
     * @param {string} collection
     * @param {string|null} key
     * @param {number} sample
     */
    learnEstimate(collection, key, sample) {
        if (!Number.isFinite(sample) || sample <= 0) {
            return;
        }
        const previous = key === null ? this.estimation[collection] : this.estimation[collection][key];
        const samples = Math.min(1000, (previous?.samples ?? 0) + 1);
        const value = previous?.samples > 0 ? previous.value * 0.8 + sample * 0.2 : sample;
        const learned = {value: value, samples: samples};
        if (key === null) {
            this.estimation[collection] = learned;
        } else {
            this.estimation[collection][key] = learned;
        }
        this.config.set("matterEstimation", structuredClone(this.estimation));
    }

    /**
     * Persists one charging-rate sample for the whole charging session. Battery updates while
     * charging only update chargingSample in memory, avoiding a full configuration write every
     * five minutes. A partial session is deliberately discarded if Matter is shut down before
     * charging completes.
     *
     * @private
     */
    finishChargingSample() {
        const sample = this.chargingSample;
        this.chargingSample = null;
        if (!sample) {
            return;
        }
        const elapsed = (sample.lastTimestamp - sample.timestamp) / 1000;
        const gained = sample.lastLevel - sample.level;
        if (elapsed >= 300 && gained >= 3) {
            this.learnEstimate("chargingRate", null, gained / elapsed);
        }
    }

    /**
     * @private
     * @param {boolean} [force]
     */
    async getCurrentStatisticsCached(force = false) {
        if (!force && Date.now() - this.statisticsCache.timestamp < 30_000) {
            return this.statisticsCache.data;
        }
        const capability = this.robot.capabilities[CurrentStatisticsCapability.TYPE];
        if (!capability) {
            return null;
        }
        try {
            const statistics = await capability.getStatistics();
            const result = {
                time: statistics.find(item => item.type === ValetudoDataPoint.TYPES.TIME)?.value,
                area: statistics.find(item => item.type === ValetudoDataPoint.TYPES.AREA)?.value
            };
            this.statisticsCache = {timestamp: Date.now(), data: result};
            return result;
        } catch (e) {
            Logger.debug("Unable to retrieve statistics for Matter estimates", e);
            return null;
        }
    }

    /** @private */
    learnCleaningRate() {
        const statistics = this.statisticsCache.data;
        if (statistics?.time >= 60 && statistics?.area >= 5_000) {
            this.learnEstimate("cleaningRates", this.getEstimationKey(), statistics.time / statistics.area);
        }
    }

    /**
     * @private
     * @param {number} areaId
     */
    getAreaForServiceArea(areaId) {
        this.rebuildMapSegmentCache();
        return this.mapSegmentCache.byAreaId.get(areaId)?.area;
    }

    /** @private */
    rebuildMapSegmentCache() {
        const map = this.robot.state.map;
        const version = this.getMapTopologyVersion();
        if (!this.mapSegmentCache.dirty && this.mapSegmentCache.version === version) {
            return;
        }
        const bySegmentId = new Map();
        const byAreaId = new Map();
        const areaIdsBySegmentId = new Map([...this.serviceAreaSegments.entries()].map(([areaId, segment]) => {
            return [String(segment.id), areaId];
        }));
        for (const layer of map?.layers ?? []) {
            if (layer.type !== MapLayer.TYPE.SEGMENT) {
                continue;
            }
            const segmentId = String(layer.metaData.segmentId);
            const areaId = areaIdsBySegmentId.get(segmentId);
            const area = layer.metaData.area ?? (layer.dimensions?.pixelCount * (map?.pixelSize ?? 0) ** 2);
            const entry = {areaId: areaId, area: area, layer: layer};
            bySegmentId.set(segmentId, entry);
            if (areaId !== undefined) {
                byAreaId.set(areaId, entry);
            }
        }
        this.mapSegmentCache = {version: version, dirty: false, bySegmentId: bySegmentId, byAreaId: byAreaId};
    }

    /**
     * A lightweight topology version that ignores live path/position changes.
     *
     * @private
     * @return {string}
     */
    getMapTopologyVersion() {
        const map = this.robot.state.map;
        const segments = (map?.layers ?? []).filter(layer => layer.type === MapLayer.TYPE.SEGMENT).map(layer => ({
            id: String(layer.metaData.segmentId ?? ""),
            name: String(layer.metaData.name ?? ""),
            hidden: layer.metaData.hidden === true,
            dimensions: layer.dimensions ? [
                layer.dimensions.x.min,
                layer.dimensions.x.max,
                layer.dimensions.y.min,
                layer.dimensions.y.max,
                layer.dimensions.pixelCount
            ] : null
        })).sort((left, right) => left.id.localeCompare(right.id));
        return JSON.stringify({
            mapId: map?.metaData?.id ?? map?.metaData?.vendorMapId ?? null,
            schemaVersion: map?.metaData?.version ?? null,
            segments: segments
        });
    }

    /**
     * @private
     * @param {number|null} phase
     * @return {number|null}
     */
    getMatterCountdown(phase) {
        const now = Date.now();
        const phaseName = phase === null ? null : MATTER_PHASES[phase];
        if (phaseName !== this.phaseEstimate.phase) {
            if (this.phaseEstimate.phase === "Mop washing" && this.phaseEstimate.startedAt) {
                const duration = (now - this.phaseEstimate.startedAt) / 1000;
                if (duration >= 30 && duration <= 3600) {
                    this.learnEstimate("washingDuration", null, duration);
                }
            }
            this.phaseEstimate = {phase: phaseName, startedAt: phaseName ? now : null, total: null};
            if (phaseName === "Drying") {
                this.phaseEstimate.total = this.dryingDurationSecondsCache;
            } else if (phaseName === "Mop washing" && this.estimation.washingDuration.samples >= 2) {
                this.phaseEstimate.total = this.estimation.washingDuration.value;
            }
        }

        const battery = this.robot.state.getFirstMatchingAttributeByConstructor(stateAttrs.BatteryStateAttribute);
        if (phaseName === "Charging" && battery?.flag === stateAttrs.BatteryStateAttribute.FLAG.CHARGING) {
            if (!this.chargingSample) {
                this.chargingSample = {
                    level: battery.level,
                    timestamp: now,
                    lastLevel: battery.level,
                    lastTimestamp: now
                };
            } else {
                this.chargingSample.lastLevel = battery.level;
                this.chargingSample.lastTimestamp = now;
            }
            const elapsed = (now - this.chargingSample.timestamp) / 1000;
            const gained = battery.level - this.chargingSample.level;
            const liveRate = elapsed >= 300 && gained >= 3 ? gained / elapsed : null;
            const learnedRate = this.estimation.chargingRate.samples >= 2 && this.estimation.chargingRate.value > 0 ?
                this.estimation.chargingRate.value : null;
            const chargingRate = liveRate ?? learnedRate;
            if (chargingRate) {
                return Math.min(0xffffffff, Math.round((100 - battery.level) / chargingRate));
            }
        } else {
            this.finishChargingSample();
        }

        if (["Drying", "Mop washing"].includes(phaseName) && this.phaseEstimate.total) {
            return Math.max(0, Math.round(this.phaseEstimate.total - (now - this.phaseEstimate.startedAt) / 1000));
        }
        if (phaseName !== "Cleaning") {
            this.currentCleaningRate = null;
            return null;
        }

        const sharedRoomEstimate = this.cleaningTaskManager?.estimateRemaining();
        if (sharedRoomEstimate !== null && sharedRoomEstimate !== undefined) {
            return Math.min(0xffffffff, sharedRoomEstimate);
        }

        const statistics = this.statisticsCache.data;
        let secondsPerCm2 = statistics?.time >= 60 && statistics?.area >= 5_000 ?
            statistics.time / statistics.area : null;
        const learned = this.estimation.cleaningRates[this.getEstimationKey()];
        if (!secondsPerCm2 && learned?.samples >= 1) {
            secondsPerCm2 = learned.value;
        }
        if (!secondsPerCm2) {
            this.currentCleaningRate = null;
            return null;
        }
        this.currentCleaningRate = secondsPerCm2;

        const selectedAreas = this.rvcEndpoint?.state?.serviceArea?.selectedAreas ?? [];
        let remainingArea;
        if (selectedAreas.length > 0) {
            remainingArea = selectedAreas.reduce((sum, areaId) => {
                const progress = this.serviceAreaProgress.get(areaId);
                return progress?.status === matterModules.ServiceArea.OperationalStatus.Completed ? sum :
                    sum + (this.getAreaForServiceArea(areaId) ?? 0);
            }, 0);
            const currentProgress = this.currentServiceArea !== null ?
                this.serviceAreaProgress.get(this.currentServiceArea) : null;
            const elapsedCurrent = (currentProgress?.elapsedSeconds ?? 0) + (currentProgress?.startedAt ?
                (Date.now() - currentProgress.startedAt) / 1000 : 0);
            return remainingArea > 0 ? Math.min(0xffffffff,
                Math.max(0, Math.round(remainingArea * secondsPerCm2 - elapsedCurrent))) : null;
        } else {
            const totalArea = this.robot.state.map?.layers?.filter(layer =>
                layer.type === MapLayer.TYPE.SEGMENT && !layer.metaData.hidden)
                .reduce((sum, layer) => sum + (layer.metaData.area ??
                    layer.dimensions.pixelCount * this.robot.state.map.pixelSize ** 2), 0) ?? 0;
            remainingArea = Math.max(0, totalArea - (statistics?.area ?? 0));
        }
        return remainingArea > 0 ? Math.min(0xffffffff, Math.round(remainingArea * secondsPerCm2)) : null;
    }

    /**
     * Tracks a cleaning lifecycle and returns a Matter completion event once it reaches a terminal state.
     *
     * @private
     * @return {{completionErrorCode: number, totalOperationalTime: number|null, pausedTime: number}|null}
     */
    updateOperationLifecycle() {
        const status = this.robot.state.getFirstMatchingAttributeByConstructor(stateAttrs.StatusStateAttribute);
        const value = status?.value;
        const operation = this.matterOperation;

        if (!operation.active && value === stateAttrs.StatusStateAttribute.VALUE.CLEANING) {
            this.matterOperation = MatterController.NEW_OPERATION_TRACKER();
            this.matterOperation.active = true;
            this.matterOperation.startedAt = Date.now();
            return null;
        }
        if (!operation.active) {
            return null;
        }
        if (this.pendingOperationOutcome) {
            const outcome = this.pendingOperationOutcome;
            this.pendingOperationOutcome = null;
            this.filterResourceMeta = null;
            this.waterTankResourceSupported = false;
            this.lastFilterResourcePoll = 0;
            this.statisticsCache = {timestamp: 0, data: null};
            this.phaseEstimate = {phase: null, startedAt: null, total: null};
            this.chargingSample = null;
            this.currentCleaningRate = null;
            let completionErrorCode = matterModules.OperationalState.ErrorState.UnableToCompleteOperation;
            if (outcome === "completed") {
                completionErrorCode = matterModules.OperationalState.ErrorState.NoError;
            } else if (outcome === "failed") {
                const matterError = this.getMatterOperationalError();
                if (matterError.errorStateId !== matterModules.OperationalState.ErrorState.NoError) {
                    completionErrorCode = matterError.errorStateId;
                }
            }
            const totalOperationalTime = this.getCurrentOperationDuration();
            const pausedTime = Math.min(0xffffffff, Math.round(operation.pausedMilliseconds / 1000));
            if (completionErrorCode === matterModules.OperationalState.ErrorState.NoError) {
                this.learnCleaningRate();
            }
            this.matterOperation = MatterController.NEW_OPERATION_TRACKER();
            return {
                completionErrorCode: completionErrorCode,
                totalOperationalTime: totalOperationalTime,
                pausedTime: pausedTime
            };
        }
        if (!Object.values(stateAttrs.StatusStateAttribute.VALUE).includes(value)) {
            return null;
        }
        if (value === stateAttrs.StatusStateAttribute.VALUE.PAUSED && operation.pausedAt === null) {
            operation.pausedAt = Date.now();
        } else if (value !== stateAttrs.StatusStateAttribute.VALUE.PAUSED && operation.pausedAt !== null) {
            operation.pausedMilliseconds += Date.now() - operation.pausedAt;
            operation.pausedAt = null;
        }
        const matterError = this.getMatterOperationalError();
        const hasError = matterError.errorStateId !== matterModules.OperationalState.ErrorState.NoError;
        if (!hasError && status?.flag === stateAttrs.StatusStateAttribute.FLAG.RESUMABLE) {
            return null;
        }
        if (!hasError && value === stateAttrs.StatusStateAttribute.VALUE.RETURNING) {
            operation.sawReturning = true;
            return null;
        }
        if (!hasError && [
            stateAttrs.StatusStateAttribute.VALUE.CLEANING,
            stateAttrs.StatusStateAttribute.VALUE.PAUSED,
            stateAttrs.StatusStateAttribute.VALUE.MANUAL_CONTROL,
            stateAttrs.StatusStateAttribute.VALUE.MOVING
        ].includes(value)) {
            return null;
        }
        if (this.hasActiveSharedCleaningTask()) {
            // The shared task manager waits briefly for the robot's authoritative task-result
            // signal. Errors may be recoverable intervention states, so do not pre-empt the
            // manager with a status-derived failure either.
            return null;
        }

        let completionErrorCode = matterModules.OperationalState.ErrorState.UnableToCompleteOperation;
        if (hasError) {
            completionErrorCode = matterError.errorStateId;
        }

        const totalOperationalTime = this.getCurrentOperationDuration();
        const pausedTime = Math.min(0xffffffff, Math.round(operation.pausedMilliseconds / 1000));
        if (completionErrorCode === matterModules.OperationalState.ErrorState.NoError) {
            this.learnCleaningRate();
        }
        this.matterOperation = MatterController.NEW_OPERATION_TRACKER();

        return {completionErrorCode: completionErrorCode, totalOperationalTime: totalOperationalTime, pausedTime: pausedTime};
    }

    /**
     * @private
     * @return {number}
     */
    getMatterRunMode() {
        const status = this.robot.state.getFirstMatchingAttributeByConstructor(stateAttrs.StatusStateAttribute);

        // A paused cleanup is still an active cleaning operation. Keep the run mode
        // on Cleaning so commissioners cannot change physical cleaning settings
        // until the task has resumed or ended.
        const activeTask = this.hasActiveSharedCleaningTask();
        return status?.value === stateAttrs.StatusStateAttribute.VALUE.CLEANING || activeTask && (
            status?.value === stateAttrs.StatusStateAttribute.VALUE.PAUSED ||
            status?.value === stateAttrs.StatusStateAttribute.VALUE.ERROR ||
            status?.flag === stateAttrs.StatusStateAttribute.FLAG.RESUMABLE
        ) ? 1 : 0;
    }

    /**
     * @private
     * @return {number|null}
     */
    getMatterPhase() {
        const status = this.robot.state.getFirstMatchingAttributeByConstructor(stateAttrs.StatusStateAttribute);
        const dockStatus = this.robot.state.getFirstMatchingAttributeByConstructor(stateAttrs.DockStatusStateAttribute);
        const battery = this.robot.state.getFirstMatchingAttributeByConstructor(stateAttrs.BatteryStateAttribute);

        if (dockStatus?.value === stateAttrs.DockStatusStateAttribute.VALUE.CLEANING ||
            status?.flag === stateAttrs.StatusStateAttribute.FLAG.WASHING) {
            return MATTER_PHASES.indexOf("Mop washing");
        } else if (dockStatus?.value === stateAttrs.DockStatusStateAttribute.VALUE.EMPTYING ||
            status?.flag === stateAttrs.StatusStateAttribute.FLAG.EMPTYING) {
            return MATTER_PHASES.indexOf("Auto-emptying");
        } else if (dockStatus?.value === stateAttrs.DockStatusStateAttribute.VALUE.DRYING ||
            status?.flag === stateAttrs.StatusStateAttribute.FLAG.DRYING) {
            return MATTER_PHASES.indexOf("Drying");
        } else if (status?.value === stateAttrs.StatusStateAttribute.VALUE.RETURNING) {
            return MATTER_PHASES.indexOf("Returning");
        } else if (battery?.flag === stateAttrs.BatteryStateAttribute.FLAG.CHARGING ||
            status?.value === stateAttrs.StatusStateAttribute.VALUE.DOCKED) {
            return MATTER_PHASES.indexOf("Charging");
        } else if ([
            stateAttrs.StatusStateAttribute.VALUE.CLEANING,
            stateAttrs.StatusStateAttribute.VALUE.PAUSED
        ].includes(status?.value) || status?.flag === stateAttrs.StatusStateAttribute.FLAG.RESUMABLE &&
            this.hasActiveSharedCleaningTask()) {
            return MATTER_PHASES.indexOf("Cleaning");
        }

        return MATTER_PHASES.indexOf("Idle");
    }

    /**
     * @private
     * @return {import("../core/capabilities/OperationModeControlCapability")|null}
     */
    getOperationModeCapability() {
        return this.robot.capabilities[OperationModeControlCapability.TYPE] ?? null;
    }

    /**
     * @private
     * @return {import("../core/capabilities/MapSegmentationCapability")|null}
     */
    getMapSegmentationCapability() {
        return this.robot.capabilities[MapSegmentationCapability.TYPE] ?? null;
    }

    /**
     * @private
     * @return {Promise<Array<{areaId: number, mapId: null, areaInfo: object}>>}
     */
    async buildMatterServiceAreas() {
        const segments = await this.getMapSegmentationCapability()?.getSegments() ?? [];
        const usedIds = new Set();
        const usedNames = new Set();
        const areas = [];
        this.serviceAreaSegments.clear();
        this.mapSegmentCache.dirty = true;

        for (const segment of segments.slice(0, 255)) {
            const rawId = String(segment.id ?? "").trim();
            const numericId = /^(0|[1-9]\d*)$/.test(rawId) ? Number(rawId) : NaN;
            let areaId = Number.isSafeInteger(numericId) && numericId <= 0xffffffff ? numericId :
                crypto.createHash("sha256").update(rawId || "blank-segment-id").digest().readUInt32BE(0);
            while (usedIds.has(areaId)) {
                areaId = (areaId + 1) >>> 0;
            }
            usedIds.add(areaId);

            const baseName = String(segment.name || `Room ${rawId || areaId}`);
            let name = baseName.slice(0, 128);
            if (usedNames.has(name)) {
                let suffix = ` (${rawId || areaId})`;
                if (suffix.length >= 128) {
                    suffix = ` (${crypto.createHash("sha256").update(rawId).digest("hex").slice(0, 12)})`;
                }
                name = `${baseName.slice(0, 128 - suffix.length)}${suffix}`;
                if (usedNames.has(name)) {
                    suffix = ` (${areaId.toString(16)})`;
                    name = `${baseName.slice(0, 128 - suffix.length)}${suffix}`;
                }
            }
            usedNames.add(name);
            areas.push({
                areaId: areaId,
                mapId: null,
                areaInfo: {
                    locationInfo: {locationName: name, floorNumber: null, areaType: null},
                    landmarkInfo: null
                }
            });
            this.serviceAreaSegments.set(areaId, segment);
        }

        return areas;
    }

    /**
     * @private
     * @return {Promise<void>}
     */
    async syncServiceAreas() {
        if (!this.rvcEndpoint || !this.getMapSegmentationCapability()) {
            return;
        }
        if (this.hasActiveSharedCleaningTask() && this.serviceAreaSegments.size > 0) {
            // Live-map parsers can briefly expose only part of the room topology while a new map
            // frame is assembled. Replacing supportedAreas/progress at that point makes pending
            // and completed rooms disappear in commissioners. Keep the operation's topology
            // snapshot stable and reconcile the latest map after the task reaches a terminal state.
            return;
        }
        const now = Date.now();
        if (now - this.lastServiceAreaTopologyCheck < SERVICE_AREA_TOPOLOGY_INTERVAL_MS) {
            return;
        }
        this.lastServiceAreaTopologyCheck = now;
        const selectedAreas = this.rvcEndpoint.state.serviceArea?.selectedAreas ?? [];
        const supportedAreas = await this.buildMatterServiceAreas();
        const topologyHash = crypto.createHash("sha256").update(JSON.stringify(supportedAreas)).digest("hex");
        if (topologyHash === this.lastServiceAreaTopologyHash) {
            return;
        }
        this.lastServiceAreaTopologyHash = topologyHash;
        const validIds = new Set(supportedAreas.map(area => area.areaId));
        const preservedSelection = selectedAreas.filter(areaId => validIds.has(areaId));
        for (const areaId of this.serviceAreaProgress.keys()) {
            if (!validIds.has(areaId)) {
                this.serviceAreaProgress.delete(areaId);
            }
        }
        if (!validIds.has(this.currentServiceArea)) {
            this.currentServiceArea = null;
        }

        const progress = preservedSelection.map(areaId => this.serviceAreaProgress.get(areaId) ?? ({
            areaId: areaId,
            status: matterModules.ServiceArea.OperationalStatus.Pending
        })).map(({areaId, status, totalOperationalTime = null}) => ({
            areaId: areaId, status: status, totalOperationalTime: totalOperationalTime
        }));
        await this.rvcEndpoint.act(agent => {
            agent.serviceArea.state.selectedAreas = [];
            agent.serviceArea.state.supportedAreas = supportedAreas;
            agent.serviceArea.state.selectedAreas = preservedSelection;
            agent.serviceArea.state.progress = progress;
            if (!validIds.has(agent.serviceArea.state.currentArea)) {
                agent.serviceArea.state.currentArea = null;
            }
        });
    }

    /**
     * Fallback for legacy or temporarily untracked cleaning operations. Normal
     * room progress comes from CleaningTaskManager's shared active-task state.
     * Finds the selected Matter area containing the robot's current map position;
     * a small radius handles coordinate rounding at room borders.
     *
     * @private
     * @return {number|null}
     */
    detectCurrentServiceAreaFallback() {
        const map = this.robot.state.map;
        const position = map?.entities?.find(entity => entity.type === PointMapEntity.TYPE.ROBOT_POSITION);
        if (!position || !map.pixelSize) {
            return null;
        }
        const x = Math.round(position.points[0] / map.pixelSize);
        const y = Math.round(position.points[1] / map.pixelSize);
        const selected = new Set(this.getTrackedServiceAreaIds());
        this.rebuildMapSegmentCache();

        for (let radius = 0; radius <= 2; radius++) {
            for (const [areaId, entry] of this.mapSegmentCache.byAreaId) {
                if (!selected.has(areaId)) {
                    continue;
                }
                const dimensions = entry.layer.dimensions;
                if (x + radius < dimensions.x.min || x - radius > dimensions.x.max ||
                    y + radius < dimensions.y.min || y - radius > dimensions.y.max) {
                    continue;
                }
                const pixels = entry.layer.compressedPixels;
                for (let i = 0; i < pixels.length; i += 3) {
                    const start = pixels[i];
                    const row = pixels[i + 1];
                    const count = pixels[i + 2];
                    if (Math.abs(row - y) <= radius && x + radius >= start && x - radius < start + count) {
                        return areaId;
                    }
                }
            }
        }
        return null;
    }

    /**
     * Matter represents whole-home cleaning with an empty selectedAreas list.
     * Track every supported room in that case while an operation is active.
     *
     * @private
     * @return {Array<number>}
     */
    getTrackedServiceAreaIds() {
        const selectedAreas = this.rvcEndpoint?.state?.serviceArea?.selectedAreas ?? [];
        if (selectedAreas.length > 0) {
            return selectedAreas;
        }
        const status = this.robot.state.getFirstMatchingAttributeByConstructor(stateAttrs.StatusStateAttribute);
        if (this.matterOperation.active || [
            stateAttrs.StatusStateAttribute.VALUE.CLEANING,
            stateAttrs.StatusStateAttribute.VALUE.PAUSED
        ].includes(status?.value)) {
            return [...this.serviceAreaSegments.keys()];
        }
        return [];
    }

    /**
     * @private
     * @param {import("../entities/state/attributes/ActiveCleaningTaskStateAttribute")} task
     * @return {void}
     */
    projectActiveTaskToServiceAreas(task) {
        if (!this.rvcEndpoint?.state?.serviceArea || !matterModules?.ServiceArea ||
            ["completed", "cancelled", "stopped", "failed"].includes(task.state)) {
            return;
        }
        const areaIdBySegmentId = new Map([...this.serviceAreaSegments.entries()].map(([areaId, segment]) => [
            String(segment.id), areaId
        ]));
        const targetSegmentIds = task.target?.segmentIds ?? [];
        const trackedAreaIds = targetSegmentIds.length > 0 ? targetSegmentIds
            .map(segmentId => areaIdBySegmentId.get(String(segmentId))).filter(areaId => areaId !== undefined) :
            [...this.serviceAreaSegments.keys()];
        const currentArea = task.target?.currentSegmentId === null || task.target?.currentSegmentId === undefined ?
            null : areaIdBySegmentId.get(String(task.target.currentSegmentId)) ?? null;
        const completedRooms = Math.max(0, Math.min(trackedAreaIds.length, task.progress?.completedRooms ?? 0));
        const completedAreaIds = new Set((task.progress?.completedSegmentIds ?? [])
            .map(segmentId => areaIdBySegmentId.get(String(segmentId)))
            .filter(areaId => areaId !== undefined));
        const hasExactCompletedRooms = Array.isArray(task.progress?.completedSegmentIds);
        const statuses = matterModules.ServiceArea.OperationalStatus;
        const nextProgress = new Map();
        trackedAreaIds.forEach((areaId, index) => {
            const previous = this.serviceAreaProgress.get(areaId);
            nextProgress.set(areaId, {
                areaId: areaId,
                status: areaId === currentArea ? statuses.Operating :
                    (hasExactCompletedRooms ? completedAreaIds.has(areaId) : index < completedRooms) ?
                        statuses.Completed : statuses.Pending,
                totalOperationalTime: previous?.totalOperationalTime ?? null
            });
        });
        this.serviceAreaProgress = nextProgress;
        this.currentServiceArea = currentArea;
    }

    /**
     * @private
     * @param {object|null} operationCompletion
     * @return {void}
     */
    updateServiceAreaProgress(operationCompletion) {
        const sharedTask = this.robot.state.getFirstMatchingAttributeByConstructor(
            stateAttrs.ActiveCleaningTaskStateAttribute
        );
        if (!operationCompletion && sharedTask &&
            !["completed", "cancelled", "stopped", "failed"].includes(sharedTask.state)) {
            this.projectActiveTaskToServiceAreas(sharedTask);
            return;
        }
        const trackedAreas = operationCompletion && this.serviceAreaProgress.size > 0 ?
            [...this.serviceAreaProgress.keys()] : this.getTrackedServiceAreaIds();
        if (trackedAreas.length === 0) {
            this.serviceAreaProgress.clear();
            this.currentServiceArea = null;
            return;
        }
        const statuses = matterModules.ServiceArea.OperationalStatus;
        for (const areaId of trackedAreas) {
            if (!this.serviceAreaProgress.has(areaId)) {
                this.serviceAreaProgress.set(areaId, {areaId: areaId, status: statuses.Pending});
            }
        }

        if (operationCompletion) {
            const success = operationCompletion.completionErrorCode ===
                matterModules.OperationalState.ErrorState.NoError;
            for (const [areaId, progress] of this.serviceAreaProgress) {
                const completed = success;
                this.serviceAreaProgress.set(areaId, {
                    areaId: areaId,
                    status: completed ? statuses.Completed : statuses.Skipped,
                    totalOperationalTime: progress.startedAt || progress.elapsedSeconds ? Math.min(0xffffffff,
                        (progress.elapsedSeconds ?? 0) + (progress.startedAt ?
                            Math.round((Date.now() - progress.startedAt) / 1000) : 0)) : null
                });
            }
            this.currentServiceArea = null;
            return;
        }

        const status = this.robot.state.getFirstMatchingAttributeByConstructor(stateAttrs.StatusStateAttribute);
        if (![stateAttrs.StatusStateAttribute.VALUE.CLEANING, stateAttrs.StatusStateAttribute.VALUE.PAUSED]
            .includes(status?.value)) {
            return;
        }
        const now = Date.now();
        if (this.lastRoomDetectionAt > 0 && now - this.lastRoomDetectionAt < ROOM_DETECTION_INTERVAL_MS) {
            return;
        }
        this.lastRoomDetectionAt = now;
        // Normally CleaningTaskManager supplies currentSegmentId through the shared active-task
        // attribute and the early return above projects it directly. Keep pixel scanning only for
        // legacy/untracked tasks where no usable shared task exists.
        let detectedArea = this.detectCurrentServiceAreaFallback();
        if (detectedArea === null && trackedAreas.length === 1) {
            detectedArea = trackedAreas[0];
        }
        if (detectedArea === null || detectedArea === this.currentServiceArea) {
            return;
        }
        if (this.currentServiceArea !== null) {
            const previous = this.serviceAreaProgress.get(this.currentServiceArea);
            if (previous?.status === statuses.Operating) {
                this.serviceAreaProgress.set(this.currentServiceArea, {
                    areaId: this.currentServiceArea,
                    status: statuses.Completed,
                    totalOperationalTime: Math.min(0xffffffff,
                        (previous.elapsedSeconds ?? 0) + (previous.startedAt ?
                            Math.round((Date.now() - previous.startedAt) / 1000) : 0))
                });
            }
        }
        this.currentServiceArea = detectedArea;
        this.serviceAreaProgress.set(detectedArea, {
            areaId: detectedArea,
            status: statuses.Operating,
            startedAt: Date.now(),
            elapsedSeconds: this.serviceAreaProgress.get(detectedArea)?.totalOperationalTime ??
                this.serviceAreaProgress.get(detectedArea)?.elapsedSeconds ?? 0
        });
    }

    /**
     * @private
     * @return {Promise<void>}
     */
    async startMatterCleaning() {
        const Target = stateAttrs.CleaningTargetStateAttribute;
        const target = this.robot.state.getFirstMatchingAttributeByConstructor(Target);
        if (target?.value === Target.VALUE.SEGMENTS) {
            if (target.segmentIds.length === 0) {
                throw new Error("Select at least one room before starting segment cleaning");
            }
            const properties = this.getMapSegmentationCapability()?.getProperties?.() ?? {customOrderSupport: false};
            await this.cleaningTaskService.startSegments({
                segmentIds: target.segmentIds,
                iterations: target.iterations,
                customOrder: properties.customOrderSupport === true,
                expectedRevision: target.revision,
                source: "matter"
            });
            return;
        }
        await this.cleaningTaskService.startAll({
            expectedRevision: target?.revision,
            source: "matter"
        });
    }

    /**
     * Matter defines SelectedAreas as a set and commissioners do not guarantee
     * that list order represents cleaning order. Prefer the room order stored
     * in the robot map, with segment ID as a deterministic fallback.
     *
     * @private
     * @param {Array<number>} areaIds
     * @return {Array<number>}
     */
    orderMatterAreaIds(areaIds) {
        const cleanOrderBySegmentId = new Map((this.robot.state.map?.layers ?? []).filter(layer =>
            layer.type === MapLayer.TYPE.SEGMENT
        ).map(layer => [String(layer.metaData.segmentId), Number(layer.metaData.cleanOrder)]));

        return [...areaIds].sort((leftAreaId, rightAreaId) => {
            const leftId = String(this.serviceAreaSegments.get(leftAreaId)?.id ?? leftAreaId);
            const rightId = String(this.serviceAreaSegments.get(rightAreaId)?.id ?? rightAreaId);
            const leftOrder = cleanOrderBySegmentId.get(leftId);
            const rightOrder = cleanOrderBySegmentId.get(rightId);
            const leftHasOrder = Number.isFinite(leftOrder) && leftOrder > 0;
            const rightHasOrder = Number.isFinite(rightOrder) && rightOrder > 0;

            if (leftHasOrder && rightHasOrder && leftOrder !== rightOrder) {
                return leftOrder - rightOrder;
            }
            if (leftHasOrder !== rightHasOrder) {
                return leftHasOrder ? -1 : 1;
            }

            const leftNumeric = Number(leftId);
            const rightNumeric = Number(rightId);
            if (Number.isFinite(leftNumeric) && Number.isFinite(rightNumeric)) {
                return leftNumeric - rightNumeric;
            }
            return leftId.localeCompare(rightId);
        });
    }

    /**
     * Mirrors a commissioner selection while keeping the controller's cached
     * progress consistent with the Service Area cluster transaction.
     *
     * @private
     * @param {Array<number>} areaIds
     */
    handleMatterAreaSelection(areaIds) {
        const orderedAreaIds = this.orderMatterAreaIds(areaIds);
        const segmentIds = orderedAreaIds.map(areaId => this.serviceAreaSegments.get(areaId)?.id)
            .filter(id => id !== undefined);
        this.serviceAreaProgress.clear();
        this.currentServiceArea = null;
        for (const areaId of orderedAreaIds) {
            this.serviceAreaProgress.set(areaId, {
                areaId: areaId,
                status: matterModules.ServiceArea.OperationalStatus.Pending
            });
        }
        try {
            this.cleaningTaskService.stageTarget({
                value: segmentIds.length > 0 ? stateAttrs.CleaningTargetStateAttribute.VALUE.SEGMENTS :
                    stateAttrs.CleaningTargetStateAttribute.VALUE.ALL,
                segmentIds: segmentIds,
                source: "matter",
                active: false
            });
        } catch (error) {
            Logger.warn("Unable to stage Matter Service Area selection", error);
        }
    }

    /**
     * Applies a Web UI room selection to Matter's Service Area cluster.
     * An empty list represents whole-home cleaning.
     *
     * @public
     * @param {Array<string>} segmentIds
     * @return {Promise<void>}
     */
    async selectMatterAreasBySegmentIds(segmentIds) {
        const uniqueSegmentIds = [...new Set(segmentIds.map(String))];
        this.suppressCleaningTargetMirror = true;
        let target;
        try {
            target = this.cleaningTaskService.stageTarget({
                value: uniqueSegmentIds.length > 0 ?
                    stateAttrs.CleaningTargetStateAttribute.VALUE.SEGMENTS :
                    stateAttrs.CleaningTargetStateAttribute.VALUE.ALL,
                segmentIds: uniqueSegmentIds,
                source: "webui",
                active: false
            });
        } finally {
            this.suppressCleaningTargetMirror = false;
        }
        await this.mirrorCleaningTargetToMatter(target);
    }

    /**
     * Coalesces target changes and retries only the Service Area write when a
     * commissioner transaction temporarily owns the cluster.
     *
     * @private
     * @param {import("../entities/state/attributes/CleaningTargetStateAttribute")} target
     * @param {number} [delayMs]
     * @return {void}
     */
    queueCleaningTargetMirror(target, delayMs = TARGETED_SYNC_DELAY_MS) {
        if (this.pendingCleaningTargetMirror?.revision !== target.revision) {
            this.pendingCleaningTargetMirror = target;
            this.cleaningTargetMirrorRetries = 0;
        }
        if (this.cleaningTargetMirrorTimer !== null) {
            return;
        }
        this.cleaningTargetMirrorTimer = setTimeout(() => {
            this.cleaningTargetMirrorTimer = null;
            const pending = this.pendingCleaningTargetMirror;
            if (!pending) {
                return;
            }
            this.mirrorCleaningTargetToMatter(pending).then(() => {
                if (this.pendingCleaningTargetMirror?.revision === pending.revision) {
                    this.pendingCleaningTargetMirror = null;
                    this.cleaningTargetMirrorRetries = 0;
                } else {
                    this.queueCleaningTargetMirror(this.pendingCleaningTargetMirror, 0);
                }
            }).catch(error => {
                if (IS_SYNCHRONOUS_TRANSACTION_CONFLICT(error) &&
                    this.cleaningTargetMirrorRetries < TARGETED_SYNC_MAX_RETRIES) {
                    this.cleaningTargetMirrorRetries++;
                    this.queueCleaningTargetMirror(this.pendingCleaningTargetMirror, MATTER_TRANSACTION_RETRY_MS);
                } else {
                    Logger.warn("Unable to mirror the shared cleaning target to Matter", error);
                    this.pendingCleaningTargetMirror = null;
                    this.cleaningTargetMirrorRetries = 0;
                }
            });
        }, delayMs);
        this.cleaningTargetMirrorTimer.unref?.();
    }

    /**
     * @private
     * @param {import("../entities/state/attributes/ActiveCleaningTaskStateAttribute")} task
     * @param {number} [delayMs]
     * @return {void}
     */
    queueTaskProjection(task, delayMs = TARGETED_SYNC_DELAY_MS) {
        this.pendingTaskProjection = task;
        if (this.taskProjectionTimer !== null) {
            return;
        }
        this.taskProjectionTimer = setTimeout(() => {
            this.taskProjectionTimer = null;
            const pending = this.pendingTaskProjection;
            if (!pending) {
                return;
            }
            this.publishTaskProjection(pending).then(() => {
                if (this.pendingTaskProjection?.revision === pending.revision) {
                    this.pendingTaskProjection = null;
                    this.taskProjectionRetries = 0;
                } else {
                    this.queueTaskProjection(this.pendingTaskProjection, 0);
                }
            }).catch(error => {
                if (IS_SYNCHRONOUS_TRANSACTION_CONFLICT(error) &&
                    this.taskProjectionRetries < TARGETED_SYNC_MAX_RETRIES) {
                    this.taskProjectionRetries++;
                    this.queueTaskProjection(this.pendingTaskProjection, MATTER_TRANSACTION_RETRY_MS);
                } else {
                    Logger.warn("Unable to publish shared cleaning-task progress to Matter", error);
                    this.pendingTaskProjection = null;
                    this.taskProjectionRetries = 0;
                }
            });
        }, delayMs);
        this.taskProjectionTimer.unref?.();
    }

    /**
     * @private
     * @param {import("../entities/state/attributes/ActiveCleaningTaskStateAttribute")} task
     * @return {Promise<void>}
     */
    async publishTaskProjection(task) {
        if (this.state !== STATE.READY || !this.rvcEndpoint) {
            return;
        }
        this.projectActiveTaskToServiceAreas(task);
        const estimatedCompletionMs = Date.parse(task.progress?.estimatedCompletionTime ?? "");
        const projection = {
            currentArea: this.currentServiceArea,
            progress: [...this.serviceAreaProgress.values()].map(entry => ({
                areaId: entry.areaId,
                status: entry.status,
                totalOperationalTime: entry.totalOperationalTime ?? null
            })),
            countdownTime: Number.isFinite(task.progress?.estimatedRemainingSeconds) ?
                Math.max(0, Math.round(task.progress.estimatedRemainingSeconds)) : null,
            estimatedEndTime: Number.isFinite(estimatedCompletionMs) ? Math.round(estimatedCompletionMs / 1000) : null
        };
        if (STATE_VALUES_EQUAL(projection, this.lastPublishedTaskProjection)) {
            return;
        }
        await this.rvcEndpoint.act(agent => {
            if (agent.serviceArea) {
                agent.serviceArea.state.currentArea = projection.currentArea;
                agent.serviceArea.state.progress = projection.progress;
                agent.serviceArea.state.estimatedEndTime = projection.estimatedEndTime;
            }
            agent.rvcOperationalState.state.countdownTime = projection.countdownTime;
        });
        this.lastPublishedTaskProjection = projection;
    }

    /**
     * Mirrors the backend-owned cleaning target into Matter when Service Area is available.
     * Matter has no staged "none" selection, so an explicitly cleared draft is not mirrored.
     *
     * @private
     * @param {import("../entities/state/attributes/CleaningTargetStateAttribute")} target
     * @return {Promise<void>}
     */
    async mirrorCleaningTargetToMatter(target) {
        const Target = stateAttrs.CleaningTargetStateAttribute;
        if (target.value === Target.VALUE.NONE || this.state !== STATE.READY ||
            !this.rvcEndpoint?.state?.serviceArea) {
            return;
        }
        if (target.value === Target.VALUE.SEGMENTS && target.segmentIds.length === 0) {
            return;
        }
        const segmentIds = target.value === Target.VALUE.SEGMENTS ? target.segmentIds.map(String) : [];
        const areaIdsBySegmentId = new Map([...this.serviceAreaSegments.entries()].map(([areaId, segment]) => [
            String(segment.id), areaId
        ]));
        const areaIds = segmentIds.map(segmentId => areaIdsBySegmentId.get(segmentId));
        if (areaIds.some(areaId => areaId === undefined)) {
            throw new RangeError("One or more selected rooms are no longer available in Matter");
        }
        const statuses = matterModules.ServiceArea.OperationalStatus;
        const progress = areaIds.map(areaId => ({
            areaId: areaId,
            status: statuses.Pending,
            totalOperationalTime: null
        }));
        await this.rvcEndpoint.act(agent => {
            agent.serviceArea.state.selectedAreas = areaIds;
            agent.serviceArea.state.progress = progress;
            agent.serviceArea.state.currentArea = null;
            agent.serviceArea.state.estimatedEndTime = null;
        });
        this.serviceAreaProgress.clear();
        this.currentServiceArea = null;
        for (const entry of progress) {
            this.serviceAreaProgress.set(entry.areaId, entry);
        }
        this.lastPublishedTaskProjection = null;
    }

    /**
     * @private
     * @return {Promise<void>}
     */
    async stopMatterCleaning() {
        await this.cleaningTaskService.stop({source: "matter"});
    }

    /** @private */
    async pauseMatterCleaning() {
        await this.cleaningTaskService.pause({source: "matter"});
    }

    /** @private */
    async resumeMatterCleaning() {
        await this.cleaningTaskService.resume({source: "matter"});
    }

    /**
     * @private
     * @return {Array<string>}
     */
    getCleanModeMappingOptions() {
        const presets = this.getOperationModeCapability()?.getPresets() ?? [];

        return [
            stateAttrs.PresetSelectionStateAttribute.MODE.VACUUM_AND_MOP,
            stateAttrs.PresetSelectionStateAttribute.MODE.VACUUM_THEN_MOP
        ].filter(mode => presets.includes(mode));
    }

    /**
     * @private
     * @return {{fan: Array<string>, water: Array<string>, route: Array<string>}}
     */
    getCleanModeStrengthOptions() {
        return {
            fan: this.robot.capabilities[FanSpeedControlCapability.TYPE]?.getPresets() ?? [],
            water: this.robot.capabilities[WaterUsageControlCapability.TYPE]?.getPresets() ?? [],
            route: this.robot.capabilities[CleanRouteControlCapability.TYPE]?.getProperties()?.supportedRoutes ?? []
        };
    }

    /**
     * @private
     * @param {string} profile
     * @param {"fan"|"water"|"route"} type
     * @param {Array<string>} presets
     * @return {string|undefined}
     */
    resolveStrengthPreset(profile, type, presets) {
        const configured = this.currentConfig.cleanModeProfiles?.[profile]?.[type];
        if (presets.includes(configured)) {
            return configured;
        }
        const usablePresets = presets.filter(preset => preset !== stateAttrs.PresetSelectionStateAttribute.INTENSITY.OFF);
        if (usablePresets.length === 0) {
            return presets[0];
        }
        if (profile === "minimum" || profile === "quiet") {
            return usablePresets[0];
        } else if (profile === "maximum" || profile === "deepClean") {
            return usablePresets[usablePresets.length - 1];
        }
        return usablePresets[Math.floor((usablePresets.length - 1) / 2)];
    }

    /**
     * @private
     * @param {string} profile
     * @param {Array<string>} routes
     * @return {string|undefined}
     */
    resolveCleanRoute(profile, routes) {
        const configured = this.currentConfig.cleanModeProfiles?.[profile]?.route;
        if (routes.includes(configured)) {
            return configured;
        }
        if (routes.length === 0) {
            return undefined;
        }
        const preferred = profile === "minimum" ? CleanRouteControlCapability.ROUTE.QUICK :
            profile === "maximum" ? CleanRouteControlCapability.ROUTE.INTENSIVE :
                profile === "deepClean" ? CleanRouteControlCapability.ROUTE.DEEP :
                    CleanRouteControlCapability.ROUTE.ROUTINE;
        return routes.includes(preferred) ? preferred :
            this.resolveStrengthPreset(profile, "route", routes);
    }

    /**
     * Apply and verify a Matter cleaning profile. Already-applied settings are
     * restored on a best-effort basis if a later step fails.
     *
     * @private
     * @param {{operationMode: string, fanPreset?: string, waterPreset?: string, cleanRoute?: string}} mapping
     * @return {Promise<void>}
     */
    async applyMatterCleanMode(mapping) {
        const attributeFor = type => this.robot.state.getFirstMatchingAttribute({
            attributeClass: stateAttrs.PresetSelectionStateAttribute.name,
            attributeType: type
        });
        const presetSteps = [
            {
                name: "operation mode",
                capability: this.getOperationModeCapability(),
                target: mapping.operationMode,
                type: stateAttrs.PresetSelectionStateAttribute.TYPE.OPERATION_MODE
            },
            {
                name: "fan speed",
                capability: this.robot.capabilities[FanSpeedControlCapability.TYPE],
                target: mapping.fanPreset,
                type: stateAttrs.PresetSelectionStateAttribute.TYPE.FAN_SPEED
            },
            {
                name: "water usage",
                capability: this.robot.capabilities[WaterUsageControlCapability.TYPE],
                target: mapping.waterPreset,
                type: stateAttrs.PresetSelectionStateAttribute.TYPE.WATER_GRADE
            }
        ].filter(step => step.capability && step.target !== undefined).map(step => ({
            name: step.name,
            target: step.target,
            getCurrent: async () => attributeFor(step.type)?.value,
            apply: value => step.capability.selectPreset(value)
        }));
        const cleanRouteCapability = this.robot.capabilities[CleanRouteControlCapability.TYPE];
        const steps = [...presetSteps];
        if (cleanRouteCapability && mapping.cleanRoute !== undefined) {
            steps.push({
                name: "clean route",
                target: mapping.cleanRoute,
                getCurrent: () => cleanRouteCapability.getRoute(),
                apply: async value => {
                    await cleanRouteCapability.setRoute(value);
                    cleanRouteCapability.notifyRouteChanged?.(value);
                }
            });
        }
        const applied = [];

        try {
            for (const step of steps) {
                const previous = await step.getCurrent();
                await step.apply(step.target);
                applied.push({...step, previous: previous});
            }
            let mismatches = steps;
            for (let attempt = 0; attempt < CLEAN_MODE_VERIFICATION_ATTEMPTS; attempt++) {
                await this.robot.pollState();
                const matches = await Promise.all(steps.map(async step => (await step.getCurrent()) === step.target));
                mismatches = steps.filter((step, index) => !matches[index]);
                if (mismatches.length === 0) {
                    break;
                }
                if (attempt + 1 < CLEAN_MODE_VERIFICATION_ATTEMPTS) {
                    await new Promise(resolve => setTimeout(resolve, CLEAN_MODE_VERIFICATION_DELAY_MS));
                }
            }
            if (mismatches.length > 0) {
                throw new Error("Robot did not confirm " + mismatches.map(step => step.name).join(", "));
            }
        } catch (e) {
            Logger.error(
                `Matter clean mode change failed after applying: ${applied.map(step => step.name).join(", ") || "nothing"}`,
                e
            );
            for (const step of [...applied].reverse()) {
                if (step.previous !== undefined) {
                    try {
                        await step.apply(step.previous);
                    } catch (rollbackError) {
                        Logger.warn(`Unable to roll back Matter ${step.name}`, rollbackError);
                    }
                }
            }
            throw e;
        }
    }

    /**
     * @private
     * @param {any} RvcCleanMode
     * @return {Array<{label: string, mode: number, modeTags: Array<{value: number, mfgCode?: number}>}>}
     */
    buildMatterCleanModes(RvcCleanMode) {
        const presets = this.getOperationModeCapability()?.getPresets() ?? [];
        const modes = [];
        const presetMode = stateAttrs.PresetSelectionStateAttribute.MODE;
        this.cleanModeMatterModeToPreset.clear();

        const combinedOptions = this.getCleanModeMappingOptions();
        let combinedPreset = this.currentConfig.cleanModeMapping;
        if (!combinedOptions.includes(combinedPreset)) {
            combinedPreset = combinedOptions[0];
        }
        const operationModes = [
            {
                preset: presetMode.VACUUM,
                label: "Vacuum",
                modeBase: CLEAN_MODE_IDS.vacuum,
                tags: [RvcCleanMode.ModeTag.Vacuum]
            },
            {
                preset: presetMode.MOP,
                label: "Mop",
                modeBase: CLEAN_MODE_IDS.mop,
                tags: [RvcCleanMode.ModeTag.Mop]
            }
        ];
        if (combinedPreset) {
            operationModes.push({
                preset: combinedPreset,
                aliases: combinedOptions,
                label: combinedPreset === presetMode.VACUUM_THEN_MOP ? "Vacuum then Mop" : "Vacuum & Mop",
                modeBase: CLEAN_MODE_IDS.combined,
                tags: [RvcCleanMode.ModeTag.Vacuum, RvcCleanMode.ModeTag.Mop]
            });
        }

        const strengthOptions = this.getCleanModeStrengthOptions();
        const hasStrengths = strengthOptions.fan.length > 0 || strengthOptions.water.length > 0 ||
            strengthOptions.route.length > 0;
        const profiles = hasStrengths ? [
            {id: "minimum", label: "Minimum", tag: RvcCleanMode.ModeTag.Min, offset: 0},
            {id: "quiet", label: "Quiet", tag: RvcCleanMode.ModeTag.Quiet, offset: 1},
            // Matter RVC has no Standard/Normal tag. Auto keeps this middle
            // profile distinct and visible in commissioners such as Apple Home.
            {id: "standard", label: "Standard", tag: RvcCleanMode.ModeTag.Auto, offset: 2},
            {id: "maximum", label: "Maximum", tag: RvcCleanMode.ModeTag.Max, offset: 3},
            {id: "deepClean", label: "Deep Clean", tag: RvcCleanMode.ModeTag.DeepClean, offset: 4}
        ].filter(profile => this.currentConfig.cleanModeProfiles?.[profile.id]?.enabled !== false) :
            [{id: "standard", label: "", tag: null, offset: 0}];

        for (const operationMode of operationModes.filter(mode => presets.includes(mode.preset))) {
            for (const profile of profiles) {
                const mode = operationMode.modeBase + profile.offset;
                const tags = [...operationMode.tags];
                if (profile.tag !== null) {
                    tags.push(profile.tag);
                }
                modes.push({
                    label: `${operationMode.label} ${profile.label}`.trim(),
                    mode: mode,
                    modeTags: tags.map(value => ({value: value}))
                });
                this.cleanModeMatterModeToPreset.set(mode, {
                    operationMode: operationMode.preset,
                    operationModeAliases: operationMode.aliases ?? [operationMode.preset],
                    profile: profile.id,
                    fanPreset: this.resolveStrengthPreset(profile.id, "fan", strengthOptions.fan),
                    waterPreset: this.resolveStrengthPreset(profile.id, "water", strengthOptions.water),
                    cleanRoute: this.resolveCleanRoute(profile.id, strengthOptions.route)
                });
            }
        }

        return modes;
    }

    /**
     * @private
     * @return {number}
     */
    getMatterCleanMode() {
        const operationMode = this.robot.state.getFirstMatchingAttribute({
            attributeClass: stateAttrs.PresetSelectionStateAttribute.name,
            attributeType: stateAttrs.PresetSelectionStateAttribute.TYPE.OPERATION_MODE
        });
        const fan = this.robot.state.getFirstMatchingAttribute({
            attributeClass: stateAttrs.PresetSelectionStateAttribute.name,
            attributeType: stateAttrs.PresetSelectionStateAttribute.TYPE.FAN_SPEED
        });
        const water = this.robot.state.getFirstMatchingAttribute({
            attributeClass: stateAttrs.PresetSelectionStateAttribute.name,
            attributeType: stateAttrs.PresetSelectionStateAttribute.TYPE.WATER_GRADE
        });
        let standardMode;
        for (const [mode, mapping] of this.cleanModeMatterModeToPreset) {
            if (!mapping.operationModeAliases.includes(operationMode?.value)) {
                continue;
            }
            if (mapping.profile === "standard") {
                standardMode = mode;
            }
            if (
                (mapping.fanPreset === undefined || fan?.value === mapping.fanPreset) &&
                (mapping.waterPreset === undefined || water?.value === mapping.waterPreset)
            ) {
                return mode;
            }
        }

        return standardMode ?? this.cleanModeMatterModeToPreset.keys().next().value;
    }

    /**
     * @private
     * @param {{rvc?: boolean, battery?: boolean}} [domains]
     * @return {Promise<void>}
     */
    async syncRobotState(domains = {}) {
        if (this.matterCommandDepth > 0) {
            return;
        }
        const syncRvc = domains.rvc !== false;
        const syncBattery = domains.battery !== false;
        if (syncRvc && this.rvcEndpoint) {
            const filterResourceState = this.filterResourceStateCache;
            const waterTankResourceState = this.waterTankResourceSupported ?
                this.getWaterTankResourceState() : null;
            const dockStatus = this.robot.state.getFirstMatchingAttributeByConstructor(
                stateAttrs.DockStatusStateAttribute
            );
            if ([
                stateAttrs.DockStatusStateAttribute.VALUE.CLEANING,
                stateAttrs.DockStatusStateAttribute.VALUE.DRYING,
                stateAttrs.DockStatusStateAttribute.VALUE.EMPTYING
            ].includes(dockStatus?.value)) {
                this.lastDockActivity = dockStatus.value;
            }
            const operationalState = this.getMatterOperationalState();
            const operationalError = this.getMatterOperationalError();
            const detectedOperationCompletion = this.updateOperationLifecycle();
            if (detectedOperationCompletion) {
                this.pendingMatterOperationCompletion = detectedOperationCompletion;
            }
            const operationCompletion = this.pendingMatterOperationCompletion;
            this.updateServiceAreaProgress(operationCompletion);
            const currentPhase = this.getMatterPhase();
            const countdownTime = this.getMatterCountdown(currentPhase);
            const now = Date.now();
            const countdownChangedMaterially = countdownTime === null || this.lastPublishedCountdown.value === null ||
                Math.abs(countdownTime - this.lastPublishedCountdown.value) >= 15;
            const publishCountdown = currentPhase !== this.lastPublishedCountdown.phase || countdownTime === 0 ||
                (now - this.lastPublishedCountdown.timestamp >= 30_000 && countdownChangedMaterially);
            if (publishCountdown) {
                this.lastPublishedCountdown = {value: countdownTime, phase: currentPhase, timestamp: now};
            }
            let currentAreaCountdown = null;
            if (this.currentServiceArea !== null && this.currentCleaningRate) {
                const progress = this.serviceAreaProgress.get(this.currentServiceArea);
                const elapsed = (progress?.elapsedSeconds ?? 0) + (progress?.startedAt ?
                    (Date.now() - progress.startedAt) / 1000 : 0);
                currentAreaCountdown = Math.max(0, Math.round(
                    (this.getAreaForServiceArea(this.currentServiceArea) ?? 0) * this.currentCleaningRate - elapsed
                ));
            }
            const runMode = this.getMatterRunMode();
            const cleanMode = this.getMatterCleanMode();
            const progressAreaIds = this.serviceAreaProgress.size > 0 ?
                [...this.serviceAreaProgress.keys()] : this.getTrackedServiceAreaIds();
            const progressState = progressAreaIds.map(areaId => {
                const progress = this.serviceAreaProgress.get(areaId) ?? {
                    areaId: areaId,
                    status: matterModules.ServiceArea.OperationalStatus.Pending
                };
                return {
                    areaId: areaId,
                    status: progress.status,
                    totalOperationalTime: progress.totalOperationalTime ?? null,
                    estimatedTime: this.currentCleaningRate ? Math.min(0xffffffff,
                        Math.round((this.getAreaForServiceArea(areaId) ?? 0) * this.currentCleaningRate)) : null
                };
            });
            const nextRvcState = {
                operationalState: operationalState,
                operationalError: operationalError,
                currentPhase: currentPhase,
                countdownTime: publishCountdown ? countdownTime : this.lastPublishedRvcState?.countdownTime,
                runMode: runMode,
                cleanMode: cleanMode,
                currentArea: this.currentServiceArea,
                progress: progressState,
                estimatedEndTime: publishCountdown ? (currentAreaCountdown !== null ?
                    Math.round(now / 1000) + currentAreaCountdown : null) :
                    this.lastPublishedRvcState?.estimatedEndTime,
                filterResource: filterResourceState ?? this.lastPublishedRvcState?.filterResource ?? null,
                waterTankResource: waterTankResourceState ?? this.lastPublishedRvcState?.waterTankResource ?? null
            };
            const previousRvcState = this.lastPublishedRvcState;
            const rvcStateChanged = !STATE_VALUES_EQUAL(nextRvcState, previousRvcState);
            if (rvcStateChanged || operationCompletion) {
                await this.rvcEndpoint.act(agent => {
                    if (rvcStateChanged &&
                        (!previousRvcState || nextRvcState.operationalState !== previousRvcState.operationalState)) {
                        agent.rvcOperationalState.state.operationalState = nextRvcState.operationalState;
                    }
                    if (rvcStateChanged && (!previousRvcState || !STATE_VALUES_EQUAL(nextRvcState.operationalError,
                        previousRvcState.operationalError))) {
                        agent.rvcOperationalState.state.operationalError = nextRvcState.operationalError;
                    }
                    if (rvcStateChanged &&
                        (!previousRvcState || nextRvcState.currentPhase !== previousRvcState.currentPhase)) {
                        agent.rvcOperationalState.state.currentPhase = nextRvcState.currentPhase;
                    }
                    if (rvcStateChanged &&
                        (!previousRvcState || nextRvcState.countdownTime !== previousRvcState.countdownTime)) {
                        agent.rvcOperationalState.state.countdownTime = nextRvcState.countdownTime;
                    }
                    if (rvcStateChanged &&
                        (!previousRvcState || nextRvcState.runMode !== previousRvcState.runMode)) {
                        agent.rvcRunMode.state.currentMode = nextRvcState.runMode;
                    }
                    if (rvcStateChanged && nextRvcState.cleanMode !== undefined && agent.rvcCleanMode &&
                        (!previousRvcState || nextRvcState.cleanMode !== previousRvcState.cleanMode)) {
                        agent.rvcCleanMode.state.currentMode = nextRvcState.cleanMode;
                    }
                    if (rvcStateChanged && agent.serviceArea) {
                        if (!previousRvcState || nextRvcState.currentArea !== previousRvcState.currentArea) {
                            agent.serviceArea.state.currentArea = nextRvcState.currentArea;
                        }
                        if (!previousRvcState || !STATE_VALUES_EQUAL(nextRvcState.progress, previousRvcState.progress)) {
                            agent.serviceArea.state.progress = nextRvcState.progress;
                        }
                        if (!previousRvcState ||
                            nextRvcState.estimatedEndTime !== previousRvcState.estimatedEndTime) {
                            agent.serviceArea.state.estimatedEndTime = nextRvcState.estimatedEndTime;
                        }
                    }
                    if (rvcStateChanged) {
                        for (const [behavior, resource, previousResource] of [
                            [agent.hepaFilterMonitoring, nextRvcState.filterResource,
                                previousRvcState?.filterResource],
                            [agent.waterTankLevelMonitoring, nextRvcState.waterTankResource,
                                previousRvcState?.waterTankResource]
                        ]) {
                            if (behavior && resource && !STATE_VALUES_EQUAL(resource, previousResource)) {
                                behavior.state.condition = resource.condition;
                                behavior.state.changeIndication = resource.changeIndication;
                                behavior.state.inPlaceIndicator = resource.inPlaceIndicator;
                            }
                        }
                    }
                    if (operationCompletion) {
                        agent.rvcOperationalState.reportOperationCompletion(operationCompletion);
                    }
                });
                if (rvcStateChanged) {
                    this.lastPublishedRvcState = nextRvcState;
                }
                if (operationCompletion) {
                    this.pendingMatterOperationCompletion = null;
                }
            }
        }

        if (syncBattery && this.batteryEndpoint) {
            const battery = this.robot.state.getFirstMatchingAttributeByConstructor(stateAttrs.BatteryStateAttribute);

            if (battery) {
                const batPercentRemaining = Math.round(Math.max(0, Math.min(100, battery.level)) * 2);
                const batChargeLevel = battery.level <= 10 ? matterModules.PowerSource.BatChargeLevel.Critical :
                    battery.level <= 20 ? matterModules.PowerSource.BatChargeLevel.Warning :
                        matterModules.PowerSource.BatChargeLevel.Ok;
                let batChargeState;
                const batteryFaults = this.getMatterBatteryFaults();

                switch (battery.flag) {
                    case stateAttrs.BatteryStateAttribute.FLAG.CHARGING:
                        batChargeState = matterModules.PowerSource.BatChargeState.IsCharging;
                        break;
                    case stateAttrs.BatteryStateAttribute.FLAG.CHARGED:
                        batChargeState = matterModules.PowerSource.BatChargeState.IsAtFullCharge;
                        break;
                    case stateAttrs.BatteryStateAttribute.FLAG.DISCHARGING:
                        batChargeState = matterModules.PowerSource.BatChargeState.IsNotCharging;
                        break;
                    default:
                        batChargeState = matterModules.PowerSource.BatChargeState.Unknown;
                }

                const nextBatteryState = {
                    batPercentRemaining: batPercentRemaining,
                    batChargeLevel: batChargeLevel,
                    batChargeState: batChargeState,
                    activeBatFaults: batteryFaults.activeBatFaults,
                    activeBatChargeFaults: batteryFaults.activeBatChargeFaults
                };
                if (!STATE_VALUES_EQUAL(nextBatteryState, this.lastPublishedBatteryState)) {
                    const previousBatteryState = this.lastPublishedBatteryState;
                    await this.batteryEndpoint.act(agent => {
                        for (const [key, value] of Object.entries(nextBatteryState)) {
                            if (!previousBatteryState || !STATE_VALUES_EQUAL(value, previousBatteryState[key])) {
                                agent.powerSource.state[key] = value;
                            }
                        }
                    });
                    this.lastPublishedBatteryState = nextBatteryState;
                }
            }
        }
    }

    /**
     * @private
     */
    subscribeToRobotState() {
        for (const attributeClass of [
            stateAttrs.CleaningTargetStateAttribute,
            stateAttrs.ActiveCleaningTaskStateAttribute,
            stateAttrs.StatusStateAttribute,
            stateAttrs.DockStatusStateAttribute,
            stateAttrs.DockComponentStateAttribute,
            stateAttrs.AttachmentStateAttribute,
            stateAttrs.BatteryStateAttribute,
            stateAttrs.PresetSelectionStateAttribute
        ]) {
            this.robot.state.subscribe(this.robotStateSubscriber, {attributeClass: attributeClass.name});
        }
    }

    /**
     * @private
     * @return {Promise<void>}
     */
    async start() {
        this.state = STATE.STARTING;
        this.lastError = null;

        Logger.info("Matter controller starting");

        this.ensureCredentials();

        if (matterModules === null) {
            this.state = STATE.ERROR;
            this.lastError = "matter.js runtime unavailable: " + (matterLoadError?.message ?? "unknown");
            Logger.error("Failed to load the Matter runtime bundle", matterLoadError);
            return;
        }

        const {
            ServerNode,
            Environment,
            VendorId,
            RoboticVacuumCleanerDevice,
            createRoboticVacuumCleanerDevice,
            BatteryPowerSourceEndpoint,
            PowerSource,
            RvcRunMode,
            RvcCleanMode,
            RvcOperationalState
        } = matterModules;

        Environment.default.vars.set("storage.path", this.getStorageLocation());

        try {
            const identity = await this.getDeviceIdentity();
            const locateCapability = this.robot.capabilities[LocateCapability.TYPE];
            const basicControlCapability = this.robot.capabilities[BasicControlCapability.TYPE];
            const mapSegmentationCapability = this.getMapSegmentationCapability();
            this.filterResourceMeta = this.getFilterResourceMeta();
            this.waterTankResourceSupported = this.robot.getModelDetails().supportedDockComponents.includes(
                stateAttrs.DockComponentStateAttribute.TYPE.WATER_TANK_CLEAN
            );
            const initialFilterResourceState = await this.getFilterResourceState() ?? {
                condition: 100,
                degradationDirection: matterModules.ResourceMonitoring.DegradationDirection.Down,
                changeIndication: matterModules.ResourceMonitoring.ChangeIndication.Ok,
                inPlaceIndicator: true
            };
            this.filterResourceStateCache = initialFilterResourceState;
            this.lastFilterResourcePoll = Date.now();
            const initialWaterTankResourceState = this.getWaterTankResourceState();
            const cleanModes = this.buildMatterCleanModes(RvcCleanMode);
            this.migratePersistedCleanMode(cleanModes, this.getMatterCleanMode());
            const supportedAreas = mapSegmentationCapability ? await this.buildMatterServiceAreas() : [];
            this.mapTopologyVersion = this.getMapTopologyVersion();
            this.lastServiceAreaTopologyHash = mapSegmentationCapability ?
                crypto.createHash("sha256").update(JSON.stringify(supportedAreas)).digest("hex") : null;
            const rvcDevice = createRoboticVacuumCleanerDevice({
                locate: locateCapability ? () => this.executeMatterCommand(() => locateCapability.locate()) : undefined,
                changeCleanMode: cleanModes.length > 0 ? mode => this.executeMatterCommand(() => {
                    const mapping = this.cleanModeMatterModeToPreset.get(mode);
                    if (!mapping) {
                        throw new Error("Unsupported Matter clean mode");
                    }
                    return this.applyMatterCleanMode(mapping);
                }) : undefined,
                changeRunMode: basicControlCapability ? mode => this.executeMatterCommand(() => {
                    return mode === 1 ? this.startMatterCleaning() : this.stopMatterCleaning();
                }) : undefined,
                pause: basicControlCapability ? () => this.executeMatterCommand(() =>
                    this.pauseMatterCleaning()) : undefined,
                resume: basicControlCapability ? () => this.executeMatterCommand(() =>
                    this.resumeMatterCleaning()) : undefined,
                goHome: basicControlCapability ? () => this.executeMatterCommand(() =>
                    this.cleaningTaskService.home({source: "matter"})) : undefined,
                serviceArea: !!mapSegmentationCapability,
                selectAreas: mapSegmentationCapability ? areaIds => {
                    this.handleMatterAreaSelection(areaIds);
                } : undefined,
                resetFilter: this.filterResourceMeta ? () => this.executeMatterCommand(() =>
                    this.resetFilterResource()) : undefined,
                refreshWaterTank: this.waterTankResourceSupported ? () => this.executeMatterCommand(() =>
                    this.robot.pollState()) : undefined,
                skipArea: typeof (/** @type {any} */ (mapSegmentationCapability))?.skipSegment === "function" ? areaId =>
                    this.executeMatterCommand(async () => {
                        const segment = this.serviceAreaSegments.get(areaId);
                        if (!segment) {
                            throw new Error("Selected room is no longer available");
                        }
                        await (/** @type {any} */ (mapSegmentationCapability)).skipSegment(segment);
                        this.serviceAreaProgress.set(areaId, {
                            areaId: areaId,
                            status: matterModules.ServiceArea.OperationalStatus.Skipped,
                            totalOperationalTime: null
                        });
                        if (this.currentServiceArea === areaId) {
                            this.currentServiceArea = null;
                        }
                    }) : undefined
            });

            this.node = await this.createServerNodeWithLockRetry(ServerNode, {
                id: NODE_ID,
                productDescription: {
                    name: identity.deviceName,
                    deviceType: RoboticVacuumCleanerDevice.deviceType
                },
                commissioning: {
                    passcode: this.currentConfig.commissioning.passcode,
                    discriminator: this.currentConfig.commissioning.discriminator
                },
                productDescriptor: {
                    vendorId: VendorId(this.currentConfig.identity.vendorId),
                    productId: this.currentConfig.identity.productId
                },
                basicInformation: {
                    vendorName: identity.manufacturer,
                    productName: identity.model,
                    productLabel: identity.deviceName,
                    nodeLabel: identity.deviceName,
                    vendorId: VendorId(this.currentConfig.identity.vendorId),
                    productId: this.currentConfig.identity.productId,
                    serialNumber: identity.serialNumber,
                    softwareVersion: identity.softwareVersion,
                    softwareVersionString: identity.softwareVersionString
                },
                network: {
                    port: this.currentConfig.commissioning.port
                }
            });

            this.rvcEndpoint = await this.node.add(rvcDevice, {
                id: "rvc",
                rvcRunMode: {
                    supportedModes: [
                        {label: "Idle", mode: 0, modeTags: [{value: RvcRunMode.ModeTag.Idle}]},
                        {label: "Cleaning", mode: 1, modeTags: [{value: RvcRunMode.ModeTag.Cleaning}]}
                    ],
                    currentMode: this.getMatterRunMode()
                },
                ...(cleanModes.length > 0 ? {rvcCleanMode: {
                    supportedModes: cleanModes,
                    currentMode: this.getMatterCleanMode()
                }} : {}),
                ...(mapSegmentationCapability ? {serviceArea: {
                    supportedAreas: supportedAreas,
                    selectedAreas: [],
                    supportedMaps: [],
                    progress: [],
                    currentArea: null,
                    estimatedEndTime: null
                }} : {}),
                ...(this.filterResourceMeta ? {hepaFilterMonitoring: initialFilterResourceState} : {}),
                ...(this.waterTankResourceSupported ? {
                    waterTankLevelMonitoring: initialWaterTankResourceState
                } : {}),
                rvcOperationalState: {
                    phaseList: MATTER_PHASES,
                    currentPhase: this.getMatterPhase(),
                    countdownTime: null,
                    operationalStateList: [
                        {operationalStateId: RvcOperationalState.OperationalState.Stopped},
                        {operationalStateId: RvcOperationalState.OperationalState.Running},
                        {operationalStateId: RvcOperationalState.OperationalState.Paused},
                        {operationalStateId: RvcOperationalState.OperationalState.Error},
                        {operationalStateId: RvcOperationalState.OperationalState.SeekingCharger},
                        {operationalStateId: RvcOperationalState.OperationalState.Charging},
                        {operationalStateId: RvcOperationalState.OperationalState.Docked}
                    ],
                    operationalState: this.getMatterOperationalState()
                }
            });

            if (mapSegmentationCapability && !this.mapUpdatesSubscribed) {
                this.robot.onMapUpdated(this.mapUpdateListener);
                this.mapUpdatesSubscribed = true;
            }

            const battery = this.robot.state.getFirstMatchingAttributeByConstructor(stateAttrs.BatteryStateAttribute);
            const batteryFaults = this.getMatterBatteryFaults();
            this.batteryEndpoint = await this.node.add(BatteryPowerSourceEndpoint, {
                id: "battery",
                powerSource: {
                    status: PowerSource.PowerSourceStatus.Active,
                    order: 0,
                    description: "Robot battery",
                    endpointList: [this.rvcEndpoint.number],
                    batChargeLevel: battery?.level <= 10 ? PowerSource.BatChargeLevel.Critical :
                        battery?.level <= 20 ? PowerSource.BatChargeLevel.Warning : PowerSource.BatChargeLevel.Ok,
                    batReplacementNeeded: false,
                    batReplaceability: PowerSource.BatReplaceability.NotReplaceable,
                    batPercentRemaining: battery ? Math.round(Math.max(0, Math.min(100, battery.level)) * 2) : null,
                    batPresent: true,
                    activeBatFaults: batteryFaults.activeBatFaults,
                    batChargeState: PowerSource.BatChargeState.Unknown,
                    batFunctionalWhileCharging: true,
                    activeBatChargeFaults: batteryFaults.activeBatChargeFaults
                }
            });

            this.subscribeToRobotState();
            await this.syncRobotState();

            await this.node.start();
            this.auxiliaryRefreshEnabled = true;
            this.scheduleAuxiliaryRefresh(AUXILIARY_REFRESH_INTERVAL_MS);

            this.state = STATE.READY;
            const cleaningTarget = this.robot.state.getFirstMatchingAttributeByConstructor(
                stateAttrs.CleaningTargetStateAttribute
            );
            if (cleaningTarget) {
                try {
                    await this.mirrorCleaningTargetToMatter(cleaningTarget);
                } catch (error) {
                    Logger.warn("Unable to restore the shared cleaning target after Matter startup", error);
                }
            }
            Logger.info(
                "Matter controller ready " +
                `(commissioned=${this.node.state.commissioning.commissioned}, ` +
                `port=${this.currentConfig.commissioning.port})`
            );
        } catch (e) {
            this.state = STATE.ERROR;
            this.lastError = e.message;
            Logger.error("Matter start failed", e);

            if (this.node) {
                try {
                    await this.node.close();
                } catch (closeErr) {
                    Logger.debug("Ignoring error during cleanup close", closeErr);
                }
                this.node = null;
            }
            this.robot.state.unsubscribeAll(this.robotStateSubscriber);
            if (this.mapUpdatesSubscribed) {
                this.robot.offMapUpdated(this.mapUpdateListener);
                this.mapUpdatesSubscribed = false;
            }
            this.rvcEndpoint = null;
            this.batteryEndpoint = null;
            this.cleanModeMatterModeToPreset.clear();
            this.serviceAreaSegments.clear();
            this.serviceAreaProgress.clear();
            this.currentServiceArea = null;
            this.lastDockActivity = null;
            this.pendingOperationOutcome = null;
            this.clearTargetedSyncs();
            this.lastServiceAreaTopologyHash = null;
            this.lastServiceAreaTopologyCheck = 0;
            this.mapTopologyVersion = null;
            this.lastPublishedCountdown = {value: null, phase: null, timestamp: 0};
            this.matterOperation = MatterController.NEW_OPERATION_TRACKER();
        }
    }

    /**
     * @public
     * @return {Promise<void>}
     */
    async shutdown() {
        return this.runExclusive(() => {
            return this.shutdownInternal();
        });
    }

    /**
     * @private
     * Must only be called while holding the configUpdate mutex.
     *
     * @return {Promise<void>}
     */
    async shutdownInternal() {
        if (this.state === STATE.DISABLED && !this.node) {
            return;
        }

        Logger.info("Matter controller shutting down");
        this.auxiliaryRefreshEnabled = false;
        this.clearTargetedSyncs();

        if (this.robotStateSyncTimer !== null) {
            clearTimeout(this.robotStateSyncTimer);
            this.robotStateSyncTimer = null;
        }
        if (this.auxiliaryRefreshTimer !== null) {
            clearTimeout(this.auxiliaryRefreshTimer);
            this.auxiliaryRefreshTimer = null;
        }
        this.robotStateSyncDueAt = 0;
        this.rvcStateSyncPending = false;
        this.batteryStateSyncPending = false;
        this.serviceAreaSyncPending = false;

        this.robot.state.unsubscribeAll(this.robotStateSubscriber);
        if (this.mapUpdatesSubscribed) {
            this.robot.offMapUpdated(this.mapUpdateListener);
            this.mapUpdatesSubscribed = false;
        }
        await this.robotStateSync;
        this.robotStateSyncRunning = false;

        if (this.node) {
            try {
                await this.node.close();
            } catch (e) {
                Logger.warn("Error while closing Matter ServerNode", e);
            }
            this.node = null;
        }

        this.rvcEndpoint = null;
        this.batteryEndpoint = null;
        this.cleanModeMatterModeToPreset.clear();
        this.serviceAreaSegments.clear();
        this.serviceAreaProgress.clear();
        this.currentServiceArea = null;
        this.lastDockActivity = null;
        this.pendingOperationOutcome = null;
        this.filterResourceMeta = null;
        this.waterTankResourceSupported = false;
        this.lastFilterResourcePoll = 0;
        this.statisticsCache = {timestamp: 0, data: null};
        this.filterResourceStateCache = null;
        this.dryingDurationSecondsCache = null;
        this.auxiliaryRefreshRunning = false;
        this.phaseEstimate = {phase: null, startedAt: null, total: null};
        this.chargingSample = null;
        this.currentCleaningRate = null;
        this.lastServiceAreaTopologyHash = null;
        this.lastServiceAreaTopologyCheck = 0;
        this.mapTopologyVersion = null;
        this.lastPublishedCountdown = {value: null, phase: null, timestamp: 0};
        this.lastPublishedRvcState = null;
        this.lastPublishedBatteryState = null;
        this.lastPublishedTaskProjection = null;
        this.mapSegmentCache = {version: null, dirty: true, bySegmentId: new Map(), byAreaId: new Map()};
        this.lastRoomDetectionAt = 0;
        this.matterOperation = MatterController.NEW_OPERATION_TRACKER();

        this.state = STATE.DISABLED;
    }

    /** @private */
    clearTargetedSyncs() {
        if (this.cleaningTargetMirrorTimer !== null) {
            clearTimeout(this.cleaningTargetMirrorTimer);
            this.cleaningTargetMirrorTimer = null;
        }
        if (this.taskProjectionTimer !== null) {
            clearTimeout(this.taskProjectionTimer);
            this.taskProjectionTimer = null;
        }
        this.pendingCleaningTargetMirror = null;
        this.cleaningTargetMirrorRetries = 0;
        this.pendingTaskProjection = null;
        this.taskProjectionRetries = 0;
        this.lastPublishedTaskProjection = null;
    }

    /**
     * @private
     * @return {Promise<void>}
     */
    async handleConfigUpdated() {
        return this.runExclusive(async () => {
            try {
                await this.shutdownInternal();

                this.loadConfig();

                if (this.currentConfig.enabled) {
                    await this.start();
                }
            } catch (e) {
                this.state = STATE.ERROR;
                this.lastError = e.message;
                Logger.error("Matter reconfigure failed", e);
            }
        });
    }

    /**
     * @public
     * @return {{state: string, enabled: boolean, lastError: string|null, commissioned: boolean, fabrics: Array<{fabricIndex: number, fabricId: string, nodeId: string, vendorId: number, label: string}>, cleanModeMappingOptions: Array<string>, cleanModeStrengthOptions: {fan: Array<string>, water: Array<string>, route: Array<string>}}}
     */
    getStatus() {
        return {
            state: this.state,
            enabled: this.currentConfig.enabled,
            lastError: this.lastError,
            commissioned: this.isCommissioned(),
            fabrics: this.listFabrics(),
            cleanModeMappingOptions: this.getCleanModeMappingOptions(),
            cleanModeStrengthOptions: this.getCleanModeStrengthOptions()
        };
    }

    /**
     * @public
     * @return {{qrPairingCode: string, manualPairingCode: string, discriminator: number, passcode: number}|null}
     * Returns pairing codes only while uncommissioned. Once fabrics exist there is
     * no reason to keep the passcode reachable via API — the user must reset
     * commissioning to get a fresh code.
     */
    getPairingInfo() {
        if (!this.node || this.isCommissioned()) {
            return null;
        }

        const codes = this.node.state.commissioning.pairingCodes;

        if (!codes) {
            return null;
        }

        return {
            qrPairingCode: codes.qrPairingCode,
            manualPairingCode: codes.manualPairingCode,
            discriminator: this.currentConfig.commissioning.discriminator,
            passcode: this.currentConfig.commissioning.passcode
        };
    }

    /**
     * @private
     */
    isCommissioned() {
        return this.node?.state?.commissioning?.commissioned === true;
    }

    /**
     * @private
     */
    listFabrics() {
        const rawFabrics = this.node?.state?.commissioning?.fabrics;

        if (!rawFabrics) {
            return [];
        }

        return Object.values(rawFabrics).map((/** @type {any} */ f) => ({
            fabricIndex: f.fabricIndex,
            fabricId: String(f.fabricId),
            nodeId: String(f.nodeId),
            vendorId: f.rootVendorId,
            label: f.label ?? ""
        }));
    }

    /**
     * @public
     * Wipes all fabrics + local Matter storage and regenerates commissioning
     * credentials. Called when the user hits "Reset commissioning" in the UI.
     *
     * @return {Promise<void>}
     */
    async resetCommissioning() {
        Logger.info("Matter commissioning reset requested");

        return this.runExclusive(async () => {
            await this.shutdownInternal();

            try {
                const location = this.getStorageLocation();
                fs.rmSync(location, {recursive: true, force: true});
            } catch (e) {
                Logger.warn("Failed to remove Matter storage directory", e);
            }

            const stored = structuredClone(this.config.get("matter"));
            stored.commissioning.discriminator = 0;
            stored.commissioning.passcode = 0;
            this.config.set("matter", stored);
            // config.set fires onUpdate -> handleConfigUpdated, which queues on the
            // mutex behind us and will re-start with fresh credentials.
        });
    }
}

/**
 * @return {number}
 * Generates a Matter setup passcode within the valid range, avoiding
 * disallowed values per the Matter spec (00000000, 11111111, 22222222,
 * ..., 12345678, 87654321).
 */
MatterController.GENERATE_PASSCODE = function GENERATE_PASSCODE() {
    const FORBIDDEN = new Set([
        0, 11111111, 22222222, 33333333, 44444444, 55555555,
        66666666, 77777777, 88888888, 99999999, 12345678, 87654321
    ]);

    for (;;) {
        const candidate = crypto.randomInt(1, 99999999);
        if (!FORBIDDEN.has(candidate)) {
            return candidate;
        }
    }
};

MatterController.NEW_OPERATION_TRACKER = function NEW_OPERATION_TRACKER() {
    return {
        active: false,
        startedAt: null,
        pausedAt: null,
        pausedMilliseconds: 0,
        sawReturning: false,
        taskId: null
    };
};

MatterController.STATE = STATE;

module.exports = MatterController;
