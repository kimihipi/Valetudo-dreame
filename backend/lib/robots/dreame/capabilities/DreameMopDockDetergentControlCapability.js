const DreameMiotServices = require("../DreameMiotServices");
const MopDockDetergentControlCapability = require("../../../core/capabilities/MopDockDetergentControlCapability");

/**
 * @extends MopDockDetergentControlCapability<import("../DreameValetudoRobot")>
 */
class DreameMopDockDetergentControlCapability extends MopDockDetergentControlCapability {
    constructor(options) {
        super(options);
        this.siid = DreameMiotServices["GEN2"].VACUUM_2.SIID;
        this.piid = DreameMiotServices["GEN2"].VACUUM_2.PROPERTIES.MOP_DOCK_DETERGENT.PIID;
    }

    async selectPreset(preset) {
        const matchedPreset = this.presets.find(p => p.name === preset);
        if (!matchedPreset) {
            throw new Error("Invalid Preset");
        }

        if (preset === "missing_cartridge") {
            throw new Error("This informational state is not user-selectable");
        }

        return this.robot.miotHelper.writeProperty(this.siid, this.piid, matchedPreset.value);
    }
}

module.exports = DreameMopDockDetergentControlCapability;
