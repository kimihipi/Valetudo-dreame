const should = require("should");

const RobotRouter = require("../../../lib/webserver/RobotRouter");
const SSEHub = require("../../../lib/webserver/middlewares/sse/SSEHub");

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
