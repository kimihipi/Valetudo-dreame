const Capability = require("./Capability");
const NotImplementedError = require("../NotImplementedError");

/**
 * @template {import("../ValetudoRobot")} T
 * @extends Capability<T>
 */
class BatteryChargeLevelControlCapability extends Capability {
    /**
     * @returns {Promise<string>}
     */
    async getLevel() {
        throw new NotImplementedError();
    }

    /**
     * @param {string} level
     * @returns {Promise<void>}
     */
    async setLevel(level) {
        throw new NotImplementedError();
    }

    /**
     * @returns {{supportedLevels: Array<string>}}
     */
    getProperties() {
        return {
            supportedLevels: []
        };
    }

    getType() {
        return BatteryChargeLevelControlCapability.TYPE;
    }
}

BatteryChargeLevelControlCapability.TYPE = "BatteryChargeLevelControlCapability";

module.exports = BatteryChargeLevelControlCapability;
