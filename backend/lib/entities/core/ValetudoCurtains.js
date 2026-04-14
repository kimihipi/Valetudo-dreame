const SerializableEntity = require("../SerializableEntity");


// noinspection JSUnusedGlobalSymbols
/**
 * @class ValetudoCurtains
 * @property {Array<{points: {pA: {x: number, y: number}, pB: {x: number, y: number}}}>} curtains
 */
class ValetudoCurtains extends SerializableEntity {
    /**
     * Container for curtain lines
     *
     * @param {object} options
     * @param {Array<{points: {pA: {x: number, y: number}, pB: {x: number, y: number}}}>} options.curtains
     * @param {object} [options.metaData]
     * @class
     */
    constructor(options) {
        super(options);

        this.curtains = options.curtains;
    }
}

module.exports = ValetudoCurtains;
