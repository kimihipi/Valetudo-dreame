const StateAttribute = require("./StateAttribute");

/**
 * Describes the cleaning target currently prepared or active on the robot.
 * Segment IDs are intentionally ordered because some robots support a custom
 * room-cleaning order.
 */
class CleaningTargetStateAttribute extends StateAttribute {
    /**
     * @param {object} options
     * @param {CleaningTargetStateAttributeValue} options.value
     * @param {Array<string|number>} [options.segmentIds]
     * @param {string} [options.source]
     * @param {boolean} [options.active]
     * @param {number} [options.revision]
     * @param {object} [options.metaData]
     */
    constructor(options) {
        super(options);

        this.value = options.value;
        this.segmentIds = (options.segmentIds ?? []).map(id => String(id));
        this.source = options.source ?? "robot";
        this.active = options.active === true;
        this.revision = options.revision ?? 0;
    }
}

/**
 * @typedef {string} CleaningTargetStateAttributeValue
 * @enum {string}
 */
CleaningTargetStateAttribute.VALUE = Object.freeze({
    NONE: "none",
    ALL: "all",
    SEGMENTS: "segments",
    ZONES: "zones"
});

module.exports = CleaningTargetStateAttribute;
