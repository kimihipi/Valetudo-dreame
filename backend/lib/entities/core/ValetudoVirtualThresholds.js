const SerializableEntity = require("../SerializableEntity");


// noinspection JSUnusedGlobalSymbols
/**
 * @class ValetudoVirtualThresholds
 * @property {Array<{points: {pA: {x: number, y: number}, pB: {x: number, y: number}}}>} passableThresholds
 * @property {Array<{points: {pA: {x: number, y: number}, pB: {x: number, y: number}}}>} impassableThresholds
 * @property {Array<{points: {pA: {x: number, y: number}, pC: {x: number, y: number}}, direction: number}>} ramps
 */
class ValetudoVirtualThresholds extends SerializableEntity {
    /**
     * Container for passable thresholds, impassable thresholds, and ramps
     *
     * @param {object} options
     * @param {Array<{points: {pA: {x: number, y: number}, pB: {x: number, y: number}}}>} options.passableThresholds
     * @param {Array<{points: {pA: {x: number, y: number}, pB: {x: number, y: number}}}>} options.impassableThresholds
     * @param {Array<{points: {pA: {x: number, y: number}, pC: {x: number, y: number}}, direction: number}>} options.ramps
     * @param {object} [options.metaData]
     * @class
     */
    constructor(options) {
        super(options);

        this.passableThresholds = options.passableThresholds;
        this.impassableThresholds = options.impassableThresholds;
        this.ramps = options.ramps;
    }
}

module.exports = ValetudoVirtualThresholds;
