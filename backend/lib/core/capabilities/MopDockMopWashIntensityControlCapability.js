const NotImplementedError = require("../NotImplementedError");
const PresetSelectionCapability = require("./PresetSelectionCapability");

/**
 * @template {import("../ValetudoRobot")} T
 * @extends PresetSelectionCapability<T>
 */
class MopDockMopWashIntensityControlCapability extends PresetSelectionCapability {
    /**
     * @param {string} preset
     * @returns {Promise<void>}
     */
    async selectPreset(preset) {
        throw new NotImplementedError();
    }

    getType() {
        return MopDockMopWashIntensityControlCapability.TYPE;
    }
}

MopDockMopWashIntensityControlCapability.TYPE = "MopDockMopWashIntensityControlCapability";

module.exports = MopDockMopWashIntensityControlCapability;
