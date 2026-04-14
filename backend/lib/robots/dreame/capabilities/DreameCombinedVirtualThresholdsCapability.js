/**
 * @typedef {import("../../../entities/core/ValetudoVirtualThresholds")} ValetudoVirtualThresholds
 */

const CombinedVirtualThresholdsCapability = require("../../../core/capabilities/CombinedVirtualThresholdsCapability");
const DreameMapParser = require("../DreameMapParser");
const RobotFirmwareError = require("../../../core/RobotFirmwareError");

/**
 * @extends CombinedVirtualThresholdsCapability<import("../DreameValetudoRobot")>
 */
class DreameCombinedVirtualThresholdsCapability extends CombinedVirtualThresholdsCapability {
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
     * @param {ValetudoVirtualThresholds} virtualThresholds
     * @returns {Promise<void>}
     */
    async setVirtualThresholds(virtualThresholds) {
        const dreamePayload = {
            vwsl: [],
            npthrsd: [],
            ramp: []
        };

        virtualThresholds.passableThresholds.forEach(threshold => {
            const pA = DreameMapParser.CONVERT_TO_DREAME_COORDINATES(threshold.points.pA.x, threshold.points.pA.y);
            const pB = DreameMapParser.CONVERT_TO_DREAME_COORDINATES(threshold.points.pB.x, threshold.points.pB.y);

            dreamePayload.vwsl.push([
                pA.x,
                pA.y,
                pB.x,
                pB.y
            ]);
        });

        virtualThresholds.impassableThresholds.forEach(threshold => {
            const pA = DreameMapParser.CONVERT_TO_DREAME_COORDINATES(threshold.points.pA.x, threshold.points.pA.y);
            const pB = DreameMapParser.CONVERT_TO_DREAME_COORDINATES(threshold.points.pB.x, threshold.points.pB.y);

            dreamePayload.npthrsd.push([
                pA.x,
                pA.y,
                pB.x,
                pB.y
            ]);
        });

        virtualThresholds.ramps.forEach(ramp => {
            const pA = DreameMapParser.CONVERT_TO_DREAME_COORDINATES(ramp.points.pA.x, ramp.points.pA.y);
            const pC = DreameMapParser.CONVERT_TO_DREAME_COORDINATES(ramp.points.pC.x, ramp.points.pC.y);

            dreamePayload.ramp.push([
                pA.x,
                pA.y,
                pC.x,
                pC.y,
                ramp.direction ?? 0
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
                        value: JSON.stringify({vws: dreamePayload})
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
                    throw new RobotFirmwareError("Cannot save temporary virtual thresholds. A persistent map exists.");
                case 11:
                    throw new RobotFirmwareError("Cannot save virtual thresholds. No persistent map exists. Let the robot do a full clean before saving thresholds.");
                default:
                    throw new RobotFirmwareError("Got error " + res.out[0].value + " while saving virtual thresholds.");
            }
        }
    }
}

module.exports = DreameCombinedVirtualThresholdsCapability;
