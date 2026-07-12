const EventEmitter = require("events");
const os = require("os");
const path = require("path");
const should = require("should");

const CleaningTaskManager = require("../../../lib/core/CleaningTaskManager");
const RobotState = require("../../../lib/entities/state/RobotState");
const stateAttrs = require("../../../lib/entities/state/attributes");

describe("CleaningTaskManager", function() {
    const createRobot = () => {
        const emitter = new EventEmitter();
        return {
            state: new RobotState({map: {metaData: {id: "map-1"}, layers: [], entities: [], pixelSize: 5}}),
            capabilities: {},
            emitStateAttributesUpdated: () => {},
            onMapUpdated: listener => emitter.on("map", listener),
            offMapUpdated: listener => emitter.off("map", listener),
            emitMap: () => emitter.emit("map")
        };
    };

    it("should retain pauses, room re-entry and bounded learned history", async function() {
        const robot = createRobot();
        robot.state.upsertFirstMatchingAttribute(new stateAttrs.CleaningTargetStateAttribute({
            value: stateAttrs.CleaningTargetStateAttribute.VALUE.SEGMENTS,
            segmentIds: ["2"],
            source: "matter"
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
        robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({
            value: stateAttrs.StatusStateAttribute.VALUE.DOCKED
        }));
        await new Promise(resolve => setImmediate(resolve));

        manager.getHistory().should.have.length(1);
        manager.getHistory()[0].outcome.should.equal("completed");
        manager.getHistory()[0].totalDurationSeconds.should.equal(480);
        manager.getHistory()[0].profile.fanPreset.should.equal("medium");
        manager.getHistory()[0].profile.waterPreset.should.equal("low");
        Object.keys(manager.getEstimates()).should.have.length(1);
        Object.values(manager.getEstimates())[0].value.should.equal(480);
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
});
