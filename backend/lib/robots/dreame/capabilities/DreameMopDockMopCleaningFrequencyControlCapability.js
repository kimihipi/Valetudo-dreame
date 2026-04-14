const DreameUtils = require("../DreameUtils");
const DreameMiotServices = require("../DreameMiotServices");
const MopDockMopCleaningFrequencyControlCapability = require("../../../core/capabilities/MopDockMopCleaningFrequencyControlCapability");

/**
 * @extends MopDockMopCleaningFrequencyControlCapability<import("../DreameValetudoRobot")>
 */
class DreameMopDockMopCleaningFrequencyControlCapability extends MopDockMopCleaningFrequencyControlCapability {
    constructor(options) {
        super(options);
        this.siid = DreameMiotServices["GEN2"].VACUUM_2.SIID;
        this.piid = DreameMiotServices["GEN2"].VACUUM_2.PROPERTIES.MOP_DOCK_SETTINGS.PIID;
    }

    async selectPreset(preset) {
        const matchedPreset = this.presets.find(p => p.name === preset);
        if (!matchedPreset) {
            throw new Error("Invalid Preset");
        }

        const res = await this.robot.miotHelper.readProperty(this.siid, this.piid);
        const current = DreameUtils.DESERIALIZE_MOP_DOCK_SETTINGS(res);

        return this.robot.miotHelper.writeProperty(
            this.siid,
            this.piid,
            DreameUtils.SERIALIZE_MOP_DOCK_SETTINGS({
                waterGrade: current.waterGrade,
                padCleaningFrequency: matchedPreset.value,
                operationMode: current.operationMode
            })
        );
    }
}

module.exports = DreameMopDockMopCleaningFrequencyControlCapability;
