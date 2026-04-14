const entities = require("../../../entities");
const MopDockDetergentControlCapability = require("../../../core/capabilities/MopDockDetergentControlCapability");
const ValetudoSelectionPreset = require("../../../entities/core/ValetudoSelectionPreset");
const stateAttrs = entities.state.attributes;

/**
 * @extends MopDockDetergentControlCapability<import("../MockValetudoRobot")>
 */
class MockMopDockDetergentControlCapability extends MopDockDetergentControlCapability {
    /**
     * @param {object} options
     * @param {import("../MockValetudoRobot")} options.robot
     */
    constructor(options) {
        let presets = [
            new ValetudoSelectionPreset({name: "on", value: 1}),
            new ValetudoSelectionPreset({name: "off", value: 0}),
            new ValetudoSelectionPreset({name: "missing_cartridge", value: 2}),
        ];
        super({
            robot: options.robot,
            presets: presets
        });

        this.StateAttr = new stateAttrs.PresetSelectionStateAttribute({
            type: stateAttrs.PresetSelectionStateAttribute.TYPE.MOP_DOCK_DETERGENT,
            value: "on"
        });

        this.robot.state.upsertFirstMatchingAttribute(this.StateAttr);
    }

    /**
     * @param {string} preset
     * @returns {Promise<void>}
     */
    async selectPreset(preset) {
        if (preset === "missing_cartridge") {
            throw new Error("Cannot select missing_cartridge - cartridge is missing");
        }

        const matchedPreset = this.presets.find(p => {
            return p.name === preset;
        });

        if (matchedPreset) {
            this.StateAttr.value = matchedPreset.name;
        } else {
            throw new Error("Invalid Preset");
        }
    }
}

module.exports = MockMopDockDetergentControlCapability;
