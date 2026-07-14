const EventEmitter = require("events");
const fs = require("fs");
const os = require("os");
const path = require("path");
const should = require("should");

const CleaningTaskManager = require("../../../lib/core/CleaningTaskManager");
const MapLayer = require("../../../lib/entities/map/MapLayer");
const PointMapEntity = require("../../../lib/entities/map/entities/PointMapEntity");
const RobotState = require("../../../lib/entities/state/RobotState");
const stateAttrs = require("../../../lib/entities/state/attributes");

describe("CleaningTaskManager", function() {
    const createRobot = () => {
        const emitter = new EventEmitter();
        const robot = {
            state: new RobotState({map: {metaData: {id: "map-1"}, layers: [], entities: [], pixelSize: 5}}),
            capabilities: {},
            emitStateAttributesUpdated: () => {},
            onMapUpdated: listener => emitter.on("map", listener),
            offMapUpdated: listener => emitter.off("map", listener),
            emitMap: () => emitter.emit("map"),
            onOperationOutcome: listener => emitter.on("outcome", listener),
            offOperationOutcome: listener => emitter.off("outcome", listener),
            emitOutcome: outcome => emitter.emit("outcome", outcome)
        };
        robot.setCleaningTarget = target => {
            const previous = robot.state.getFirstMatchingAttributeByConstructor(
                stateAttrs.CleaningTargetStateAttribute
            );
            if (target.expectedRevision !== undefined && previous?.revision !== target.expectedRevision) {
                return null;
            }
            const publishedTarget = {...target};
            delete publishedTarget.expectedRevision;
            const attribute = new stateAttrs.CleaningTargetStateAttribute({
                ...publishedTarget,
                revision: (previous?.revision ?? 0) + 1
            });
            robot.state.upsertFirstMatchingAttribute(attribute);
            return attribute;
        };
        return robot;
    };

    it("should retain pauses, room visits and bounded task history", async function() {
        const robot = createRobot();
        robot.state.upsertFirstMatchingAttribute(new stateAttrs.CleaningTargetStateAttribute({
            value: stateAttrs.CleaningTargetStateAttribute.VALUE.SEGMENTS,
            segmentIds: ["2"],
            source: "matter",
            active: true
        }));
        robot.state.upsertFirstMatchingAttribute(new stateAttrs.PresetSelectionStateAttribute({
            type: stateAttrs.PresetSelectionStateAttribute.TYPE.FAN_SPEED,
            value: "medium"
        }));
        robot.state.upsertFirstMatchingAttribute(new stateAttrs.PresetSelectionStateAttribute({
            type: stateAttrs.PresetSelectionStateAttribute.TYPE.WATER_GRADE,
            value: "low"
        }));
        robot.capabilities.CurrentStatisticsCapability = {
            getStatistics: async () => [{type: "time", value: 480}]
        };
        const manager = new CleaningTaskManager({
            robot: robot,
            config: {location: path.join(os.tmpdir(), `valetudo-task-test-${Date.now()}`, "config.json")}
        });

        robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({
            value: stateAttrs.StatusStateAttribute.VALUE.CLEANING
        }));
        await new Promise(resolve => setImmediate(resolve));
        manager.activeTask.should.not.equal(null);
        manager.activeTask.source.should.equal("matter");
        manager.activeTask.currentSegmentId.should.equal("2");

        robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({
            value: stateAttrs.StatusStateAttribute.VALUE.PAUSED
        }));
        manager.activeTask.state.should.equal("paused");
        robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({
            value: stateAttrs.StatusStateAttribute.VALUE.CLEANING
        }));
        manager.detectCurrentSegment = () => "1";
        manager.handleMapUpdate(true);
        robot.state.getFirstMatchingAttributeByConstructor(
            stateAttrs.ActiveCleaningTaskStateAttribute
        ).progress.completedSegmentIds.should.deepEqual(["2"]);
        robot.emitOutcome("completed");
        await new Promise(resolve => setImmediate(resolve));

        manager.getHistory().should.have.length(1);
        manager.getHistory()[0].outcome.should.equal("completed");
        manager.getHistory()[0].totalDurationSeconds.should.equal(480);
        manager.getHistory()[0].profile.fanPreset.should.equal("medium");
        manager.getHistory()[0].profile.waterPreset.should.equal("low");
        should(manager.getHistory()[0].rooms[0].durationSeconds).equal(undefined);
        manager.getHistory()[0].rooms[0].visits.should.equal(1);
        robot.state.getFirstMatchingAttributeByConstructor(
            stateAttrs.CleaningTargetStateAttribute
        ).should.match({value: "all", segmentIds: [], source: "task", active: false});
        manager.shutdown();
    });

    it("should tolerate two-pixel room borders while preferring exact containment", function() {
        const robot = createRobot();
        const position = new PointMapEntity({
            type: PointMapEntity.TYPE.ROBOT_POSITION,
            points: [65, 50]
        });
        robot.state.map.entities = [position];
        robot.state.map.layers = [
            new MapLayer({
                type: MapLayer.TYPE.SEGMENT,
                pixels: [10, 10, 11, 10],
                metaData: {segmentId: "1"}
            }),
            new MapLayer({
                type: MapLayer.TYPE.SEGMENT,
                pixels: [13, 10, 14, 10],
                metaData: {segmentId: "2"}
            })
        ];
        const manager = new CleaningTaskManager({
            robot: robot,
            config: {location: path.join(os.tmpdir(), `valetudo-task-border-${Date.now()}`, "config.json")}
        });

        manager.detectCurrentSegment().should.equal("2");
        position.points = [80, 50];
        manager.detectCurrentSegment().should.equal("2");
        manager.shutdown();
    });

    it("should not complete a resumable dock visit", async function() {
        const robot = createRobot();
        robot.state.map.layers = [
            {type: "segment", metaData: {segmentId: "1"}},
            {type: "segment", metaData: {segmentId: "2"}},
            {type: "segment", metaData: {segmentId: "3", hidden: true}}
        ];
        const manager = new CleaningTaskManager({
            robot: robot,
            config: {location: path.join(os.tmpdir(), `valetudo-task-test-${Date.now()}`, "config.json")}
        });
        robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({
            value: stateAttrs.StatusStateAttribute.VALUE.CLEANING
        }));
        await new Promise(resolve => setImmediate(resolve));
        robot.state.getFirstMatchingAttributeByConstructor(
            stateAttrs.ActiveCleaningTaskStateAttribute
        ).progress.totalRooms.should.equal(2);
        robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({
            value: stateAttrs.StatusStateAttribute.VALUE.DOCKED,
            flag: stateAttrs.StatusStateAttribute.FLAG.RESUMABLE
        }));
        should(manager.activeTask).not.equal(null);
        manager.getHistory().should.have.length(0);
        manager.shutdown();
    });

    it("should publish firmware completion percent and use it for the countdown", async function() {
        const robot = createRobot();
        robot.getManufacturer = () => "dreame";
        robot.state.map.layers = [{
            type: "segment",
            metaData: {segmentId: "1", area: 90000}
        }];
        const manager = new CleaningTaskManager({
            robot: robot,
            config: {location: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "valetudo-task-progress-")),
                "config.json")}
        });

        robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({
            value: "cleaning",
            metaData: {completedPercent: 50}
        }));
        await new Promise(resolve => setImmediate(resolve));

        const task = robot.state.getFirstMatchingAttributeByConstructor(
            stateAttrs.ActiveCleaningTaskStateAttribute
        );
        task.progress.completedPercent.should.equal(50);
        task.progress.estimatedRemainingSeconds.should.equal(270);
        manager.activeTask.estimatedDurationSeconds.should.equal(540);
        manager.shutdown();
    });

    it("should calibrate the countdown from firmware elapsed time and completion percent", async function() {
        const robot = createRobot();
        const manager = new CleaningTaskManager({
            robot: robot,
            config: {location: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "valetudo-task-elapsed-")),
                "config.json")}
        });

        robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({
            value: "cleaning",
            metaData: {completedPercent: 40, cleaningElapsedSeconds: 600}
        }));
        await new Promise(resolve => setImmediate(resolve));

        robot.state.getFirstMatchingAttributeByConstructor(
            stateAttrs.ActiveCleaningTaskStateAttribute
        ).progress.estimatedRemainingSeconds.should.equal(900);
        manager.activeTask.estimatedDurationSeconds.should.equal(1500);
        manager.shutdown();
    });

    it("should use firmware elapsed time with the area fallback before progress settles", async function() {
        const robot = createRobot();
        robot.state.map.layers = [{
            type: "segment",
            metaData: {segmentId: "1", area: 80000}
        }];
        const manager = new CleaningTaskManager({
            robot: robot,
            config: {location: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "valetudo-task-early-progress-")),
                "config.json")}
        });

        robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({
            value: "cleaning",
            metaData: {completedPercent: 2, cleaningElapsedSeconds: 60}
        }));
        await new Promise(resolve => setImmediate(resolve));

        robot.state.getFirstMatchingAttributeByConstructor(
            stateAttrs.ActiveCleaningTaskStateAttribute
        ).progress.estimatedRemainingSeconds.should.equal(420);
        manager.shutdown();
    });

    it("should keep a recoverable error task open and resumable", async function() {
        const robot = createRobot();
        const manager = new CleaningTaskManager({
            robot: robot,
            config: {location: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "valetudo-task-error-")),
                "config.json")}
        });
        robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({value: "cleaning"}));
        await new Promise(resolve => setImmediate(resolve));

        robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({value: "error"}));
        manager.activeTask.state.should.equal("error");
        manager.getHistory().should.have.length(0);

        robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({
            value: "idle",
            flag: stateAttrs.StatusStateAttribute.FLAG.RESUMABLE
        }));
        manager.activeTask.state.should.equal("paused");
        manager.getHistory().should.have.length(0);

        robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({value: "cleaning"}));
        manager.activeTask.state.should.equal("running");
        manager.shutdown();
    });

    it("should not clear a newer cleaning target when an older task finishes", async function() {
        const robot = createRobot();
        robot.setCleaningTarget({value: "segments", segmentIds: ["1"], source: "matter", active: true});
        const manager = new CleaningTaskManager({
            robot: robot,
            config: {location: path.join(os.tmpdir(), `valetudo-task-test-${Date.now()}`, "config.json")}
        });
        robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({value: "cleaning"}));
        await new Promise(resolve => setImmediate(resolve));

        robot.setCleaningTarget({value: "segments", segmentIds: ["2"], source: "webui", active: false});
        robot.emitOutcome("completed");
        await new Promise(resolve => setImmediate(resolve));

        robot.state.getFirstMatchingAttributeByConstructor(
            stateAttrs.CleaningTargetStateAttribute
        ).should.match({value: "segments", segmentIds: ["2"], source: "webui", active: false});
        manager.shutdown();
    });

    it("should not attach an inactive segment draft to an external cleaning start", async function() {
        const robot = createRobot();
        robot.setCleaningTarget({value: "segments", segmentIds: ["2"], source: "webui", active: false});
        const manager = new CleaningTaskManager({
            robot: robot,
            config: {location: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "valetudo-task-external-")),
                "config.json")}
        });

        robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({value: "cleaning"}));
        await new Promise(resolve => setImmediate(resolve));

        manager.activeTask.should.match({source: "robot", target: {type: "all", segmentIds: []}});
        manager.shutdown();
    });

    it("should preserve firmware-reported cleaning types", async function() {
        for (const flag of ["zone", "segment", "spot"]) {
            const robot = createRobot();
            const manager = new CleaningTaskManager({
                robot: robot,
                config: {location: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "valetudo-task-type-")),
                    "config.json")}
            });

            robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({
                value: "cleaning",
                flag: flag
            }));
            await new Promise(resolve => setImmediate(resolve));

            manager.activeTask.target.type.should.equal(flag === "spot" ? "spot" : `${flag}s`);
            manager.shutdown();
        }
    });

    it("should use a firmware cleaning type preserved in status metadata", async function() {
        const robot = createRobot();
        const manager = new CleaningTaskManager({
            robot: robot,
            config: {location: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "valetudo-task-type-metadata-")),
                "config.json")}
        });

        robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({
            value: "cleaning",
            metaData: {cleaningTargetType: "segments"}
        }));
        await new Promise(resolve => setImmediate(resolve));

        manager.activeTask.target.type.should.equal("segments");
        manager.shutdown();
    });

    it("should accept a firmware cleaning type that arrives after cleaning starts", async function() {
        const robot = createRobot();
        const manager = new CleaningTaskManager({
            robot: robot,
            config: {location: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "valetudo-task-late-type-")),
                "config.json")}
        });

        robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({value: "cleaning"}));
        await new Promise(resolve => setImmediate(resolve));
        manager.activeTask.target.type.should.equal("all");

        robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({
            value: "cleaning",
            metaData: {cleaningTargetType: "segments"}
        }));

        manager.activeTask.target.type.should.equal("segments");
        manager.shutdown();
    });

    it("should keep the whole-home room set stable across partial live-map frames", async function() {
        const robot = createRobot();
        robot.state.map.layers = ["1", "2", "3"].map(segmentId => ({
            type: "segment", metaData: {segmentId: segmentId}
        }));
        const manager = new CleaningTaskManager({
            robot: robot,
            config: {location: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "valetudo-task-rooms-")),
                "config.json")}
        });
        robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({value: "cleaning"}));
        await new Promise(resolve => setImmediate(resolve));

        robot.state.map.layers = [{type: "segment", metaData: {segmentId: "2"}}];
        manager.publish();

        const task = robot.state.getFirstMatchingAttributeByConstructor(
            stateAttrs.ActiveCleaningTaskStateAttribute
        );
        task.progress.totalRooms.should.equal(3);
        manager.getTrackedSegmentIds().should.deepEqual(["1", "2", "3"]);
        manager.shutdown();
    });

    it("should hold stopping state until a verified terminal outcome arrives", async function() {
        const robot = createRobot();
        const manager = new CleaningTaskManager({
            robot: robot,
            config: {location: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "valetudo-task-stopping-")),
                "config.json")}
        });
        robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({value: "cleaning"}));
        await new Promise(resolve => setImmediate(resolve));
        robot.state.upsertFirstMatchingAttribute(new stateAttrs.CleaningCommandStateAttribute({
            id: "stop-1", command: "stop", state: "pending", source: "matter",
            createdAt: new Date().toISOString(), revision: 1
        }));

        manager.activeTask.state.should.equal("stopping");
        robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({value: "idle"}));
        manager.activeTask.state.should.equal("stopping");
        robot.emitOutcome("stopped");
        should(manager.activeTask).equal(null);
        manager.getHistory()[0].outcome.should.equal("stopped");
        manager.shutdown();
    });

    it("should prefer a late vendor completion over an idle status fallback", async function() {
        const robot = createRobot();
        const manager = new CleaningTaskManager({
            robot: robot,
            terminalOutcomeGraceMs: 20,
            config: {location: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "valetudo-task-outcome-")),
                "config.json")}
        });
        robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({value: "cleaning"}));
        await new Promise(resolve => setImmediate(resolve));

        robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({value: "docked"}));
        should(manager.activeTask).not.equal(null);
        robot.emitOutcome("completed");

        should(manager.activeTask).equal(null);
        manager.getHistory()[0].outcome.should.equal("completed");
        await new Promise(resolve => setTimeout(resolve, 30));
        manager.getHistory().should.have.length(1);
        manager.shutdown();
    });

    it("should honor a longer vendor outcome grace period from status metadata", async function() {
        const robot = createRobot();
        const manager = new CleaningTaskManager({
            robot: robot,
            terminalOutcomeGraceMs: 10,
            config: {location: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "valetudo-task-vendor-grace-")),
                "config.json")}
        });
        robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({value: "cleaning"}));
        await new Promise(resolve => setImmediate(resolve));

        robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({value: "docked"}));
        await new Promise(resolve => setTimeout(resolve, 2));
        robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({
            value: "docked",
            metaData: {operationOutcomeGraceMs: 30}
        }));
        await new Promise(resolve => setTimeout(resolve, 15));
        should(manager.activeTask).not.equal(null);

        await new Promise(resolve => setTimeout(resolve, 25));
        should(manager.activeTask).equal(null);
        manager.getHistory()[0].outcome.should.equal("stopped");
        manager.shutdown();
    });

    it("should use a vendor completion fallback after the outcome grace period", async function() {
        const robot = createRobot();
        const manager = new CleaningTaskManager({
            robot: robot,
            terminalOutcomeGraceMs: 10,
            config: {location: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "valetudo-task-vendor-fallback-")),
                "config.json")}
        });
        robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({value: "cleaning"}));
        await new Promise(resolve => setImmediate(resolve));

        robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({
            value: "docked",
            metaData: {operationOutcomeGraceMs: 10, operationOutcomeFallback: "completed"}
        }));
        await new Promise(resolve => setTimeout(resolve, 20));

        should(manager.activeTask).equal(null);
        manager.getHistory()[0].outcome.should.equal("completed");
        manager.shutdown();
    });

    it("should finalize once after a statistics timeout", async function() {
        const robot = createRobot();
        robot.capabilities.CurrentStatisticsCapability = {
            getStatistics: () => new Promise(() => {})
        };
        const manager = new CleaningTaskManager({
            robot: robot,
            statisticsTimeoutMs: 10,
            config: {location: path.join(os.tmpdir(), `valetudo-task-test-${Date.now()}`, "config.json")}
        });
        robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({value: "cleaning"}));
        await new Promise(resolve => setImmediate(resolve));
        robot.emitOutcome("completed");

        should(manager.activeTask).equal(null);
        manager.finishing.should.equal(false);
        await new Promise(resolve => setTimeout(resolve, 20));
        manager.getHistory().should.have.length(1);
        manager.shutdown();
    });

    it("should allow a new task while the previous statistics request is pending", async function() {
        const robot = createRobot();
        let resolveStatistics;
        robot.capabilities.CurrentStatisticsCapability = {
            getStatistics: () => new Promise(resolve => {
                resolveStatistics = resolve;
            })
        };
        const manager = new CleaningTaskManager({
            robot: robot,
            statisticsTimeoutMs: 100,
            config: {location: path.join(os.tmpdir(), `valetudo-task-test-${Date.now()}`, "config.json")}
        });
        robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({value: "cleaning"}));
        await new Promise(resolve => setImmediate(resolve));
        const firstTaskId = manager.activeTask.id;
        robot.emitOutcome("completed");
        robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({value: "docked"}));
        robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({value: "cleaning"}));
        await new Promise(resolve => setImmediate(resolve));

        manager.activeTask.id.should.not.equal(firstTaskId);
        resolveStatistics([]);
        await new Promise(resolve => setImmediate(resolve));
        manager.getHistory().should.have.length(1);
        manager.activeTask.id.should.not.equal(firstTaskId);
        manager.shutdown();
    });

    it("should clear a stale vendor outcome when a new task starts", async function() {
        const robot = createRobot();
        const manager = new CleaningTaskManager({
            robot: robot,
            config: {location: path.join(os.tmpdir(), `valetudo-task-test-${Date.now()}`, "config.json")}
        });
        manager.pendingOutcome = "cancelled";

        robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({value: "cleaning"}));
        await new Promise(resolve => setImmediate(resolve));
        should(manager.pendingOutcome).equal(null);
        robot.emitOutcome("completed");
        manager.getHistory()[0].outcome.should.equal("completed");
        manager.shutdown();
    });

    it("should make a vendor outcome immediately authoritative for the active task", async function() {
        const robot = createRobot();
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), "valetudo-task-vendor-outcome-"));
        const manager = new CleaningTaskManager({
            robot: robot,
            config: {location: path.join(directory, "config.json")}
        });
        robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({value: "cleaning"}));
        await new Promise(resolve => setImmediate(resolve));

        robot.emitOutcome("cancelled");

        should(manager.activeTask).equal(null);
        robot.state.getFirstMatchingAttributeByConstructor(
            stateAttrs.ActiveCleaningTaskStateAttribute
        ).should.match({state: "cancelled", outcome: "cancelled"});
        manager.getHistory()[0].outcome.should.equal("cancelled");
        manager.shutdown();
    });

    it("should reset an interrupted segment target to whole-home cleaning", async function() {
        const robot = createRobot();
        const target = robot.setCleaningTarget({
            value: "segments", segmentIds: ["2", "4"], source: "webui", active: true
        });
        const manager = new CleaningTaskManager({
            robot: robot,
            config: {location: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "valetudo-task-reset-")),
                "config.json")}
        });
        robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({value: "cleaning"}));
        await new Promise(resolve => setImmediate(resolve));

        robot.emitOutcome("cancelled");

        robot.state.getFirstMatchingAttributeByConstructor(
            stateAttrs.CleaningTargetStateAttribute
        ).should.match({value: "all", segmentIds: [], active: false, revision: target.revision + 1});
        manager.shutdown();
    });

    it("should flush pending history persistence during shutdown", function() {
        const robot = createRobot();
        const directory = path.join(os.tmpdir(), `valetudo-task-test-${Date.now()}`);
        const manager = new CleaningTaskManager({
            robot: robot,
            config: {location: path.join(directory, "config.json")}
        });
        manager.history = [{id: "last-record", completedAt: new Date().toISOString()}];
        manager.scheduleSave();

        manager.shutdown();

        JSON.parse(fs.readFileSync(path.join(directory, "cleaning_history.json"), "utf8"))
            .history[0].id.should.equal("last-record");
    });

    it("should retain only the latest 50 cleaning cycles", function() {
        const robot = createRobot();
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), "valetudo-task-history-limit-"));
        fs.writeFileSync(path.join(directory, "cleaning_history.json"), JSON.stringify({
            version: 1,
            history: Array.from({length: 60}, (_, index) => ({id: String(index)}))
        }));
        const manager = new CleaningTaskManager({
            robot: robot,
            config: {location: path.join(directory, "config.json")}
        });

        manager.getHistory().should.have.length(50);
        manager.shutdown();
    });

    it("should load history without restoring a terminal task attribute", function() {
        const robot = createRobot();
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), "valetudo-task-no-restore-"));
        fs.writeFileSync(path.join(directory, "cleaning_history.json"), JSON.stringify({
            version: 1,
            history: [{id: "history-record"}],
            lastTask: {id: "legacy-terminal", state: "completed", progress: {}}
        }));

        const manager = new CleaningTaskManager({
            robot: robot,
            config: {location: path.join(directory, "config.json")}
        });

        manager.getHistory()[0].id.should.equal("history-record");
        should(robot.state.getFirstMatchingAttributeByConstructor(
            stateAttrs.ActiveCleaningTaskStateAttribute
        )).equal(null);
        manager.shutdown();
    });

    it("should not infer completed rooms for a non-sequential task", function() {
        const robot = createRobot();
        const manager = new CleaningTaskManager({
            robot: robot,
            config: {location: path.join(os.tmpdir(), `valetudo-task-test-${Date.now()}`, "config.json")}
        });
        manager.activeTask = {nonSequential: true};

        manager.getCompletedRoomCount(["1", "2", "3"]).should.equal(0);
        manager.shutdown();
    });

    it("should periodically refresh task state while paused without map updates", async function() {
        const robot = createRobot();
        const manager = new CleaningTaskManager({
            robot: robot,
            estimateRefreshMs: 10,
            config: {location: path.join(os.tmpdir(), `valetudo-task-test-${Date.now()}`, "config.json")}
        });
        robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({value: "cleaning"}));
        await new Promise(resolve => setImmediate(resolve));
        robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({value: "paused"}));
        const pausedRevision = manager.revision;

        await new Promise(resolve => setTimeout(resolve, 25));

        manager.revision.should.be.above(pausedRevision);
        manager.shutdown();
    });

    it("should provide a fixed map-area fallback before firmware progress is usable", async function() {
        const robot = createRobot();
        robot.getManufacturer = () => "Dreame";
        robot.state.map.layers = [{
            type: "segment",
            metaData: {segmentId: "1"},
            dimensions: {pixelCount: 3600}
        }];
        robot.capabilities.CleanRouteControlCapability = {
            getRoute: async () => "deep"
        };
        const manager = new CleaningTaskManager({
            robot: robot,
            config: {location: path.join(os.tmpdir(), `valetudo-task-test-${Date.now()}`, "config.json")}
        });

        robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({
            value: stateAttrs.StatusStateAttribute.VALUE.CLEANING
        }));
        await new Promise(resolve => setImmediate(resolve));

        const task = robot.state.getFirstMatchingAttributeByConstructor(
            stateAttrs.ActiveCleaningTaskStateAttribute
        );
        task.progress.estimatedRemainingSeconds.should.equal(540);
        task.progress.estimatedCompletionTime.should.be.a.String();
        manager.shutdown();
    });

    it("should discard legacy learned estimates when history is persisted", function() {
        const robot = createRobot();
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), "valetudo-task-estimates-"));
        const storagePath = path.join(directory, "cleaning_history.json");
        fs.writeFileSync(storagePath, JSON.stringify({
            version: 1,
            history: [],
            estimates: {"map|room|profile": {value: 60, samples: 2, updatedAt: 1}}
        }));
        const manager = new CleaningTaskManager({
            robot: robot,
            config: {location: path.join(directory, "config.json")}
        });

        manager.clearHistory();
        manager.shutdown();

        should(JSON.parse(fs.readFileSync(storagePath, "utf8")).estimates).equal(undefined);
    });
});
