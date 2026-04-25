const AutomaticControlCapability = require("../../../core/capabilities/AutomaticControlCapability");
const entities = require("../../../entities");
const ValetudoSelectionPreset = require("../../../entities/core/ValetudoSelectionPreset");
const stateAttrs = entities.state.attributes;

/**
 * @extends AutomaticControlCapability<import("../MockValetudoRobot")>
 */
class MockAutomaticControlCapability extends AutomaticControlCapability {
    /**
     * @param {object} options
     * @param {import("../MockValetudoRobot")} options.robot
     */
    constructor(options) {
        const presets = [
            new ValetudoSelectionPreset({name: "off", value: 0}),
            new ValetudoSelectionPreset({name: "routine", value: 1}),
            new ValetudoSelectionPreset({name: "deep", value: 2}),
        ];

        super({robot: options.robot, presets: presets});

        this.StateAttr = new stateAttrs.PresetSelectionStateAttribute({
            type: stateAttrs.PresetSelectionStateAttribute.TYPE.AUTOMATIC_CONTROL,
            value: "off"
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

module.exports = MockAutomaticControlCapability;
