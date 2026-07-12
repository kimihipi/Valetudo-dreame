const should = require("should");

const MapNodeMqttHandle = require("../../lib/mqtt/handles/MapNodeMqttHandle");

describe("MapNodeMqttHandle", function() {
    it("should share one compressed map between raw and Home Assistant payloads", async function() {
        const handle = Object.create(MapNodeMqttHandle.prototype);
        const map = {
            size: {x: 100, y: 100},
            pixelSize: 5,
            layers: [{metaData: {hidden: false}, compressedPixels: [1, 1, 2]}],
            entities: []
        };
        handle.robot = {state: {map: map}};
        handle.controller = {
            isInitialized: true,
            currentConfig: {customizations: {provideMapData: true}}
        };
        handle.compressedMapCache = {map: null, promise: null, buffer: null, wrappedBuffer: null};

        const raw = await handle.getMapData(false);
        const rawAgain = await handle.getMapData(false);
        const wrapped = await handle.getMapData(true);
        const wrappedAgain = await handle.getMapData(true);

        should(raw).be.instanceof(Buffer);
        rawAgain.should.equal(raw);
        should(wrapped).be.instanceof(Buffer);
        wrappedAgain.should.equal(wrapped);
        wrapped.should.not.equal(raw);
    });
});
