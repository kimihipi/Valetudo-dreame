/**
 * @typedef {import("../../../entities/core/ValetudoCurtains")} ValetudoCurtains
 */

const CurtainsCapability = require("../../../core/capabilities/CurtainsCapability");
const entities = require("../../../entities");
const Logger = require("../../../Logger");

/**
 * @extends CurtainsCapability<import("../MockValetudoRobot")>
 */
class MockCurtainsCapability extends CurtainsCapability {
    /**
     *
     * @param {ValetudoCurtains} curtains
     * @returns {Promise<void>}
     */
    async setCurtains(curtains) {
        Logger.info("Received curtains", curtains);

        // Remove existing curtain entities from the map
        this.robot.state.map.entities = this.robot.state.map.entities.filter(e => {
            if (e instanceof entities.map.LineMapEntity) {
                return e.type !== entities.map.LineMapEntity.TYPE.CURTAIN;
            }
            return true;
        });

        curtains.curtains.forEach(curtain => {
            this.robot.state.map.entities.push(new entities.map.LineMapEntity({
                points: [
                    curtain.points.pA.x, curtain.points.pA.y,
                    curtain.points.pB.x, curtain.points.pB.y,
                ],
                type: entities.map.LineMapEntity.TYPE.CURTAIN,
            }));
        });
    }
}

module.exports = MockCurtainsCapability;
