const should = require("should");

const DreameGen2ValetudoRobot = require("../../../../lib/robots/dreame/DreameGen2ValetudoRobot");
const stateAttrs = require("../../../../lib/entities/state/attributes");

should.config.checkProtoEql = false;

describe("DreameGen2ValetudoRobot", function() {
    const createStateRobot = () => {
        const robot = Object.create(DreameGen2ValetudoRobot.prototype);
        const attributes = [];
        robot.ephemeralState = {
            mode: 0,
            gen2StatusValue: undefined,
            taskStatus: undefined,
            cleanupTaskActive: false,
            cleanupOutcomeExpectedUntil: 0,
            isCharging: false,
            errorCode: "0",
            cleaningPaused: undefined,
            cleaningProgress: undefined,
            cleaningElapsedSeconds: undefined,
            mopDockState: undefined,
            autoEmptyDockState: undefined,
            dryingProgress: undefined,
            mopDryingTimeHours: undefined
        };
        robot.state = {
            upsertFirstMatchingAttribute: attribute => {
                const index = attributes.findIndex(existing =>
                    existing.constructor === attribute.constructor && existing.type === attribute.type);
                if (index === -1) {
                    attributes.push(attribute);
                } else {
                    attributes[index] = attribute;
                }
            },
            getFirstMatchingAttribute: query => attributes.find(attribute =>
                attribute.constructor.name === query.attributeClass),
            getFirstMatchingAttributeByConstructor: Constructor => attributes.find(attribute =>
                attribute instanceof Constructor)
        };
        robot.getModelDetails = () => ({
            supportedAttachments: [stateAttrs.AttachmentStateAttribute.TYPE.MOP],
            supportedDockComponents: [stateAttrs.DockComponentStateAttribute.TYPE.WATER_TANK_CLEAN]
        });
        robot.emitStateAttributesUpdated = () => {};
        robot.pollMap = () => {};
        return robot;
    };
    const cleanupEvent = (status, properties) => ({
        siid: 4,
        arguments: [
            {piid: 13, value: status},
            ...(properties === undefined ? [] : [{piid: 10, value: properties}])
        ]
    });
    const createEventRobot = command => {
        const robot = Object.create(DreameGen2ValetudoRobot.prototype);
        robot.ephemeralState = {cleanupTaskActive: false, cleanupOutcomeExpectedUntil: 0};
        robot.state = {getFirstMatchingAttributeByConstructor: () => command};
        robot.outcomes = [];
        robot.acknowledgements = [];
        robot.emitOperationOutcome = outcome => robot.outcomes.push(outcome);
        robot.sendCloud = message => {
            robot.acknowledgements.push(message);
            return Promise.resolve();
        };
        return robot;
    };

    it("should decode cleaning task types", function() {
        DreameGen2ValetudoRobot.TASK_STATUS_MAP[1].should.match({cleaning: true, target: "all"});
        DreameGen2ValetudoRobot.TASK_STATUS_MAP[2].should.match({cleaning: true, target: "zones"});
        DreameGen2ValetudoRobot.TASK_STATUS_MAP[3].should.match({cleaning: true, target: "segments"});
        DreameGen2ValetudoRobot.TASK_STATUS_MAP[4].should.match({cleaning: true, target: "spot"});
    });

    it("should preserve the cleaning type for paused tasks", function() {
        DreameGen2ValetudoRobot.TASK_STATUS_MAP[7].should.match({
            name: "zone_cleaning_paused", cleaning: true, target: "zones"
        });
        DreameGen2ValetudoRobot.TASK_STATUS_MAP[8].should.match({
            name: "segment_cleaning_paused", cleaning: true, target: "segments"
        });
        DreameGen2ValetudoRobot.TASK_STATUS_MAP[9].should.match({
            name: "spot_cleaning_paused", cleaning: true, target: "spot"
        });
    });

    it("should not treat completed or non-cleaning tasks as pending cleaning", function() {
        DreameGen2ValetudoRobot.TASK_STATUS_MAP[0].cleaning.should.equal(false);
        DreameGen2ValetudoRobot.TASK_STATUS_MAP[5].cleaning.should.equal(false);
        DreameGen2ValetudoRobot.TASK_STATUS_MAP[10].cleaning.should.equal(false);
        DreameGen2ValetudoRobot.TASK_STATUS_MAP[11].cleaning.should.equal(false);
    });

    it("should classify firmware cleanup results", function() {
        DreameGen2ValetudoRobot.PARSE_CLEANUP_OUTCOME(cleanupEvent(1)).should.equal("completed");
        DreameGen2ValetudoRobot.PARSE_CLEANUP_OUTCOME(cleanupEvent(2)).should.equal("cancelled");
        DreameGen2ValetudoRobot.PARSE_CLEANUP_OUTCOME(cleanupEvent(3)).should.equal("failed");
        DreameGen2ValetudoRobot.PARSE_CLEANUP_OUTCOME(cleanupEvent(0)).should.equal("completed");
    });

    it("should classify interrupted cleanup results from abnormal_end", function() {
        DreameGen2ValetudoRobot.PARSE_CLEANUP_OUTCOME(cleanupEvent(
            0, JSON.stringify({abnormal_end: JSON.stringify([21])})
        )).should.equal("failed");
        DreameGen2ValetudoRobot.PARSE_CLEANUP_OUTCOME(cleanupEvent(
            0, {abnormal_end: [0]}
        )).should.equal("completed");
    });

    it("should emit the classified outcome and acknowledge the cleanup event", function() {
        const robot = createEventRobot();
        robot.updateCleanupTaskStatus(1);

        const handled = robot.onIncomingCloudMessage({
            id: 42,
            method: "event_occured",
            params: cleanupEvent(1)
        });

        handled.should.equal(true);
        robot.outcomes.should.deepEqual(["completed"]);
        robot.acknowledgements.should.deepEqual([{id: 42, result: "ok"}]);
    });

    it("should accept an outcome for two seconds after task_status becomes zero", function() {
        const robot = createEventRobot();
        robot.updateCleanupTaskStatus(3);
        robot.updateCleanupTaskStatus(0);

        robot.ephemeralState.cleanupTaskActive.should.equal(false);
        robot.isCleanupOutcomeExpected().should.equal(true);
        robot.ephemeralState.cleanupOutcomeExpectedUntil.should.be.above(Date.now() + 1500);
    });

    it("should ignore outcomes without a recently active cleaning task", function() {
        const robot = createEventRobot();

        robot.onIncomingCloudMessage({id: 1, method: "event_occured", params: cleanupEvent(1)});

        robot.outcomes.should.be.empty();
        robot.acknowledgements.should.deepEqual([{id: 1, result: "ok"}]);
    });

    it("should leave pending Stop and Home outcomes to the command coordinator", function() {
        for (const command of ["stop", "home"]) {
            const robot = createEventRobot({command: command, state: "pending"});
            robot.updateCleanupTaskStatus(1);

            robot.onIncomingCloudMessage({id: 1, method: "event_occured", params: cleanupEvent(2)});

            robot.outcomes.should.be.empty();
        }
    });

    it("should ignore unrelated or malformed cleanup events", function() {
        should(DreameGen2ValetudoRobot.PARSE_CLEANUP_OUTCOME({siid: 4, arguments: []})).equal(undefined);
        should(DreameGen2ValetudoRobot.PARSE_CLEANUP_OUTCOME(cleanupEvent(7))).equal(undefined);
        should(DreameGen2ValetudoRobot.PARSE_CLEANUP_OUTCOME(cleanupEvent(null))).equal(undefined);
        should(DreameGen2ValetudoRobot.PARSE_CLEANUP_OUTCOME(cleanupEvent(false))).equal(undefined);
        should(DreameGen2ValetudoRobot.PARSE_CLEANUP_OUTCOME(cleanupEvent(0, "not-json"))).equal(undefined);
        should(DreameGen2ValetudoRobot.PARSE_CLEANUP_OUTCOME(cleanupEvent(
            0, {abnormal_end: null}
        ))).equal(undefined);
        should(DreameGen2ValetudoRobot.PARSE_CLEANUP_OUTCOME(cleanupEvent(
            0, {abnormal_end: [null]}
        ))).equal(undefined);
        should(DreameGen2ValetudoRobot.PARSE_CLEANUP_OUTCOME(cleanupEvent(
            0, {abnormal_end: false}
        ))).equal(undefined);
        should(DreameGen2ValetudoRobot.PARSE_CLEANUP_OUTCOME({
            siid: 3, arguments: [{piid: 13, value: 1}]
        })).equal(undefined);
    });

    it("should expose firmware cleaning progress and resumable pause confirmation", function() {
        const robot = createStateRobot();
        const properties = DreameGen2ValetudoRobot.MIOT_SERVICES.VACUUM_2.PROPERTIES;

        robot.parseAndUpdateState([
            {siid: 4, piid: properties.MODE.PIID, value: 6},
            {siid: 4, piid: properties.CLEANING_PAUSED.PIID, value: 1},
            {siid: 4, piid: properties.CLEANING_TIME.PIID, value: 10},
            {siid: 4, piid: properties.CLEANING_PROGRESS.PIID, value: 47}
        ]);

        robot.state.getFirstMatchingAttributeByConstructor(stateAttrs.StatusStateAttribute).should.match({
            value: "docked",
            flag: "resumable",
            metaData: {cleaningPaused: true, completedPercent: 47, cleaningElapsedSeconds: 600}
        });
    });

    it("should map mop, low-water and drying progress to generic attributes", function() {
        const robot = createStateRobot();
        const properties = DreameGen2ValetudoRobot.MIOT_SERVICES.VACUUM_2.PROPERTIES;

        robot.parseAndUpdateState([
            {siid: 4, piid: properties.WATER_TANK_ATTACHMENT.PIID, value: 1},
            {siid: 4, piid: properties.LOW_WATER_WARNING.PIID, value: 6},
            {siid: 4, piid: properties.MOP_DRYING_TIME.PIID, value: 2},
            {siid: 4, piid: properties.DRYING_PROGRESS.PIID, value: 25},
            {siid: 4, piid: properties.MOP_DOCK_STATUS.PIID, value: 2}
        ]);

        robot.state.getFirstMatchingAttributeByConstructor(stateAttrs.AttachmentStateAttribute)
            .should.match({type: "mop", attached: true});
        robot.state.getFirstMatchingAttributeByConstructor(stateAttrs.DockComponentStateAttribute)
            .should.match({type: "water_tank_clean", value: "missing", metaData: {rawValue: 6}});
        robot.state.getFirstMatchingAttributeByConstructor(stateAttrs.DockStatusStateAttribute)
            .should.match({value: "drying", metaData: {percent: 25, remainingSeconds: 5400}});
    });

    it("should never change dock activity from a progress-only update", function() {
        const robot = createStateRobot();
        const properties = DreameGen2ValetudoRobot.MIOT_SERVICES.VACUUM_2.PROPERTIES;
        robot.state.upsertFirstMatchingAttribute(new stateAttrs.DockStatusStateAttribute({value: "cleaning"}));

        robot.parseAndUpdateState([
            {siid: 4, piid: properties.MOP_DRYING_TIME.PIID, value: 2},
            {siid: 4, piid: properties.DRYING_PROGRESS.PIID, value: 25}
        ]);

        robot.state.getFirstMatchingAttributeByConstructor(stateAttrs.DockStatusStateAttribute)
            .should.match({value: "cleaning", metaData: {}});
    });
});
