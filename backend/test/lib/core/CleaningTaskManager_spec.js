const EventEmitter = require("events");
const fs = require("fs");
const os = require("os");
const path = require("path");
const should = require("should");

const CleaningTaskManager = require("../../../lib/core/CleaningTaskManager");
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

    it("should retain pauses, room re-entry and bounded learned history", async function() {
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
        manager.activeTask.rooms["2"].durationSeconds = 40;
        robot.emitOutcome("completed");
        await new Promise(resolve => setImmediate(resolve));

        manager.getHistory().should.have.length(1);
        manager.getHistory()[0].outcome.should.equal("completed");
        manager.getHistory()[0].totalDurationSeconds.should.equal(480);
        manager.getHistory()[0].profile.fanPreset.should.equal("medium");
        manager.getHistory()[0].profile.waterPreset.should.equal("low");
        Object.keys(manager.getEstimates()).should.have.length(1);
        Object.values(manager.getEstimates())[0].value.should.equal(480);
        robot.state.getFirstMatchingAttributeByConstructor(
            stateAttrs.CleaningTargetStateAttribute
        ).should.match({value: "none", segmentIds: [], source: "task", active: false});
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

    it("should invalidate only unavailable rooms in an inactive draft", function() {
        const robot = createRobot();
        robot.state.map.layers = [
            {type: "segment", metaData: {segmentId: "2"}},
            {type: "segment", metaData: {segmentId: "3", hidden: true}}
        ];
        robot.setCleaningTarget({value: "segments", segmentIds: ["1", "2", "3"], source: "webui", active: false});
        const manager = new CleaningTaskManager({
            robot: robot,
            config: {location: path.join(os.tmpdir(), `valetudo-task-test-${Date.now()}`, "config.json")}
        });

        manager.handleMapUpdate();

        robot.state.getFirstMatchingAttributeByConstructor(
            stateAttrs.CleaningTargetStateAttribute
        ).should.match({value: "segments", segmentIds: ["2"], source: "system", active: false});
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

    it("should provide a Dreame map-area baseline before room history is learned", async function() {
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

        robot.state.getFirstMatchingAttributeByConstructor(
            stateAttrs.ActiveCleaningTaskStateAttribute
        ).progress.estimatedRemainingSeconds.should.equal(900);
        manager.shutdown();
    });

    it("should bound learned estimates across maps and profiles", function() {
        const robot = createRobot();
        const manager = new CleaningTaskManager({
            robot: robot,
            config: {location: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "valetudo-task-estimates-")),
                "config.json")}
        });

        for (let map = 0; map < 8; map++) {
            for (let room = 0; room < 120; room++) {
                manager.learnRoom({segmentId: String(room), durationSeconds: 60}, {
                    operationMode: "vacuum", cleanRoute: "routine", iterations: 1
                }, `map-${map}`);
            }
        }

        const estimates = manager.getEstimates();
        Object.keys(estimates).length.should.be.belowOrEqual(500);
        new Set(Object.keys(estimates).map(key => key.split("|")[0])).size.should.be.belowOrEqual(5);
        Object.keys(estimates).some(key => key.startsWith("map-7|")).should.equal(true);
        manager.shutdown();
    });
});
