const Capability = require("./Capability");
const NotImplementedError = require("../NotImplementedError");

/**
 *
 * @template {import("../ValetudoRobot")} T
 * @extends Capability<T>
 */
class MaintenanceCapability extends Capability {
    /**
     * @abstract
     * @param {string} action
     * @returns {Promise<void>}
     */
    async executeMaintenanceAction(action) {
        throw new NotImplementedError();
    }

    getType() {
        return MaintenanceCapability.TYPE;
    }

    /**
     * @returns {{supportedActions: Array<string>}}
     */
    getProperties() {
        return {
            supportedActions: []
        };
    }
}

MaintenanceCapability.TYPE = "MaintenanceCapability";

module.exports = MaintenanceCapability;
