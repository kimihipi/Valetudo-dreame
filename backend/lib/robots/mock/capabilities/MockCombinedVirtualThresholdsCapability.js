/**
 * @typedef {import("../../../entities/core/ValetudoVirtualThresholds")} ValetudoVirtualThresholds
 */

const CombinedVirtualThresholdsCapability = require("../../../core/capabilities/CombinedVirtualThresholdsCapability");
const entities = require("../../../entities");
const Logger = require("../../../Logger");

/**
 * @extends CombinedVirtualThresholdsCapability<import("../MockValetudoRobot")>
 */
class MockCombinedVirtualThresholdsCapability extends CombinedVirtualThresholdsCapability {
    /**
     *
     * @param {ValetudoVirtualThresholds} virtualThresholds
     * @returns {Promise<void>}
     */
    async setVirtualThresholds(virtualThresholds) {
        Logger.info("Received virtual thresholds", virtualThresholds);

        // Remove existing threshold/ramp entities from the map
        this.robot.state.map.entities = this.robot.state.map.entities.filter(e => {
            if (e instanceof entities.map.LineMapEntity) {
                return (
                    e.type !== entities.map.LineMapEntity.TYPE.PASSABLE_THRESHOLD &&
                    e.type !== entities.map.LineMapEntity.TYPE.IMPASSABLE_THRESHOLD
                );
            }
            if (e instanceof entities.map.PolygonMapEntity) {
                return e.type !== entities.map.PolygonMapEntity.TYPE.RAMP;
            }
            return true;
        });

        virtualThresholds.passableThresholds.forEach(threshold => {
            this.robot.state.map.entities.push(new entities.map.LineMapEntity({
                points: [
                    threshold.points.pA.x, threshold.points.pA.y,
                    threshold.points.pB.x, threshold.points.pB.y,
                ],
                type: entities.map.LineMapEntity.TYPE.PASSABLE_THRESHOLD,
            }));
        });

        virtualThresholds.impassableThresholds.forEach(threshold => {
            this.robot.state.map.entities.push(new entities.map.LineMapEntity({
                points: [
                    threshold.points.pA.x, threshold.points.pA.y,
                    threshold.points.pB.x, threshold.points.pB.y,
                ],
                type: entities.map.LineMapEntity.TYPE.IMPASSABLE_THRESHOLD,
            }));
        });

        virtualThresholds.ramps.forEach(ramp => {
            const x0 = ramp.points.pA.x;
            const y0 = ramp.points.pA.y;
            const x2 = ramp.points.pC.x;
            const y2 = ramp.points.pC.y;

            // Store axis-aligned bounding corners as a 4-point polygon (pA, pB, pC, pD)
            this.robot.state.map.entities.push(new entities.map.PolygonMapEntity({
                points: [
                    x0, y0,
                    x2, y0,
                    x2, y2,
                    x0, y2,
                ],
                type: entities.map.PolygonMapEntity.TYPE.RAMP,
                metaData: {
                    direction: ramp.direction,
                },
            }));
        });
    }
}

module.exports = MockCombinedVirtualThresholdsCapability;
