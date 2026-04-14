const entities = require("../../../entities");
const MopDockMopWashIntensityControlCapability = require("../../../core/capabilities/MopDockMopWashIntensityControlCapability");
const ValetudoSelectionPreset = require("../../../entities/core/ValetudoSelectionPreset");
const stateAttrs = entities.state.attributes;

/**
 * @extends MopDockMopWashIntensityControlCapability<import("../MockValetudoRobot")>
 */
class MockMopDockMopWashIntensityControlCapability extends MopDockMopWashIntensityControlCapability {
    /**
     * @param {object} options
     * @param {import("../MockValetudoRobot")} options.robot
     */
    constructor(options) {
        let presets = [
            new ValetudoSelectionPreset({name: "low", value: 0}),
            new ValetudoSelectionPreset({name: "medium", value: 1}),
            new ValetudoSelectionPreset({name: "high", value: 2}),
        ];
        super({
            robot: options.robot,
            presets: presets
        });

        this.StateAttr = new stateAttrs.PresetSelectionStateAttribute({
            type: stateAttrs.PresetSelectionStateAttribute.TYPE.MOP_DOCK_MOP_WASH_INTENSITY,
            value: "medium"
        });

        this.robot.state.upsertFirstMatchingAttribute(this.StateAttr);
    }

    /**
     * @param {string} preset
     * @returns {Promise<void>}
     */
    async selectPreset(preset) {
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

module.exports = MockMopDockMopWashIntensityControlCapability;
