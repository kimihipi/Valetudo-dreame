const SimpleToggleCapability = require("./SimpleToggleCapability");

/**
 * @template {import("../ValetudoRobot")} T
 * @extends SimpleToggleCapability<T>
 */
class SuctionBoostControlCapability extends SimpleToggleCapability {
    getType() {
        return SuctionBoostControlCapability.TYPE;
    }
}

SuctionBoostControlCapability.TYPE = "SuctionBoostControlCapability";

module.exports = SuctionBoostControlCapability;
