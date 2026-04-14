/**
 * @typedef {import("../../../entities/core/ValetudoCurtains")} ValetudoCurtains
 */

const CurtainsCapability = require("../../../core/capabilities/CurtainsCapability");
const DreameMapParser = require("../DreameMapParser");
const RobotFirmwareError = require("../../../core/RobotFirmwareError");

/**
 * @extends CurtainsCapability<import("../DreameValetudoRobot")>
 */
class DreameCurtainsCapability extends CurtainsCapability {
    /**
     *
     * @param {object} options
     * @param {import("../DreameValetudoRobot")} options.robot
     *
     * @param {object} options.miot_actions
     * @param {object} options.miot_actions.map_edit
     * @param {number} options.miot_actions.map_edit.siid
     * @param {number} options.miot_actions.map_edit.aiid
     *
     * @param {object} options.miot_properties
     * @param {object} options.miot_properties.mapDetails
     * @param {number} options.miot_properties.mapDetails.piid
     *
     * @param {object} options.miot_properties.actionResult
     * @param {number} options.miot_properties.actionResult.piid
     */
    constructor(options) {
        super(options);

        this.miot_actions = options.miot_actions;
        this.miot_properties = options.miot_properties;
    }

    /**
     *
     * @param {ValetudoCurtains} curtains
     * @returns {Promise<void>}
     */
    async setCurtains(curtains) {
        const dreamePayload = {
            line: []
        };

        curtains.curtains.forEach(curtain => {
            const pA = DreameMapParser.CONVERT_TO_DREAME_COORDINATES(curtain.points.pA.x, curtain.points.pA.y);
            const pB = DreameMapParser.CONVERT_TO_DREAME_COORDINATES(curtain.points.pB.x, curtain.points.pB.y);

            dreamePayload.line.push([
                pA.x,
                pA.y,
                pB.x,
                pB.y
            ]);
        });

        const res = await this.robot.sendCommand("action",
            {
                did: this.robot.deviceId,
                siid: this.miot_actions.map_edit.siid,
                aiid: this.miot_actions.map_edit.aiid,
                in: [
                    {
                        piid: this.miot_properties.mapDetails.piid,
                        value: JSON.stringify({curtain: dreamePayload})
                    }
                ]
            }
        );

        if (
            res && res.siid === this.miot_actions.map_edit.siid &&
            res.aiid === this.miot_actions.map_edit.aiid &&
            Array.isArray(res.out) && res.out.length === 1 &&
            res.out[0].piid === this.miot_properties.actionResult.piid
        ) {
            switch (res.out[0].value) {
                case 0:
                    this.robot.pollMap();
                    return;
                case 10:
                    throw new RobotFirmwareError("Cannot save temporary curtains. A persistent map exists.");
                case 11:
                    throw new RobotFirmwareError("Cannot save curtains. No persistent map exists. Let the robot do a full clean before saving curtains.");
                default:
                    throw new RobotFirmwareError("Got error " + res.out[0].value + " while saving curtains.");
            }
        }
    }
}

module.exports = DreameCurtainsCapability;
