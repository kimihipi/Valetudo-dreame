const NotImplementedError = require("../NotImplementedError");
const PresetSelectionCapability = require("./PresetSelectionCapability");

class MopDockDetergentControlCapability extends PresetSelectionCapability {
    async selectPreset(preset) {
        throw new NotImplementedError();
    }

    getType() {
        return MopDockDetergentControlCapability.TYPE;
    }
}

MopDockDetergentControlCapability.TYPE = "MopDockDetergentControlCapability";

module.exports = MopDockDetergentControlCapability;
