const Logger = require("../../../Logger");
const MaintenanceCapability = require("../../../core/capabilities/MaintenanceCapability");

/**
 * @extends MaintenanceCapability<import("../MockValetudoRobot")>
 */
class MockMaintenanceCapability extends MaintenanceCapability {
    /**
     * @param {object} options
     * @param {import("../MockValetudoRobot")} options.robot
     * @param {Array<string>} options.supportedActions
     */
    constructor(options) {
        super(options);
        this.supportedActions = options.supportedActions;
    }

    /**
     * @param {string} action
     * @returns {Promise<void>}
     */
    async executeMaintenanceAction(action) {
        Logger.info(`Maintenance action triggered: ${action}`);
    }

    /**
     * @returns {{supportedActions: Array<string>}}
     */
    getProperties() {
        return {
            supportedActions: this.supportedActions
        };
    }
}

module.exports = MockMaintenanceCapability;
