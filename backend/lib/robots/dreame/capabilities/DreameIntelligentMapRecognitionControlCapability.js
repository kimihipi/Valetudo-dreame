const IntelligentMapRecognitionControlCapability = require("../../../core/capabilities/IntelligentMapRecognitionControlCapability");

/**
 * @extends IntelligentMapRecognitionControlCapability<import("../DreameValetudoRobot")>
 */
class DreameIntelligentMapRecognitionControlCapability extends IntelligentMapRecognitionControlCapability {

    /**
     * @param {object} options
     * @param {import("../DreameValetudoRobot")} options.robot
     *
     * @param {number} options.siid MIOT Service ID
     * @param {number} options.piid MIOT Property ID
     */
    constructor(options) {
        super(options);

        this.siid = options.siid;
        this.piid = options.piid;
    }

    /**
     * @returns {Promise<boolean>}
     */
    async isEnabled() {
        const res = await this.robot.miotHelper.readProperty(this.siid, this.piid);

        return res === 1;
    }

    /**
     * @returns {Promise<void>}
     */
    async enable() {
        await this.robot.miotHelper.writeProperty(this.siid, this.piid, 1);
    }

    /**
     * @returns {Promise<void>}
     */
    async disable() {
        await this.robot.miotHelper.writeProperty(this.siid, this.piid, 0);
    }
}

module.exports = DreameIntelligentMapRecognitionControlCapability;
