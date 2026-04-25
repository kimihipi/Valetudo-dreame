const StateAttribute = require("./StateAttribute");

class StatusStateAttribute extends StateAttribute {
    /**
     * @param {object} options
     * @param {StatusStateAttributeValue} options.value
     * @param {StatusStateAttributeFlag} [options.flag]
     * @param {import("../../core/ValetudoRobotError")} [options.error]
     * @param {object} [options.metaData]
     */
    constructor(options) {
        super(options);

        this.value = options.value;
        this.flag = options.flag ?? StatusStateAttribute.FLAG.NONE;

        this.error = this.value === StatusStateAttribute.VALUE.ERROR ? options.error : undefined;
    }

    get isActiveState() {
        return [
            StatusStateAttribute.VALUE.RETURNING,
            StatusStateAttribute.VALUE.CLEANING,
            StatusStateAttribute.VALUE.MANUAL_CONTROL,
            StatusStateAttribute.VALUE.MOVING
        ].includes(this.value);
    }
}

/**
 *  @typedef {string} StatusStateAttributeValue
 *  @enum {string}
 *
 */
StatusStateAttribute.VALUE = Object.freeze({
    ERROR: "error",
    DOCKED: "docked",
    IDLE: "idle",
    RETURNING: "returning",
    CLEANING: "cleaning",
    PAUSED: "paused",
    MANUAL_CONTROL: "manual_control",
    MOVING: "moving"
});

/**
 *  @typedef {string} StatusStateAttributeFlag
 *  @enum {string}
 *
 */
StatusStateAttribute.FLAG = Object.freeze({
    NONE: "none",
    ZONE: "zone",
    SEGMENT: "segment",
    SPOT: "spot",
    TARGET: "target",
    RESUMABLE: "resumable",
    MAPPING: "mapping",
    // Cleaning type
    VACUUMING: "vacuuming",
    MOPPING: "mopping",
    VACUUMING_AND_MOPPING: "vacuuming_and_mopping",
    AUTO_RECLEANING: "auto_recleaning",
    // Returning reason
    TO_WASH: "to_wash",
    INSTALL_MOP: "install_mop",
    REMOVE_MOP: "remove_mop",
    TO_EMPTY: "to_empty",
    TO_DRAIN: "to_drain",
    // Docked activity
    WASHING: "washing",
    DRYING: "drying",
    EMPTYING: "emptying",
    DRAINING: "draining",
    CHANGING_MOP: "changing_mop",
});


module.exports = StatusStateAttribute;
