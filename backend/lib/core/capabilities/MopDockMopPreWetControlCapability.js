const SimpleToggleCapability = require("./SimpleToggleCapability");

/**
 * @template {import("../ValetudoRobot")} T
 * @extends SimpleToggleCapability<T>
 */
class MopDockMopPreWetControlCapability extends SimpleToggleCapability {
    getType() {
        return MopDockMopPreWetControlCapability.TYPE;
    }
}

MopDockMopPreWetControlCapability.TYPE = "MopDockMopPreWetControlCapability";

module.exports = MopDockMopPreWetControlCapability;
