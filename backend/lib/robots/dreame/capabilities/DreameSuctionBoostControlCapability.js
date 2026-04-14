const DreameMiotServices = require("../DreameMiotServices");
const DreameUtils = require("../DreameUtils");
const SuctionBoostControlCapability = require("../../../core/capabilities/SuctionBoostControlCapability");

/**
 * @extends SuctionBoostControlCapability<import("../DreameValetudoRobot")>
 */
class DreameSuctionBoostControlCapability extends SuctionBoostControlCapability {
    constructor(options) {
        super(options);
        this.siid = DreameMiotServices["GEN2"].VACUUM_2.SIID;
        this.piid = DreameMiotServices["GEN2"].VACUUM_2.PROPERTIES.MISC_TUNABLES.PIID;
    }

    async isEnabled() {
        const res = await this.robot.miotHelper.readProperty(this.siid, this.piid);
        const deserializedResponse = DreameUtils.DESERIALIZE_MISC_TUNABLES(res);

        return deserializedResponse.SuctionMax === 1;
    }

    async enable() {
        return this.robot.miotHelper.writeProperty(
            this.siid,
            this.piid,
            DreameUtils.SERIALIZE_MISC_TUNABLES_SINGLE_TUNABLE({
                SuctionMax: 1
            })
        );
    }

    async disable() {
        return this.robot.miotHelper.writeProperty(
            this.siid,
            this.piid,
            DreameUtils.SERIALIZE_MISC_TUNABLES_SINGLE_TUNABLE({
                SuctionMax: 0
            })
        );
    }
}

module.exports = DreameSuctionBoostControlCapability;
