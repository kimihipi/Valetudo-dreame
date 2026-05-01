const SerializableEntity = require("../SerializableEntity");


// noinspection JSUnusedGlobalSymbols
/**
 * @class ValetudoCarpetZones
 * @property {Array<{points: {pA: {x: number, y: number}, pB: {x: number, y: number}, pC: {x: number, y: number}, pD: {x: number, y: number}}}>} zones
 */
class ValetudoCarpetZones extends SerializableEntity {
    /**
     * Container for manually-defined carpet zones
     *
     * @param {object} options
     * @param {Array<{points: {pA: {x: number, y: number}, pB: {x: number, y: number}, pC: {x: number, y: number}, pD: {x: number, y: number}}}>} options.zones
     * @param {object} [options.metaData]
     * @class
     */
    constructor(options) {
        super(options);

        this.zones = options.zones;
    }
}

module.exports = ValetudoCarpetZones;
