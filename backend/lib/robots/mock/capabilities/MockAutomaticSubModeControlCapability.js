const AutomaticSubModeControlCapability = require("../../../core/capabilities/AutomaticSubModeControlCapability");
const entities = require("../../../entities");
const ValetudoSelectionPreset = require("../../../entities/core/ValetudoSelectionPreset");
const stateAttrs = entities.state.attributes;

/**
 * @extends AutomaticSubModeControlCapability<import("../MockValetudoRobot")>
 */
class MockAutomaticSubModeControlCapability extends AutomaticSubModeControlCapability {
    /**
     * @param {object} options
     * @param {import("../MockValetudoRobot")} options.robot
     */
    constructor(options) {
        const presets = [
            new ValetudoSelectionPreset({name: "vacuum_and_mop", value: 2}),
            new ValetudoSelectionPreset({name: "vacuum_then_mop", value: 3}),
        ];

        super({robot: options.robot, presets: presets});

        this.StateAttr = new stateAttrs.PresetSelectionStateAttribute({
            type: stateAttrs.PresetSelectionStateAttribute.TYPE.AUTOMATIC_SUB_MODE,
            value: "vacuum_and_mop"
        });

        this.robot.state.upsertFirstMatchingAttribute(this.StateAttr);
    }

    /**
     * @param {string} preset
     * @returns {Promise<void>}
     */
    async selectPreset(preset) {
        const matchedPreset = this.presets.find(p => p.name === preset);

        if (matchedPreset) {
            this.StateAttr.value = matchedPreset.name;
        } else {
            throw new Error("Invalid Preset");
        }
    }
}

module.exports = MockAutomaticSubModeControlCapability;
