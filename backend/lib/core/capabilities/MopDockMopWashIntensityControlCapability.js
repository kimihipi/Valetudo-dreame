const NotImplementedError = require("../NotImplementedError");
const PresetSelectionCapability = require("./PresetSelectionCapability");

class MopDockMopWashIntensityControlCapability extends PresetSelectionCapability {
    async selectPreset(preset) {
        throw new NotImplementedError();
    }

    getType() {
        return MopDockMopWashIntensityControlCapability.TYPE;
    }
}

MopDockMopWashIntensityControlCapability.TYPE = "MopDockMopWashIntensityControlCapability";

module.exports = MopDockMopWashIntensityControlCapability;
