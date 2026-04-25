const DreameMiotServices = require("../DreameMiotServices");
const MopDockSmartMopWashingControlCapability = require("../../../core/capabilities/MopDockSmartMopWashingControlCapability");

/**
 * @extends MopDockSmartMopWashingControlCapability<import("../DreameValetudoRobot")>
 */
class DreameMopDockSmartMopWashingControlCapability extends MopDockSmartMopWashingControlCapability {

    /**
     * @param {object} options
     * @param {import("../DreameValetudoRobot")} options.robot
     */
    constructor(options) {
        super(options);

        this.siid = DreameMiotServices["GEN2"].MOP_EXPANSION.SIID;
        this.piid = DreameMiotServices["GEN2"].MOP_EXPANSION.PROPERTIES.SMART_MOP_WASHING.PIID;
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

module.exports = DreameMopDockSmartMopWashingControlCapability;
