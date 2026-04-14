const Capability = require("./Capability");
const NotImplementedError = require("../NotImplementedError");

const ValetudoVirtualThresholds = require("../../entities/core/ValetudoVirtualThresholds");

const entities = require("../../entities");

/**
 * @template {import("../ValetudoRobot")} T
 * @extends Capability<T>
 */
class CombinedVirtualThresholdsCapability extends Capability {
    /**
     * @returns {Promise<import("../../entities/core/ValetudoVirtualThresholds")>}
     */
    async getVirtualThresholds() {
        const passableThresholds = [];
        const impassableThresholds = [];
        const ramps = [];

        this.robot.state.map.entities.filter(e => {
            return e instanceof entities.map.LineMapEntity && (
                e.type === entities.map.LineMapEntity.TYPE.PASSABLE_THRESHOLD ||
                e.type === entities.map.LineMapEntity.TYPE.IMPASSABLE_THRESHOLD
            );
        }).forEach(line => {
            const entry = {
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
            };

            switch (line.type) {
                case entities.map.LineMapEntity.TYPE.PASSABLE_THRESHOLD:
                    passableThresholds.push(entry);
                    break;
                case entities.map.LineMapEntity.TYPE.IMPASSABLE_THRESHOLD:
                    impassableThresholds.push(entry);
                    break;
            }
        });

        this.robot.state.map.entities.filter(e => {
            return e instanceof entities.map.PolygonMapEntity &&
                e.type === entities.map.PolygonMapEntity.TYPE.RAMP;
        }).forEach(polygon => {
            ramps.push({
                points: {
                    pA: {
                        x: polygon.points[0],
                        y: polygon.points[1]
                    },
                    pC: {
                        x: polygon.points[4],
                        y: polygon.points[5]
                    }
                },
                direction: polygon.metaData?.direction ?? 0
            });
        });

        return new ValetudoVirtualThresholds({
            passableThresholds: passableThresholds,
            impassableThresholds: impassableThresholds,
            ramps: ramps
        });
    }

    /**
     *
     * @param {import("../../entities/core/ValetudoVirtualThresholds")} virtualThresholds
     * @returns {Promise<void>}
     */
    async setVirtualThresholds(virtualThresholds) {
        throw new NotImplementedError();
    }

    getType() {
        return CombinedVirtualThresholdsCapability.TYPE;
    }
}

CombinedVirtualThresholdsCapability.TYPE = "CombinedVirtualThresholdsCapability";

module.exports = CombinedVirtualThresholdsCapability;
