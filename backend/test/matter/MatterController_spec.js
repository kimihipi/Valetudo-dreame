const fs = require("fs");
const os = require("os");
const path = require("path");
const should = require("should");

const CleaningTaskService = require("../../lib/core/CleaningTaskService");
const MapLayer = require("../../lib/entities/map/MapLayer");
const MatterController = require("../../lib/matter/MatterController");
const PointMapEntity = require("../../lib/entities/map/entities/PointMapEntity");
const RobotState = require("../../lib/entities/state/RobotState");
const stateAttrs = require("../../lib/entities/state/attributes");
const ValetudoRobotError = require("../../lib/entities/core/ValetudoRobotError");

describe("MatterController", function() {
    /**
     * @return {MatterController}
     */
    const createController = () => {
        const controller = Object.create(MatterController.prototype);
        controller.robot = {
            state: new RobotState({map: null}),
            capabilities: {},
            publishCleaningCommandState: attribute => {
                controller.robot.state.upsertFirstMatchingAttribute(attribute);
            },
            reportOperationOutcome: () => {},
            setCleaningTarget: target => {
                const previous = controller.robot.state.getFirstMatchingAttributeByConstructor(
                    stateAttrs.CleaningTargetStateAttribute
                );
                const attribute = new stateAttrs.CleaningTargetStateAttribute({
                    ...target,
                    revision: (previous?.revision ?? 0) + 1
                });
                controller.robot.state.upsertFirstMatchingAttribute(attribute);
                return attribute;
            }
        };
        controller.cleaningTaskService = new CleaningTaskService({
            robot: controller.robot,
            verificationTimeoutMs: 10
        });
        controller.matterOperation = MatterController.NEW_OPERATION_TRACKER();
        controller.serviceAreaSegments = new Map();
        controller.serviceAreaProgress = new Map();
        controller.currentServiceArea = null;
        controller.lastDockActivity = null;
        controller.pendingOperationOutcome = null;
        controller.pendingMatterOperationCompletion = null;
        controller.estimation = {
            cleaningRates: {},
            washingDuration: {value: 0, samples: 0},
            chargingRate: {value: 0, samples: 0}
        };
        controller.statisticsCache = {timestamp: 0, data: null};
        controller.phaseEstimate = {phase: null, startedAt: null, total: null};
        controller.chargingSample = null;
        controller.currentCleaningRate = null;
        controller.cleanModeMatterModeToPreset = new Map();
        controller.lastServiceAreaTopologyHash = null;
        controller.lastServiceAreaTopologyCheck = 0;
        controller.mapTopologyVersion = null;
        controller.lastPublishedCountdown = {value: null, phase: null, timestamp: 0};
        controller.lastPublishedRvcState = null;
        controller.lastPublishedBatteryState = null;
        controller.lastPublishedTaskProjection = null;
        controller.mapSegmentCache = {version: null, dirty: true, bySegmentId: new Map(), byAreaId: new Map()};
        controller.lastRoomDetectionAt = 0;
        controller.robotStateSyncTimer = null;
        controller.robotStateSyncDueAt = 0;
        controller.robotStateSyncRunning = false;
        controller.rvcStateSyncPending = false;
        controller.batteryStateSyncPending = false;
        controller.serviceAreaSyncPending = false;
        controller.matterCommandDepth = 0;
        controller.pendingCleaningTargetMirror = null;
        controller.cleaningTargetMirrorTimer = null;
        controller.cleaningTargetMirrorRetries = 0;
        controller.pendingTaskProjection = null;
        controller.taskProjectionTimer = null;
        controller.taskProjectionRetries = 0;
        controller.robotStateSync = Promise.resolve();
        return controller;
    };

    it("should map specific Valetudo errors to Matter RVC errors", function() {
        const controller = createController();
        controller.robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({
            value: stateAttrs.StatusStateAttribute.VALUE.ERROR,
            error: new ValetudoRobotError({
                severity: {
                    kind: ValetudoRobotError.SEVERITY_KIND.PERMANENT,
                    level: ValetudoRobotError.SEVERITY_LEVEL.ERROR
                },
                subsystem: ValetudoRobotError.SUBSYSTEM.MOTORS,
                message: "Main brush blocked",
                vendorErrorCode: "42"
            })
        }));

        const error = controller.getMatterOperationalError();
        error.errorStateId.should.equal(77);
        error.errorStateDetails.should.equal("Main brush blocked (42)");
    });

    it("should not infer successful completion from returning to the dock", async function() {
        const controller = createController();
        controller.statisticsCache = {timestamp: Date.now(), data: {time: 123, area: undefined}};

        controller.robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({
            value: stateAttrs.StatusStateAttribute.VALUE.CLEANING
        }));
        should(await controller.updateOperationLifecycle()).equal(null);

        controller.robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({
            value: stateAttrs.StatusStateAttribute.VALUE.RETURNING
        }));
        should(await controller.updateOperationLifecycle()).equal(null);

        controller.robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({
            value: stateAttrs.StatusStateAttribute.VALUE.DOCKED
        }));
        const completion = await controller.updateOperationLifecycle();
        completion.completionErrorCode.should.equal(2);
        completion.totalOperationalTime.should.equal(123);
        completion.pausedTime.should.equal(0);
        should(await controller.updateOperationLifecycle()).equal(null);
    });

    it("should prefer a vendor-confirmed completion outcome", async function() {
        const controller = createController();
        controller.matterOperation.active = true;
        controller.matterOperation.startedAt = Date.now();
        controller.pendingOperationOutcome = "completed";
        controller.robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({
            value: stateAttrs.StatusStateAttribute.VALUE.CLEANING
        }));

        const completion = await controller.updateOperationLifecycle();
        completion.completionErrorCode.should.equal(0);
        controller.matterOperation.active.should.equal(false);
    });

    it("should wait for the shared task outcome instead of completing from dock status", function() {
        const controller = createController();
        controller.matterOperation.active = true;
        controller.matterOperation.startedAt = Date.now();
        controller.robot.state.upsertFirstMatchingAttribute(new stateAttrs.ActiveCleaningTaskStateAttribute({
            id: "task-1",
            state: "running",
            source: "robot",
            startedAt: new Date().toISOString(),
            revision: 1
        }));
        controller.robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({value: "docked"}));

        should(controller.updateOperationLifecycle()).equal(null);
        controller.matterOperation.active.should.equal(true);
    });

    it("should keep a recoverable error operation resumable after the fault clears", function() {
        const controller = createController();
        controller.matterOperation.active = true;
        controller.matterOperation.startedAt = Date.now();
        controller.robot.state.upsertFirstMatchingAttribute(new stateAttrs.ActiveCleaningTaskStateAttribute({
            id: "task-1",
            state: "error",
            source: "robot",
            startedAt: new Date().toISOString(),
            revision: 2
        }));
        controller.robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({
            value: "error",
            error: new ValetudoRobotError({
                severity: {
                    kind: ValetudoRobotError.SEVERITY_KIND.TRANSIENT,
                    level: ValetudoRobotError.SEVERITY_LEVEL.ERROR
                },
                subsystem: ValetudoRobotError.SUBSYSTEM.NAVIGATION,
                message: "Robot is stuck",
                vendorErrorCode: "1"
            })
        }));

        should(controller.updateOperationLifecycle()).equal(null);
        controller.matterOperation.active.should.equal(true);

        controller.robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({
            value: "idle",
            flag: stateAttrs.StatusStateAttribute.FLAG.RESUMABLE
        }));
        controller.getMatterOperationalState().should.equal(2);
        controller.getMatterRunMode().should.equal(1);
        controller.getMatterPhase().should.equal(0);
        controller.matterOperation.active.should.equal(true);
    });

    it("should report stopped or cancelled cleaning as incomplete", async function() {
        const controller = createController();
        controller.robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({
            value: stateAttrs.StatusStateAttribute.VALUE.CLEANING
        }));
        await controller.updateOperationLifecycle();

        controller.robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({
            value: stateAttrs.StatusStateAttribute.VALUE.IDLE
        }));
        const completion = await controller.updateOperationLifecycle();
        completion.completionErrorCode.should.equal(2);
    });

    it("should not complete an operation while robot status is unavailable", async function() {
        const controller = createController();
        controller.matterOperation.active = true;
        controller.matterOperation.startedAt = Date.now();

        should(await controller.updateOperationLifecycle()).equal(null);
        controller.matterOperation.active.should.equal(true);
    });

    it("should build minimum through deep-clean profiles from robot presets", function() {
        const controller = createController();
        controller.currentConfig = {
            identity: {vendorId: 65521},
            cleanModeMapping: "vacuum_and_mop",
            cleanModeProfiles: {
                minimum: {fan: "low", water: "low", route: "quick"},
                quiet: {fan: "low", water: "low", route: "routine"},
                standard: {fan: "medium", water: "medium", route: "routine"},
                maximum: {fan: "max", water: "high", route: "intensive"},
                deepClean: {fan: "max", water: "high", route: "deep"}
            }
        };
        controller.cleanModeMatterModeToPreset = new Map();
        controller.robot.capabilities.OperationModeControlCapability = {
            getPresets: () => ["vacuum", "mop", "vacuum_and_mop", "vacuum_then_mop"]
        };
        controller.robot.capabilities.FanSpeedControlCapability = {
            getPresets: () => ["low", "medium", "high", "max"]
        };
        controller.robot.capabilities.WaterUsageControlCapability = {
            getPresets: () => ["low", "medium", "high"]
        };
        controller.robot.capabilities.CleanRouteControlCapability = {
            getProperties: () => ({supportedRoutes: ["quick", "routine", "intensive", "deep"]})
        };

        const modes = controller.buildMatterCleanModes({
            ModeTag: {Min: 6, Quiet: 2, Auto: 0, Max: 7, DeepClean: 16384, Vacuum: 16385, Mop: 16386}
        });

        modes.should.have.length(15);
        modes.map(mode => mode.mode).should.deepEqual([
            0, 1, 2, 3, 4,
            16, 17, 18, 19, 20,
            32, 33, 34, 35, 36
        ]);
        modes.map(mode => mode.label).should.containDeep([
            "Vacuum Minimum", "Vacuum Quiet", "Vacuum Standard", "Vacuum Maximum", "Vacuum Deep Clean",
            "Mop Minimum", "Mop Quiet", "Mop Standard", "Mop Maximum", "Mop Deep Clean",
            "Vacuum & Mop Minimum", "Vacuum & Mop Quiet", "Vacuum & Mop Standard",
            "Vacuum & Mop Maximum", "Vacuum & Mop Deep Clean"
        ]);
        modes.find(mode => mode.label === "Vacuum Standard").modeTags.should.deepEqual([
            {value: 16385},
            {value: 0}
        ]);
        modes.find(mode => mode.label === "Vacuum Deep Clean").modeTags.should.deepEqual([
            {value: 16385},
            {value: 16384}
        ]);
        controller.cleanModeMatterModeToPreset.get(36).should.deepEqual({
            operationMode: "vacuum_and_mop",
            operationModeAliases: ["vacuum_and_mop", "vacuum_then_mop"],
            profile: "deepClean",
            fanPreset: "max",
            waterPreset: "high",
            cleanRoute: "deep"
        });
    });

    it("should advertise only enabled clean profiles without renumbering mode IDs", function() {
        const controller = createController();
        controller.currentConfig = {
            cleanModeMapping: "vacuum_and_mop",
            cleanModeProfiles: {
                minimum: {enabled: false, fan: "low", water: "low", route: "quick"},
                quiet: {enabled: true, fan: "low", water: "low", route: "routine"},
                standard: {enabled: false, fan: "medium", water: "medium", route: "routine"},
                maximum: {enabled: true, fan: "max", water: "high", route: "intensive"},
                deepClean: {enabled: false, fan: "max", water: "high", route: "deep"}
            }
        };
        controller.robot.capabilities.OperationModeControlCapability = {
            getPresets: () => ["vacuum", "mop", "vacuum_and_mop"]
        };
        controller.robot.capabilities.FanSpeedControlCapability = {
            getPresets: () => ["low", "medium", "max"]
        };

        const modes = controller.buildMatterCleanModes({
            ModeTag: {Min: 6, Quiet: 2, Auto: 0, Max: 7, DeepClean: 16384, Vacuum: 16385, Mop: 16386}
        });

        modes.map(mode => mode.mode).should.deepEqual([1, 3, 17, 19, 33, 35]);
        modes.map(mode => mode.label).should.deepEqual([
            "Vacuum Quiet", "Vacuum Maximum",
            "Mop Quiet", "Mop Maximum",
            "Vacuum & Mop Quiet", "Vacuum & Mop Maximum"
        ]);
    });

    it("should migrate an unsupported persisted clean mode without resetting Matter storage", function() {
        const controller = createController();
        const storage = fs.mkdtempSync(path.join(os.tmpdir(), "valetudo-matter-mode-"));
        const nodeStorage = path.join(storage, "valetudo");
        const currentModePath = path.join(nodeStorage, "root.parts.rvc.rvcCleanMode.currentMode");
        fs.mkdirSync(nodeStorage, {recursive: true});
        fs.writeFileSync(currentModePath, "99");
        fs.writeFileSync(path.join(storage, "clean-mode-schema"), "2");
        controller.getStorageLocation = () => storage;

        try {
            controller.migratePersistedCleanMode([{mode: 0}, {mode: 1}], 1);
            JSON.parse(fs.readFileSync(currentModePath, "utf8")).should.equal(1);
        } finally {
            fs.rmSync(storage, {recursive: true, force: true});
        }
    });

    it("should keep a resumable docked cleaning operation open", async function() {
        const controller = createController();
        controller.robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({
            value: stateAttrs.StatusStateAttribute.VALUE.CLEANING
        }));
        await controller.updateOperationLifecycle();
        controller.robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({
            value: stateAttrs.StatusStateAttribute.VALUE.DOCKED,
            flag: stateAttrs.StatusStateAttribute.FLAG.RESUMABLE
        }));

        should(await controller.updateOperationLifecycle()).equal(null);
        controller.matterOperation.active.should.equal(true);
    });

    it("should map dock activity to Matter phases", function() {
        const controller = createController();
        controller.robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({
            value: stateAttrs.StatusStateAttribute.VALUE.DOCKED
        }));
        controller.robot.state.upsertFirstMatchingAttribute(new stateAttrs.DockStatusStateAttribute({
            value: stateAttrs.DockStatusStateAttribute.VALUE.EMPTYING
        }));

        controller.getMatterPhase().should.equal(4);
    });

    it("should expose a valid idle phase instead of null", function() {
        const controller = createController();
        controller.robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({
            value: stateAttrs.StatusStateAttribute.VALUE.IDLE
        }));

        controller.getMatterPhase().should.equal(6);
    });

    it("should keep Cleaning run mode while paused so cleaning profiles remain locked", function() {
        const controller = createController();
        controller.robot.state.upsertFirstMatchingAttribute(new stateAttrs.ActiveCleaningTaskStateAttribute({
            id: "task-1", state: "paused", source: "webui", startedAt: new Date().toISOString(), revision: 1
        }));
        controller.robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({
            value: stateAttrs.StatusStateAttribute.VALUE.PAUSED
        }));

        controller.getMatterRunMode().should.equal(1);
        controller.getMatterOperationalState().should.equal(2);
    });

    it("should not expose a paused return-to-dock as paused cleaning after task cancellation", function() {
        const controller = createController();
        controller.robot.state.upsertFirstMatchingAttribute(new stateAttrs.ActiveCleaningTaskStateAttribute({
            id: "task-1", state: "cancelled", outcome: "cancelled", source: "matter",
            startedAt: new Date().toISOString(), revision: 2
        }));
        controller.robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({
            value: stateAttrs.StatusStateAttribute.VALUE.PAUSED,
            flag: stateAttrs.StatusStateAttribute.FLAG.RESUMABLE
        }));

        controller.getMatterRunMode().should.equal(0);
        controller.getMatterOperationalState().should.equal(0);
    });

    it("should expose Cleaning run mode only while actively cleaning", function() {
        const controller = createController();
        controller.robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({
            value: stateAttrs.StatusStateAttribute.VALUE.CLEANING
        }));

        controller.getMatterRunMode().should.equal(1);
    });

    it("should expose Valetudo map segments as Matter service areas", async function() {
        const controller = createController();
        controller.serviceAreaSegments = new Map();
        controller.robot.capabilities.MapSegmentationCapability = {
            getSegments: async () => [
                {id: "1", name: "Kitchen"},
                {id: "office", name: "Office"}
            ]
        };

        const areas = await controller.buildMatterServiceAreas();
        areas.should.have.length(2);
        areas[0].should.deepEqual({
            areaId: 1,
            mapId: null,
            areaInfo: {
                locationInfo: {locationName: "Kitchen", floorNumber: null, areaType: null},
                landmarkInfo: null
            }
        });
        controller.serviceAreaSegments.get(areas[1].areaId).id.should.equal("office");
    });

    it("should constrain duplicate room names and avoid coercing blank ids to zero", async function() {
        const controller = createController();
        controller.serviceAreaSegments = new Map();
        controller.robot.capabilities.MapSegmentationCapability = {
            getSegments: async () => [
                {id: "", name: "A".repeat(128)},
                {id: "room-" + "x".repeat(150), name: "A".repeat(128)}
            ]
        };

        const areas = await controller.buildMatterServiceAreas();
        areas[0].areaId.should.not.equal(0);
        areas[1].areaInfo.locationInfo.locationName.length.should.be.belowOrEqual(128);
        areas[1].areaInfo.locationInfo.locationName.should.not.equal(areas[0].areaInfo.locationInfo.locationName);
    });

    it("should retry clean-mode verification before rolling back", async function() {
        const controller = createController();
        let polls = 0;
        const selected = [];
        controller.robot.state.upsertFirstMatchingAttribute(new stateAttrs.PresetSelectionStateAttribute({
            type: stateAttrs.PresetSelectionStateAttribute.TYPE.FAN_SPEED,
            value: "medium"
        }));
        controller.robot.capabilities.FanSpeedControlCapability = {
            selectPreset: async preset => selected.push(preset)
        };
        controller.robot.pollState = async () => {
            polls++;
            if (polls === 2) {
                controller.robot.state.upsertFirstMatchingAttribute(new stateAttrs.PresetSelectionStateAttribute({
                    type: stateAttrs.PresetSelectionStateAttribute.TYPE.FAN_SPEED,
                    value: "max"
                }));
            }
        };

        await controller.applyMatterCleanMode({operationMode: undefined, fanPreset: "max"});
        polls.should.equal(2);
        selected.should.deepEqual(["max"]);
    });

    it("should apply and verify a configured clean route", async function() {
        const controller = createController();
        let route = "routine";
        const selected = [];
        const notified = [];
        controller.robot.capabilities.CleanRouteControlCapability = {
            getRoute: async () => route,
            setRoute: async value => {
                selected.push(value);
                route = value;
            },
            notifyRouteChanged: value => notified.push(value)
        };
        controller.robot.pollState = async () => {};

        await controller.applyMatterCleanMode({operationMode: undefined, cleanRoute: "deep"});

        selected.should.deepEqual(["deep"]);
        notified.should.deepEqual(["deep"]);
    });

    it("should route selected Matter areas using the firmware room order", async function() {
        const controller = createController();
        const bedroom = {id: "4", name: "Bedroom"};
        const kitchen = {id: "2", name: "Kitchen"};
        let executedSegments;
        let executedOptions;
        controller.serviceAreaSegments = new Map([[4, bedroom], [2, kitchen]]);
        controller.rvcEndpoint = {state: {serviceArea: {selectedAreas: [4, 2]}}};
        controller.robot.state.map = {
            layers: [
                {type: MapLayer.TYPE.SEGMENT, metaData: {segmentId: "4", cleanOrder: 2}},
                {type: MapLayer.TYPE.SEGMENT, metaData: {segmentId: "2", cleanOrder: 1}}
            ]
        };
        controller.robot.capabilities.MapSegmentationCapability = {
            getProperties: () => ({customOrderSupport: true}),
            executeSegmentAction: async (segments, options) => {
                executedSegments = segments;
                executedOptions = options;
            }
        };
        controller.handleMatterAreaSelection([4, 2]);

        await controller.startMatterCleaning();
        executedSegments.map(segment => segment.id).should.deepEqual(["2", "4"]);
        executedOptions.should.deepEqual({iterations: 1, customOrder: true});
        controller.robot.state.getFirstMatchingAttributeByConstructor(
            stateAttrs.CleaningTargetStateAttribute
        ).should.match({
            value: "segments",
            segmentIds: ["2", "4"],
            source: "matter",
            active: true
        });
        controller.robot.state.getFirstMatchingAttributeByConstructor(
            stateAttrs.CleaningCommandStateAttribute
        ).should.match({command: "start_segments", source: "matter"});
    });

    it("should reject Matter Start for an incomplete empty segment draft", async function() {
        const controller = createController();
        controller.robot.capabilities.MapSegmentationCapability = {
            getProperties: () => ({iterationCount: {min: 1, max: 1}, customOrderSupport: true}),
            executeSegmentAction: async () => {
                throw new Error("should not execute");
            }
        };
        controller.cleaningTaskService.stageTarget({
            value: "segments", segmentIds: [], source: "webui", active: false
        });

        await should(controller.startMatterCleaning()).be.rejectedWith(
            "Select at least one room before starting segment cleaning"
        );
    });

    it("should stop Matter cleaning through the shared task service", async function() {
        const controller = createController();
        let source;
        controller.cleaningTaskService.stop = async options => {
            source = options.source;
        };

        await controller.stopMatterCleaning();

        source.should.equal("matter");
    });

    it("should pause and resume Matter cleaning through the shared task service", async function() {
        const controller = createController();
        const calls = [];
        controller.cleaningTaskService.pause = async options => calls.push(["pause", options.source]);
        controller.cleaningTaskService.resume = async options => calls.push(["resume", options.source]);

        await controller.pauseMatterCleaning();
        await controller.resumeMatterCleaning();

        calls.should.deepEqual([["pause", "matter"], ["resume", "matter"]]);
    });

    it("should fall back to deterministic segment order when firmware order is unavailable", function() {
        const controller = createController();
        controller.robot.state.map = {layers: []};
        controller.serviceAreaSegments = new Map([
            [4, {id: "4", name: "Bedroom"}],
            [2, {id: "2", name: "Kitchen"}]
        ]);

        controller.orderMatterAreaIds([4, 2]).should.deepEqual([2, 4]);
    });

    it("should clear cached room progress immediately when Matter selects all rooms", function() {
        const controller = createController();
        controller.serviceAreaSegments = new Map([[2, {id: "2"}], [4, {id: "4"}]]);
        controller.robot.state.map = {layers: []};
        controller.serviceAreaProgress.set(2, {areaId: 2, status: 1});
        controller.currentServiceArea = 2;

        controller.handleMatterAreaSelection([]);

        controller.serviceAreaProgress.size.should.equal(0);
        should(controller.currentServiceArea).equal(null);
        controller.robot.state.getFirstMatchingAttributeByConstructor(
            stateAttrs.CleaningTargetStateAttribute
        ).should.match({value: "all", segmentIds: [], source: "matter", active: false});
    });

    it("should synchronize an ordered Web UI room selection into Matter", async function() {
        const controller = createController();
        controller.state = "ready";
        controller.serviceAreaSegments = new Map([[2, {id: "2"}], [4, {id: "4"}]]);
        controller.robot.state.map = {layers: [
            {type: MapLayer.TYPE.SEGMENT, metaData: {segmentId: "2"}},
            {type: MapLayer.TYPE.SEGMENT, metaData: {segmentId: "4"}}
        ]};
        const serviceAreaState = {selectedAreas: [], progress: [], currentArea: 2, estimatedEndTime: 123};
        controller.rvcEndpoint = {
            state: {serviceArea: serviceAreaState},
            act: async callback => callback({serviceArea: {state: serviceAreaState}})
        };

        await controller.selectMatterAreasBySegmentIds(["4", "2"]);

        serviceAreaState.selectedAreas.should.deepEqual([4, 2]);
        serviceAreaState.progress.map(entry => entry.areaId).should.deepEqual([4, 2]);
        should(serviceAreaState.currentArea).equal(null);
        should(serviceAreaState.estimatedEndTime).equal(null);
        controller.robot.state.getFirstMatchingAttributeByConstructor(
            stateAttrs.CleaningTargetStateAttribute
        ).should.match({value: "segments", segmentIds: ["4", "2"], source: "webui", active: false});
    });

    it("should subscribe Matter to shared cleaning-target drafts", function() {
        const controller = createController();
        const subscribedClasses = [];
        controller.robot.state.subscribe = (subscriber, matcher) => {
            subscribedClasses.push(matcher.attributeClass);
        };
        controller.robot.onOperationOutcome = () => {};

        controller.subscribeToRobotState();

        subscribedClasses.should.containEql(stateAttrs.CleaningTargetStateAttribute.name);
        subscribedClasses.should.containEql(stateAttrs.ActiveCleaningTaskStateAttribute.name);
        subscribedClasses.should.not.containEql(stateAttrs.CleaningCommandStateAttribute.name);
    });

    it("should synchronize whole-home selection into Matter as an empty area list", async function() {
        const controller = createController();
        controller.state = "ready";
        controller.serviceAreaSegments = new Map([[2, {id: "2"}], [4, {id: "4"}]]);
        const serviceAreaState = {
            selectedAreas: [4, 2],
            progress: [{areaId: 4}, {areaId: 2}],
            currentArea: 4,
            estimatedEndTime: 123
        };
        controller.rvcEndpoint = {
            state: {serviceArea: serviceAreaState},
            act: async callback => callback({serviceArea: {state: serviceAreaState}})
        };
        const target = new stateAttrs.CleaningTargetStateAttribute({
            value: "all", segmentIds: [], source: "webui", active: false
        });

        await controller.mirrorCleaningTargetToMatter(target);

        serviceAreaState.selectedAreas.should.deepEqual([]);
        serviceAreaState.progress.should.deepEqual([]);
        should(serviceAreaState.currentArea).equal(null);
        should(serviceAreaState.estimatedEndTime).equal(null);
    });

    it("should retain a Web UI room selection while Matter is disabled", async function() {
        const controller = createController();
        controller.state = "disabled";
        controller.robot.state.map = {layers: [
            {type: MapLayer.TYPE.SEGMENT, metaData: {segmentId: "2"}},
            {type: MapLayer.TYPE.SEGMENT, metaData: {segmentId: "4"}}
        ]};

        await controller.selectMatterAreasBySegmentIds(["4", "2"]);

        controller.robot.state.getFirstMatchingAttributeByConstructor(
            stateAttrs.CleaningTargetStateAttribute
        ).should.match({value: "segments", segmentIds: ["4", "2"], source: "webui", active: false});
    });

    it("should expose dock component faults as Matter operational errors", function() {
        const controller = createController();
        controller.robot.state.upsertFirstMatchingAttribute(new stateAttrs.DockComponentStateAttribute({
            type: stateAttrs.DockComponentStateAttribute.TYPE.WATER_TANK_DIRTY,
            value: stateAttrs.DockComponentStateAttribute.VALUE.FULL
        }));

        const error = controller.getMatterOperationalError();
        error.errorStateId.should.equal(74);
        error.errorStateDetails.should.equal("Dirty-water tank full");
    });

    it("should find the selected Matter room containing the robot", function() {
        const controller = createController();
        controller.serviceAreaSegments = new Map([[4, {id: "4", name: "Bedroom"}]]);
        controller.rvcEndpoint = {state: {serviceArea: {selectedAreas: [4]}}};
        controller.robot.state.map = {
            pixelSize: 5,
            entities: [new PointMapEntity({
                type: PointMapEntity.TYPE.ROBOT_POSITION,
                points: [50, 50]
            })],
            layers: [new MapLayer({
                type: MapLayer.TYPE.SEGMENT,
                pixels: [10, 10, 11, 10],
                metaData: {segmentId: "4"}
            })]
        };

        controller.detectCurrentServiceAreaFallback().should.equal(4);
    });

    it("should project shared task room progress into Matter Service Area", function() {
        const controller = createController();
        controller.serviceAreaSegments = new Map([[2, {id: "2"}], [4, {id: "4"}]]);
        controller.rvcEndpoint = {state: {serviceArea: {selectedAreas: [2, 4]}}};
        const task = new stateAttrs.ActiveCleaningTaskStateAttribute({
            id: "task-1",
            state: "running",
            source: "webui",
            startedAt: new Date().toISOString(),
            target: {type: "segments", segmentIds: ["4", "2"], currentSegmentId: "4"},
            progress: {completedRooms: 1, completedSegmentIds: ["2"], totalRooms: 2},
            revision: 1
        });

        controller.projectActiveTaskToServiceAreas(task);

        controller.currentServiceArea.should.equal(4);
        controller.serviceAreaProgress.get(2).status.should.equal(3);
        controller.serviceAreaProgress.get(4).status.should.equal(1);
    });

    it("should drive Matter completion from a terminal shared task", function() {
        const controller = createController();
        let queuedOptions;
        controller.matterOperation = {
            ...MatterController.NEW_OPERATION_TRACKER(), active: true, taskId: "task-1", startedAt: Date.now()
        };
        controller.queueRobotStateSync = options => {
            queuedOptions = options;
        };
        const task = new stateAttrs.ActiveCleaningTaskStateAttribute({
            id: "task-1",
            state: "cancelled",
            outcome: "cancelled",
            source: "matter",
            startedAt: new Date().toISOString(),
            revision: 2
        });

        controller.handleActiveCleaningTaskState(task);

        controller.pendingOperationOutcome.should.equal("cancelled");
        queuedOptions.should.deepEqual({rvc: true, serviceAreas: true, immediate: true});
    });

    it("should preserve elapsed room progress when a robot re-enters a room", function() {
        const controller = createController();
        controller.serviceAreaSegments = new Map([
            [1, {id: "1", name: "Kitchen"}],
            [2, {id: "2", name: "Hall"}]
        ]);
        controller.rvcEndpoint = {state: {serviceArea: {selectedAreas: [1, 2]}}};
        controller.robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({
            value: stateAttrs.StatusStateAttribute.VALUE.CLEANING
        }));
        const position = new PointMapEntity({
            type: PointMapEntity.TYPE.ROBOT_POSITION,
            points: [50, 50]
        });
        controller.robot.state.map = {
            pixelSize: 5,
            entities: [position],
            layers: [
                new MapLayer({
                    type: MapLayer.TYPE.SEGMENT,
                    pixels: [10, 10, 11, 10],
                    metaData: {segmentId: "1"}
                }),
                new MapLayer({
                    type: MapLayer.TYPE.SEGMENT,
                    pixels: [20, 10, 21, 10],
                    metaData: {segmentId: "2"}
                })
            ]
        };

        controller.updateServiceAreaProgress(null);
        controller.serviceAreaProgress.get(1).status.should.equal(1);
        position.points = [100, 50];
        controller.lastRoomDetectionAt = 0;
        controller.updateServiceAreaProgress(null);
        controller.serviceAreaProgress.get(1).status.should.equal(3);
        position.points = [50, 50];
        controller.lastRoomDetectionAt = 0;
        controller.updateServiceAreaProgress(null);
        controller.serviceAreaProgress.get(1).status.should.equal(1);
        controller.serviceAreaProgress.get(1).elapsedSeconds.should.be.aboveOrEqual(0);
    });

    it("should track the only room during whole-home cleaning without a robot position", function() {
        const controller = createController();
        controller.serviceAreaSegments = new Map([[7, {id: "7", name: "Bedroom"}]]);
        controller.rvcEndpoint = {state: {serviceArea: {selectedAreas: []}}};
        controller.matterOperation.active = true;
        controller.robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({
            value: stateAttrs.StatusStateAttribute.VALUE.CLEANING
        }));
        controller.robot.state.map = {pixelSize: 5, entities: [], layers: []};

        controller.updateServiceAreaProgress(null);

        controller.currentServiceArea.should.equal(7);
        controller.serviceAreaProgress.get(7).status.should.equal(1);
    });

    it("should interpret an empty Matter room selection as all rooms while cleaning", function() {
        const controller = createController();
        controller.serviceAreaSegments = new Map([
            [1, {id: "1", name: "Kitchen"}],
            [2, {id: "2", name: "Bedroom"}]
        ]);
        controller.rvcEndpoint = {state: {serviceArea: {selectedAreas: []}}};
        controller.robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({
            value: stateAttrs.StatusStateAttribute.VALUE.CLEANING
        }));

        controller.getTrackedServiceAreaIds().should.deepEqual([1, 2]);
    });

    it("should estimate selected-room cleaning time from learned map-area rate", async function() {
        const controller = createController();
        controller.estimation.cleaningRates.default = {value: 0.01, samples: 2};
        controller.serviceAreaSegments = new Map([[1, {id: "1", name: "Kitchen"}]]);
        controller.rvcEndpoint = {state: {serviceArea: {selectedAreas: [1]}}};
        controller.robot.state.map = {
            pixelSize: 5,
            entities: [],
            layers: [new MapLayer({
                type: MapLayer.TYPE.SEGMENT,
                pixels: [10, 10, 11, 10],
                metaData: {segmentId: "1", area: 10000}
            })]
        };

        (await controller.getMatterCountdown(0)).should.equal(100);
        controller.currentCleaningRate.should.equal(0.01);
    });

    it("should persist one charging-rate estimate only after charging completes", function() {
        const controller = createController();
        const persisted = [];
        controller.config = {
            set: (key, value) => persisted.push({key: key, value: value})
        };
        controller.estimation.chargingRate = {value: 0.01, samples: 2};
        let now = 1000000;
        const originalNow = Date.now;
        Date.now = () => now;

        try {
            controller.robot.state.upsertFirstMatchingAttribute(new stateAttrs.BatteryStateAttribute({
                level: 20,
                flag: stateAttrs.BatteryStateAttribute.FLAG.CHARGING
            }));
            controller.getMatterCountdown(2);

            now += 300000;
            controller.robot.state.upsertFirstMatchingAttribute(new stateAttrs.BatteryStateAttribute({
                level: 24,
                flag: stateAttrs.BatteryStateAttribute.FLAG.CHARGING
            }));
            controller.getMatterCountdown(2).should.equal(5700);

            now += 300000;
            controller.robot.state.upsertFirstMatchingAttribute(new stateAttrs.BatteryStateAttribute({
                level: 29,
                flag: stateAttrs.BatteryStateAttribute.FLAG.CHARGING
            }));
            controller.getMatterCountdown(2).should.equal(4733);

            persisted.should.be.empty();
            controller.estimation.chargingRate.should.deepEqual({value: 0.01, samples: 2});

            controller.robot.state.upsertFirstMatchingAttribute(new stateAttrs.BatteryStateAttribute({
                level: 29,
                flag: stateAttrs.BatteryStateAttribute.FLAG.CHARGED
            }));
            should(controller.getMatterCountdown(null)).equal(null);

            persisted.should.have.length(1);
            persisted[0].key.should.equal("matterEstimation");
            persisted[0].value.chargingRate.samples.should.equal(3);
            persisted[0].value.chargingRate.value.should.be.approximately(0.011, 0.000001);
            should(controller.chargingSample).equal(null);
        } finally {
            Date.now = originalNow;
        }
    });

    it("should defer state synchronization until a Matter command has returned", async function() {
        const controller = createController();
        let syncs = 0;
        controller.syncRobotState = async () => {
            syncs++;
        };

        await controller.executeMatterCommand(async () => {});
        await new Promise(resolve => setTimeout(resolve, 5));
        await controller.robotStateSync;

        syncs.should.equal(1);
        controller.matterCommandDepth.should.equal(0);
    });

    it("should coalesce bursts of robot state notifications", async function() {
        const controller = createController();
        let syncs = 0;
        controller.syncRobotState = async () => {
            syncs++;
        };

        controller.queueRobotStateSync();
        controller.queueRobotStateSync();
        controller.queueRobotStateSync();
        await new Promise(resolve => setTimeout(resolve, 100));
        await controller.robotStateSync;

        syncs.should.equal(1);
    });

    it("should synchronize only the battery domain for battery-only bursts", async function() {
        const controller = createController();
        let domains;
        controller.syncRobotState = async requestedDomains => {
            domains = requestedDomains;
        };

        controller.queueRobotStateSync({battery: true});
        controller.queueRobotStateSync({battery: true});
        await new Promise(resolve => setTimeout(resolve, 100));
        await controller.robotStateSync;

        domains.should.deepEqual({rvc: false, battery: true});
    });

    it("should let a fast state update preempt a throttled map update", async function() {
        const controller = createController();
        let domains;
        controller.syncServiceAreas = async () => {};
        controller.syncRobotState = async requestedDomains => {
            domains = requestedDomains;
        };

        controller.queueRobotStateSync({rvc: true, serviceAreas: true, delayMs: 1000});
        controller.queueRobotStateSync({battery: true});
        await new Promise(resolve => setTimeout(resolve, 100));
        await controller.robotStateSync;

        domains.should.deepEqual({rvc: true, battery: true});
    });

    it("should ignore unchanged live map frames while the robot is idle", function() {
        const controller = createController();
        let queued = 0;
        controller.mapTopologyVersion = controller.getMapTopologyVersion();
        controller.queueRobotStateSync = () => {
            queued++;
        };
        controller.robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({
            value: stateAttrs.StatusStateAttribute.VALUE.IDLE
        }));

        controller.handleMapUpdated();

        queued.should.equal(0);
    });

    it("should leave unchanged cleaning map frames to shared task projection", function() {
        const controller = createController();
        let queued = 0;
        controller.mapTopologyVersion = controller.getMapTopologyVersion();
        controller.queueRobotStateSync = () => {
            queued++;
        };
        controller.robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({
            value: stateAttrs.StatusStateAttribute.VALUE.CLEANING
        }));

        controller.handleMapUpdated();

        queued.should.equal(0);
    });

    it("should retry a targeted room-selection push after a transaction conflict", async function() {
        const controller = createController();
        let attempts = 0;
        class SynchronousTransactionConflictError extends Error {}
        controller.mirrorCleaningTargetToMatter = async () => {
            attempts++;
            if (attempts === 1) {
                throw new SynchronousTransactionConflictError("Cannot lock Service Area synchronously");
            }
        };
        const target = new stateAttrs.CleaningTargetStateAttribute({
            value: "segments", segmentIds: ["2"], source: "webui", revision: 1
        });

        controller.queueCleaningTargetMirror(target, 0);
        await new Promise(resolve => setTimeout(resolve, 130));

        attempts.should.equal(2);
        should(controller.pendingCleaningTargetMirror).equal(null);
    });

    it("should bound queued work while a Matter transaction is slow", async function() {
        const controller = createController();
        let releaseFirstSync;
        const firstSyncGate = new Promise(resolve => {
            releaseFirstSync = resolve;
        });
        let syncs = 0;
        controller.syncRobotState = async () => {
            syncs++;
            if (syncs === 1) {
                await firstSyncGate;
            }
        };

        controller.queueRobotStateSync({rvc: true, immediate: true});
        await new Promise(resolve => setTimeout(resolve, 5));
        for (let i = 0; i < 100; i++) {
            controller.queueRobotStateSync({rvc: true, battery: true, immediate: true});
        }
        await new Promise(resolve => setTimeout(resolve, 5));
        syncs.should.equal(1);
        releaseFirstSync();
        await new Promise(resolve => setTimeout(resolve, 20));
        await controller.robotStateSync;

        syncs.should.equal(2);
    });

    it("should retry state synchronization after a synchronous Matter transaction conflict", async function() {
        const controller = createController();
        let syncs = 0;
        controller.syncRobotState = async () => {
            syncs++;
            if (syncs === 1) {
                throw new Error("Cannot lock valetudo.rvc.rvcCleanMode.state synchronously");
            }
        };

        controller.queueRobotStateSync({rvc: true, immediate: true});
        await new Promise(resolve => setTimeout(resolve, 150));
        await controller.robotStateSync;

        syncs.should.equal(2);
    });

    it("should throttle repeated Service Area topology checks", async function() {
        const controller = createController();
        let segmentReads = 0;
        controller.robot.capabilities.MapSegmentationCapability = {
            getSegments: async () => {
                segmentReads++;
                return [{id: "1", name: "Bedroom"}];
            }
        };
        controller.rvcEndpoint = {
            state: {serviceArea: {selectedAreas: []}},
            act: async callback => callback({serviceArea: {state: {currentArea: null}}})
        };

        await controller.syncServiceAreas();
        await controller.syncServiceAreas();

        segmentReads.should.equal(1);
    });

    it("should keep the Service Area topology stable while a shared task is active", async function() {
        const controller = createController();
        let segmentReads = 0;
        let transactions = 0;
        controller.robot.capabilities.MapSegmentationCapability = {
            getSegments: async () => {
                segmentReads++;
                return [{id: "2", name: "Current room"}];
            }
        };
        controller.serviceAreaSegments = new Map([
            [1, {id: "1", name: "Completed room"}],
            [2, {id: "2", name: "Current room"}],
            [3, {id: "3", name: "Pending room"}]
        ]);
        controller.rvcEndpoint = {
            state: {serviceArea: {selectedAreas: [1, 2, 3]}},
            act: async () => {
                transactions++;
            }
        };
        controller.robot.state.upsertFirstMatchingAttribute(new stateAttrs.ActiveCleaningTaskStateAttribute({
            id: "task-1",
            state: "running",
            source: "matter",
            startedAt: new Date().toISOString(),
            target: {type: "segments", segmentIds: ["1", "2", "3"], currentSegmentId: "2"},
            progress: {completedRooms: 1, completedSegmentIds: ["1"], totalRooms: 3},
            revision: 1
        }));

        await controller.syncServiceAreas();

        segmentReads.should.equal(0);
        transactions.should.equal(0);
        [...controller.serviceAreaSegments.keys()].should.deepEqual([1, 2, 3]);
    });

    it("should cache map segment layers and calculated areas", function() {
        const controller = createController();
        controller.serviceAreaSegments = new Map([[4, {id: "4", name: "Bedroom"}]]);
        controller.robot.state.map = {
            pixelSize: 5,
            entities: [],
            layers: [new MapLayer({
                type: MapLayer.TYPE.SEGMENT,
                pixels: [10, 10, 11, 10],
                metaData: {segmentId: "4", area: 12345}
            })]
        };

        controller.getAreaForServiceArea(4).should.equal(12345);
        controller.mapSegmentCache.byAreaId.get(4).layer.should.equal(controller.robot.state.map.layers[0]);
        controller.mapSegmentCache.dirty.should.equal(false);
    });

    it("should version map topology independently from robot position changes", function() {
        const controller = createController();
        const position = new PointMapEntity({
            type: PointMapEntity.TYPE.ROBOT_POSITION,
            points: [50, 50]
        });
        controller.robot.state.map = {
            pixelSize: 5,
            metaData: {id: "map-1", version: 2},
            entities: [position],
            layers: [new MapLayer({
                type: MapLayer.TYPE.SEGMENT,
                pixels: [10, 10, 11, 10],
                metaData: {segmentId: "1", name: "Bedroom"}
            })]
        };
        const initialVersion = controller.getMapTopologyVersion();
        position.points = [100, 100];
        controller.getMapTopologyVersion().should.equal(initialVersion);
        controller.robot.state.map.layers[0].metaData.name = "Office";
        controller.getMapTopologyVersion().should.not.equal(initialVersion);
    });

    it("should reuse cached room geometry across equivalent live map objects", function() {
        const controller = createController();
        controller.serviceAreaSegments = new Map([[1, {id: "1", name: "Bedroom"}]]);
        const createMap = () => ({
            pixelSize: 5,
            metaData: {id: "map-1", version: 2},
            entities: [],
            layers: [new MapLayer({
                type: MapLayer.TYPE.SEGMENT,
                pixels: [10, 10, 11, 10],
                metaData: {segmentId: "1", name: "Bedroom"}
            })]
        });
        controller.robot.state.map = createMap();
        controller.rebuildMapSegmentCache();
        const cachedLayer = controller.mapSegmentCache.byAreaId.get(1).layer;
        controller.robot.state.map = createMap();
        controller.rebuildMapSegmentCache();

        controller.mapSegmentCache.byAreaId.get(1).layer.should.equal(cachedLayer);
    });

    it("should not open a Matter transaction when published RVC state is unchanged", async function() {
        const controller = createController();
        let transactions = 0;
        const agent = {
            rvcOperationalState: {state: {}},
            rvcRunMode: {state: {}},
            rvcCleanMode: {state: {}}
        };
        controller.rvcEndpoint = {
            state: {},
            act: async callback => {
                transactions++;
                callback(agent);
            }
        };
        controller.getMatterOperationalState = () => 0;
        controller.getMatterOperationalError = () => ({errorStateId: 0});
        controller.updateOperationLifecycle = () => null;
        controller.updateServiceAreaProgress = () => {};
        controller.getMatterPhase = () => 6;
        controller.getMatterCountdown = () => null;
        controller.getMatterRunMode = () => 0;
        controller.getMatterCleanMode = () => 0;

        await controller.syncRobotState();
        await controller.syncRobotState();

        transactions.should.equal(1);
    });

    it("should publish final RVC state and operation completion in one transaction without robot reads", async function() {
        const controller = createController();
        let transactions = 0;
        const completions = [];
        controller.robot.capabilities.CurrentStatisticsCapability = {
            getStatistics: async () => {
                throw new Error("syncRobotState must not read robot capabilities");
            }
        };
        controller.rvcEndpoint = {
            state: {},
            act: async callback => {
                transactions++;
                callback({
                    rvcOperationalState: {
                        state: {},
                        reportOperationCompletion: completion => completions.push(completion)
                    },
                    rvcRunMode: {state: {}},
                    rvcCleanMode: {state: {}}
                });
            }
        };
        controller.getMatterOperationalState = () => 0;
        controller.getMatterOperationalError = () => ({errorStateId: 0});
        controller.updateOperationLifecycle = () => ({
            completionErrorCode: 0,
            totalOperationalTime: 120,
            pausedTime: 0
        });
        controller.updateServiceAreaProgress = () => {};
        controller.getMatterPhase = () => 6;
        controller.getMatterCountdown = () => 0;
        controller.getMatterRunMode = () => 0;
        controller.getMatterCleanMode = () => 0;
        controller.getTrackedServiceAreaIds = () => [];

        await controller.syncRobotState({rvc: true, battery: false});

        transactions.should.equal(1);
        completions.should.have.length(1);
        completions[0].totalOperationalTime.should.equal(120);
    });

    it("should not mutate a newer cleaning target after publishing Matter completion", async function() {
        const controller = createController();
        const Target = stateAttrs.CleaningTargetStateAttribute;
        controller.robot.setCleaningTarget({
            value: Target.VALUE.SEGMENTS,
            segmentIds: ["2"],
            source: "matter",
            active: false
        });
        controller.rvcEndpoint = {
            state: {},
            act: async callback => callback({
                rvcOperationalState: {state: {}, reportOperationCompletion: () => {}},
                rvcRunMode: {state: {}},
                rvcCleanMode: {state: {}}
            })
        };
        controller.getMatterOperationalState = () => 0;
        controller.getMatterOperationalError = () => ({errorStateId: 0});
        controller.updateOperationLifecycle = () => ({
            completionErrorCode: 0,
            totalOperationalTime: 120,
            pausedTime: 0
        });
        controller.updateServiceAreaProgress = () => {};
        controller.getMatterPhase = () => 6;
        controller.getMatterCountdown = () => 0;
        controller.getMatterRunMode = () => 0;
        controller.getMatterCleanMode = () => 0;
        controller.getTrackedServiceAreaIds = () => [];

        await controller.syncRobotState({rvc: true, battery: false});
        await new Promise(resolve => setImmediate(resolve));

        controller.robot.state.getFirstMatchingAttributeByConstructor(Target).should.match({
            value: Target.VALUE.SEGMENTS,
            segmentIds: ["2"],
            source: "matter",
            active: false
        });
    });
});
