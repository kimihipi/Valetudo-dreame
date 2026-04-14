const SimpleToggleCapability = require("./SimpleToggleCapability");

class SuctionBoostControlCapability extends SimpleToggleCapability {
    getType() {
        return SuctionBoostControlCapability.TYPE;
    }
}

SuctionBoostControlCapability.TYPE = "SuctionBoostControlCapability";

module.exports = SuctionBoostControlCapability;
