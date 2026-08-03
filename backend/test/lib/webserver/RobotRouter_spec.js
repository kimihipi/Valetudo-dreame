const should = require("should");

const RobotRouter = require("../../../lib/webserver/RobotRouter");
const SSEHub = require("../../../lib/webserver/middlewares/sse/SSEHub");

const createActivityHistoryRouter = attributes => {
    const robot = {
        state: {attributes: attributes, map: null},
        onStateUpdated: () => {},
        offStateUpdated: () => {},
        onStateAttributesUpdated: () => {},
        offStateAttributesUpdated: () => {},
        onMapUpdated: () => {},
        offMapUpdated: () => {},
    };
    const router = Object.create(RobotRouter.prototype);
    router.robot = robot;
    router.router = {get: () => {}};
    router.activityHistory = [];
    router.prevStatusKey = null;
    router.activityHistoryDebounceTimer = null;
    router.mapSSEUpdateTimer = null;
    router.pendingSSEMap = null;
    router.cachedMapStaticFingerprint = null;
    router.cachedMapStaticPayload = null;
    router.initSSE();

    return router;
};

describe("RobotRouter map stream", function() {
    const createMap = () => ({
        metaData: {id: "map-1", nonce: "one", version: 2},
        size: {x: 100, y: 100},
        pixelSize: 5,
        layers: [{
            type: "segment",
            metaData: {segmentId: "1", name: "Bedroom", area: 50, active: false},
            dimensions: {x: {min: 1, max: 5}, y: {min: 1, max: 5}, pixelCount: 10},
            pixels: [],
            compressedPixels: [1, 1, 2]
        }],
        entities: []
    });

    it("should cache static layers while streaming dynamic map changes", function() {
        const router = Object.create(RobotRouter.prototype);
        router.cachedMapStaticFingerprint = null;
        router.cachedMapStaticPayload = null;
        const map = createMap();
        const initial = JSON.parse(router.serializeMapV2(map));
        should(initial.static).not.equal(null);

        map.metaData.nonce = "two";
        map.layers[0].metaData.active = true;
        map.entities = [{type: "robot_position", points: [10, 20], metaData: {}}];
        const dynamic = JSON.parse(router.serializeMapV2(map));
        should(dynamic.static).equal(null);
        dynamic.dynamic.layerMetaData[0].active.should.equal(true);
        dynamic.dynamic.entities.should.have.length(1);

        map.layers[0].metaData.name = "Office";
        should(JSON.parse(router.serializeMapV2(map)).static).not.equal(null);
    });

    it("should use latest-frame writes for split map events", function() {
        const hub = new SSEHub({name: "test"});
        let payload;
        hub.register({writeLatest: value => {
            payload = value;
        }});

        hub.latestEvent("MapUpdatedV2", "{\"dynamic\":{}}");

        payload.should.equal("event: MapUpdatedV2\ndata: {\"dynamic\":{}}\n\n");
    });
});

describe("RobotRouter activity history", function() {
    const createError = vendorErrorCode => ({
        __class: "ValetudoRobotError",
        metaData: {},
        severity: {kind: "transient", level: "error"},
        subsystem: "navigation",
        message: "Robot stuck or trapped",
        vendorErrorCode: vendorErrorCode,
    });

    it("should immediately snapshot structured robot errors", function() {
        const error = createError("31");
        const router = createActivityHistoryRouter([{
            __class: "StatusStateAttribute",
            value: "error",
            flag: "none",
            error: error,
        }]);

        try {
            router.activityHistoryListener();

            router.activityHistory.should.have.length(1);
            router.activityHistory[0].error.should.deepEqual(error);
            should(router.activityHistoryDebounceTimer).equal(null);

            error.message = "Changed after the transition";
            router.activityHistory[0].error.message.should.equal("Robot stuck or trapped");
        } finally {
            router.shutdown();
        }
    });

    it("should record different error codes as separate transitions", function() {
        const status = {
            __class: "StatusStateAttribute",
            value: "error",
            flag: "none",
            error: createError("31"),
        };
        const router = createActivityHistoryRouter([status]);

        try {
            router.activityHistoryListener();
            status.error = createError("48");
            router.activityHistoryListener();

            router.activityHistory.should.have.length(2);
            router.activityHistory.map(entry => entry.error.vendorErrorCode).should.deepEqual(["48", "31"]);
        } finally {
            router.shutdown();
        }
    });
});
