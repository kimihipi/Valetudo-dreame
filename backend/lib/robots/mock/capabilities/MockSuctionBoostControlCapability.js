const SuctionBoostControlCapability = require("../../../core/capabilities/SuctionBoostControlCapability");

/**
 * @extends SuctionBoostControlCapability<import("../MockValetudoRobot")>
 */
class MockSuctionBoostControlCapability extends SuctionBoostControlCapability {
    /**
     * @param {object} options
     * @param {import("../MockValetudoRobot")} options.robot
     */
    constructor(options) {
        super(options);

        this.enabled = false;
    }

    /**
     * This function polls the current suction boost state
     *
     * @returns {Promise<boolean>}
     */
    async isEnabled() {
        return this.enabled;
    }

    /**
     * @returns {Promise<void>}
     */
    async enable() {
        this.enabled = true;
    }

    /**
     * @returns {Promise<void>}
     */
    async disable() {
        this.enabled = false;
    }
}

module.exports = MockSuctionBoostControlCapability;
