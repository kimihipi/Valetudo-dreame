const SimpleToggleCapability = require("./SimpleToggleCapability");

/**
 * Control whether or not the robot should store multiple maps
 *
 * @template {import("../ValetudoRobot")} T
 * @extends SimpleToggleCapability<T>
 */
class MultipleMapControlCapability extends SimpleToggleCapability {
    getType() {
        return MultipleMapControlCapability.TYPE;
    }
}

MultipleMapControlCapability.TYPE = "MultipleMapControlCapability";

module.exports = MultipleMapControlCapability;
