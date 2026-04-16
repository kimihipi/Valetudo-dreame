const NotImplementedError = require("../NotImplementedError");
const PresetSelectionCapability = require("./PresetSelectionCapability");

/**
 * @template {import("../ValetudoRobot")} T
 * @extends PresetSelectionCapability<T>
 */
class MopDockDetergentControlCapability extends PresetSelectionCapability {
    /**
     * @param {string} preset
     * @returns {Promise<void>}
     */
    async selectPreset(preset) {
        throw new NotImplementedError();
    }

    getType() {
        return MopDockDetergentControlCapability.TYPE;
    }
}

MopDockDetergentControlCapability.TYPE = "MopDockDetergentControlCapability";

module.exports = MopDockDetergentControlCapability;
