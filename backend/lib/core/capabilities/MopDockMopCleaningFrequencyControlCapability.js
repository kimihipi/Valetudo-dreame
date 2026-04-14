const NotImplementedError = require("../NotImplementedError");
const PresetSelectionCapability = require("./PresetSelectionCapability");

class MopDockMopCleaningFrequencyControlCapability extends PresetSelectionCapability {
    async selectPreset(preset) {
        throw new NotImplementedError();
    }

    getType() {
        return MopDockMopCleaningFrequencyControlCapability.TYPE;
    }
}

MopDockMopCleaningFrequencyControlCapability.TYPE = "MopDockMopCleaningFrequencyControlCapability";

module.exports = MopDockMopCleaningFrequencyControlCapability;
