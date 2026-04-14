const DreameMiotServices = require("../DreameMiotServices");
const MopDockMopWashIntensityControlCapability = require("../../../core/capabilities/MopDockMopWashIntensityControlCapability");

/**
 * @extends MopDockMopWashIntensityControlCapability<import("../DreameValetudoRobot")>
 */
class DreameMopDockMopWashIntensityControlCapability extends MopDockMopWashIntensityControlCapability {
    constructor(options) {
        super(options);
        this.siid = DreameMiotServices["GEN2"].VACUUM_2.SIID;
        this.piid = DreameMiotServices["GEN2"].VACUUM_2.PROPERTIES.MOP_DOCK_WATER_USAGE.PIID;
    }

    async selectPreset(preset) {
        const matchedPreset = this.presets.find(p => p.name === preset);
        if (!matchedPreset) {
            throw new Error("Invalid Preset");
        }

        return this.robot.miotHelper.writeProperty(this.siid, this.piid, matchedPreset.value);
    }
}

module.exports = DreameMopDockMopWashIntensityControlCapability;
