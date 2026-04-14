const entities = require("../../../entities");
const MopDockMopCleaningFrequencyControlCapability = require("../../../core/capabilities/MopDockMopCleaningFrequencyControlCapability");
const ValetudoSelectionPreset = require("../../../entities/core/ValetudoSelectionPreset");
const stateAttrs = entities.state.attributes;

/**
 * @extends MopDockMopCleaningFrequencyControlCapability<import("../MockValetudoRobot")>
 */
class MockMopDockMopCleaningFrequencyControlCapability extends MopDockMopCleaningFrequencyControlCapability {
    /**
     * @param {object} options
     * @param {import("../MockValetudoRobot")} options.robot
     */
    constructor(options) {
        let presets = [
            new ValetudoSelectionPreset({name: "every_segment", value: 0}),
            new ValetudoSelectionPreset({name: "every_5_m2", value: 5}),
            new ValetudoSelectionPreset({name: "every_10_m2", value: 10}),
            new ValetudoSelectionPreset({name: "every_15_m2", value: 15}),
            new ValetudoSelectionPreset({name: "every_20_m2", value: 20}),
            new ValetudoSelectionPreset({name: "every_25_m2", value: 25}),
        ];
        super({
            robot: options.robot,
            presets: presets
        });

        this.StateAttr = new stateAttrs.PresetSelectionStateAttribute({
            type: stateAttrs.PresetSelectionStateAttribute.TYPE.MOP_DOCK_MOP_CLEANING_FREQUENCY,
            value: "every_segment"
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

module.exports = MockMopDockMopCleaningFrequencyControlCapability;
