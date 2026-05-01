const Capability = require("./Capability");
const NotImplementedError = require("../NotImplementedError");

/**
 * @template {import("../ValetudoRobot")} T
 * @extends Capability<T>
 */
class EnergySavingChargingCapability extends Capability {
    /**
     * @abstract
     * @returns {Promise<import("../../entities/core/ValetudoDNDConfiguration")>}
     */
    async getEnergySavingChargingConfiguration() {
        throw new NotImplementedError();
    }

    /**
     * @abstract
     * @param {import("../../entities/core/ValetudoDNDConfiguration")} config
     * @returns {Promise<void>}
     */
    async setEnergySavingChargingConfiguration(config) {
        throw new NotImplementedError();
    }

    getType() {
        return EnergySavingChargingCapability.TYPE;
    }
}

EnergySavingChargingCapability.TYPE = "EnergySavingChargingCapability";

module.exports = EnergySavingChargingCapability;
