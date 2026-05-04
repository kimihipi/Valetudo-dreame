const BatteryChargeLevelControlCapability = require("../../../core/capabilities/BatteryChargeLevelControlCapability");
const DreameMiotServices = require("../DreameMiotServices");

/**
 * @extends BatteryChargeLevelControlCapability<import("../DreameValetudoRobot")>
 */
class DreameBatteryChargeLevelControlCapability extends BatteryChargeLevelControlCapability {
    /**
     * @param {object} options
     * @param {import("../DreameValetudoRobot")} options.robot
     */
    constructor(options) {
        super(options);

        this.siid = DreameMiotServices["GEN2"].MOP_EXPANSION.SIID;
        this.piid = DreameMiotServices["GEN2"].MOP_EXPANSION.PROPERTIES.BATTERY_CHARGE_LEVEL.PIID;
    }

    /**
     * @returns {Promise<string>}
     */
    async getLevel() {
        const res = await this.robot.miotHelper.readProperty(this.siid, this.piid);
        return res + "%";
    }

    /**
     * @param {string} level
     * @returns {Promise<void>}
     */
    async setLevel(level) {
        if (!this.getProperties().supportedLevels.includes(level)) {
            throw new Error(`Invalid level: ${level}`);
        }
        return this.robot.miotHelper.writeProperty(this.siid, this.piid, parseInt(level));
    }

    getProperties() {
        return {
            supportedLevels: ["80%", "90%", "100%"]
        };
    }
}

module.exports = DreameBatteryChargeLevelControlCapability;
