const AutomaticSubModeControlCapability = require("../../../core/capabilities/AutomaticSubModeControlCapability");
const DreameMiotServices = require("../DreameMiotServices");

/**
 * @extends AutomaticSubModeControlCapability<import("../DreameValetudoRobot")>
 */
class DreameAutomaticSubModeControlCapability extends AutomaticSubModeControlCapability {

    /**
     * @param {object} options
     * @param {import("../DreameValetudoRobot")} options.robot
     * @param {Array<import("../../../entities/core/ValetudoSelectionPreset")>} options.presets
     */
    constructor(options) {
        super(options);

        this.mopExpansionSiid = DreameMiotServices["GEN2"].MOP_EXPANSION.SIID;
        this.cleanGeniusModePiid = DreameMiotServices["GEN2"].MOP_EXPANSION.PROPERTIES.CLEANGENIUS_MODE.PIID;
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
            this.mopExpansionSiid,
            this.cleanGeniusModePiid,
            matchedPreset.value
        );
    }

}

module.exports = DreameAutomaticSubModeControlCapability;
