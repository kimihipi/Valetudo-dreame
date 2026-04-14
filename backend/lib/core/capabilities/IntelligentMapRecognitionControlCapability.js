const SimpleToggleCapability = require("./SimpleToggleCapability");

/**
 * Control whether or not the robot should automatically switch map based on its location
 *
 * @template {import("../ValetudoRobot")} T
 * @extends SimpleToggleCapability<T>
 */
class IntelligentMapRecognitionControlCapability extends SimpleToggleCapability {
    getType() {
        return IntelligentMapRecognitionControlCapability.TYPE;
    }
}

IntelligentMapRecognitionControlCapability.TYPE = "IntelligentMapRecognitionControlCapability";

module.exports = IntelligentMapRecognitionControlCapability;
