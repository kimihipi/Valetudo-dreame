const Capability = require("./Capability");
const NotImplementedError = require("../NotImplementedError");

/**
 * @template {import("../ValetudoRobot")} T
 * @extends Capability<T>
 */
class MapSegmentHideCapability extends Capability {
    /**
     * @param {Array<string>} segmentIds
     * @returns {Promise<void>}
     */
    async setHiddenSegments(segmentIds) {
        throw new NotImplementedError();
    }

    getType() {
        return MapSegmentHideCapability.TYPE;
    }
}

MapSegmentHideCapability.TYPE = "MapSegmentHideCapability";

module.exports = MapSegmentHideCapability;
