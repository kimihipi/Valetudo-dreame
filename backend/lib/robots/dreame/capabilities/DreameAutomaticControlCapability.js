const AutomaticControlCapability = require("../../../core/capabilities/AutomaticControlCapability");
const DreameMiotServices = require("../DreameMiotServices");
const DreameUtils = require("../DreameUtils");

/**
 * @extends AutomaticControlCapability<import("../DreameValetudoRobot")>
 */
class DreameAutomaticControlCapability extends AutomaticControlCapability {

    /**
     * @param {object} options
     * @param {import("../DreameValetudoRobot")} options.robot
     * @param {Array<import("../../../entities/core/ValetudoSelectionPreset")>} options.presets
     */
    constructor(options) {
        super(options);

        this.vacuumSiid = DreameMiotServices["GEN2"].VACUUM_2.SIID;
        this.miscTunablesPiid = DreameMiotServices["GEN2"].VACUUM_2.PROPERTIES.MISC_TUNABLES.PIID;
    }

    /**
     * @param {string} preset
     * @returns {Promise<void>}
     */
    async selectPreset(preset) {
        const matchedPreset = this.presets.find(p => p.name === preset);

        if (!matchedPreset) {
            throw new Error("Invalid Preset");
        }

        await this.robot.miotHelper.writeProperty(
            this.vacuumSiid,
            this.miscTunablesPiid,
            DreameUtils.SERIALIZE_MISC_TUNABLES_SINGLE_TUNABLE({
                SmartHost: matchedPreset.value
            })
        );
    }

}

module.exports = DreameAutomaticControlCapability;
