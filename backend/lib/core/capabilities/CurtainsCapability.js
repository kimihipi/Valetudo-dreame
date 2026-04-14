const Capability = require("./Capability");
const NotImplementedError = require("../NotImplementedError");

const ValetudoCurtains = require("../../entities/core/ValetudoCurtains");

const entities = require("../../entities");

/**
 * @template {import("../ValetudoRobot")} T
 * @extends Capability<T>
 */
class CurtainsCapability extends Capability {
    /**
     * @returns {Promise<import("../../entities/core/ValetudoCurtains")>}
     */
    async getCurtains() {
        const curtains = [];

        this.robot.state.map.entities.filter(e => {
            return e instanceof entities.map.LineMapEntity &&
                e.type === entities.map.LineMapEntity.TYPE.CURTAIN;
        }).forEach(line => {
            curtains.push({
                points: {
                    pA: {
                        x: line.points[0],
                        y: line.points[1]
                    },
                    pB: {
                        x: line.points[2],
                        y: line.points[3]
                    }
                }
            });
        });

        return new ValetudoCurtains({
            curtains: curtains
        });
    }

    /**
     *
     * @param {import("../../entities/core/ValetudoCurtains")} curtains
     * @returns {Promise<void>}
     */
    async setCurtains(curtains) {
        throw new NotImplementedError();
    }

    getType() {
        return CurtainsCapability.TYPE;
    }
}

CurtainsCapability.TYPE = "CurtainsCapability";

module.exports = CurtainsCapability;
