const SimpleToggleCapability = require("./SimpleToggleCapability");

/**
 * @template {import("../ValetudoRobot")} T
 * @extends SimpleToggleCapability<T>
 */
class MopDockSmartMopWashingControlCapability extends SimpleToggleCapability {
    getType() {
        return MopDockSmartMopWashingControlCapability.TYPE;
    }
}

MopDockSmartMopWashingControlCapability.TYPE = "MopDockSmartMopWashingControlCapability";

module.exports = MopDockSmartMopWashingControlCapability;
