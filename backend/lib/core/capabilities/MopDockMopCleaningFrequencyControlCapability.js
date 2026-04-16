const NotImplementedError = require("../NotImplementedError");
const PresetSelectionCapability = require("./PresetSelectionCapability");

/**
 * @template {import("../ValetudoRobot")} T
 * @extends PresetSelectionCapability<T>
 */
class MopDockMopCleaningFrequencyControlCapability extends PresetSelectionCapability {
    /**
     * @param {string} preset
     * @returns {Promise<void>}
     */
    async selectPreset(preset) {
        throw new NotImplementedError();
    }

    getType() {
        return MopDockMopCleaningFrequencyControlCapability.TYPE;
    }
}

MopDockMopCleaningFrequencyControlCapability.TYPE = "MopDockMopCleaningFrequencyControlCapability";

module.exports = MopDockMopCleaningFrequencyControlCapability;
