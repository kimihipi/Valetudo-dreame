const DreameMiotServices = require("../DreameMiotServices");
const EnergySavingChargingCapability = require("../../../core/capabilities/EnergySavingChargingCapability");
const ValetudoDNDConfiguration = require("../../../entities/core/ValetudoDNDConfiguration");

/**
 * @extends EnergySavingChargingCapability<import("../DreameValetudoRobot")>
 */
class DreameEnergySavingChargingCapability extends EnergySavingChargingCapability {
    /**
     * @param {object} options
     * @param {import("../DreameValetudoRobot")} options.robot
     */
    constructor(options) {
        super(options);

        this.siid = DreameMiotServices["GEN2"].BATTERY.SIID;
        this.piid = DreameMiotServices["GEN2"].BATTERY.PROPERTIES.OFF_PEAK_CHARGING.PIID;
    }

    /**
     * @returns {Promise<ValetudoDNDConfiguration>}
     */
    async getEnergySavingChargingConfiguration() {
        const raw = await this.robot.miotHelper.readProperty(this.siid, this.piid);

        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch (e) {
            parsed = {};
        }

        return new ValetudoDNDConfiguration({
            enabled: parsed.enable === true,
            start: DreameEnergySavingChargingCapability.CONVERT_FROM_TIME_STRING(parsed.startTime ?? "22:00"),
            end: DreameEnergySavingChargingCapability.CONVERT_FROM_TIME_STRING(parsed.endTime ?? "08:00"),
        });
    }

    /**
     * @param {ValetudoDNDConfiguration} config
     * @returns {Promise<void>}
     */
    async setEnergySavingChargingConfiguration(config) {
        const payload = JSON.stringify({
            enable: config.enabled,
            startTime: DreameEnergySavingChargingCapability.CONVERT_TO_TIME_STRING(config.start),
            endTime: DreameEnergySavingChargingCapability.CONVERT_TO_TIME_STRING(config.end),
        });

        await this.robot.miotHelper.writeProperty(this.siid, this.piid, payload);
    }

    /**
     * @private
     * @param {string} time
     * @returns {{hour: number, minute: number}}
     */
    static CONVERT_FROM_TIME_STRING(time) {
        const parts = time.split(":");
        return {
            hour: parseInt(parts[0]),
            minute: parseInt(parts[1]),
        };
    }

    /**
     * @private
     * @param {{hour: number, minute: number}} time
     * @returns {string}
     */
    static CONVERT_TO_TIME_STRING(time) {
        return `${time.hour.toString(10).padStart(2, "0")}:${time.minute.toString(10).padStart(2, "0")}`;
    }
}

module.exports = DreameEnergySavingChargingCapability;
