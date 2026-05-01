/**
 * @typedef {import("../../../entities/core/ValetudoCarpetZones")} ValetudoCarpetZones
 */

const CarpetZonesCapability = require("../../../core/capabilities/CarpetZonesCapability");
const DreameMapParser = require("../DreameMapParser");
const RobotFirmwareError = require("../../../core/RobotFirmwareError");

/**
 * @extends CarpetZonesCapability<import("../DreameValetudoRobot")>
 */
class DreameCarpetZonesCapability extends CarpetZonesCapability {
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
     * @param {ValetudoCarpetZones} carpetZones
     * @returns {Promise<void>}
     */
    async setCarpetZones(carpetZones) {
        const dreamePayload = {
            addcpt: []
        };

        carpetZones.zones.forEach(zone => {
            const pA = DreameMapParser.CONVERT_TO_DREAME_COORDINATES(zone.points.pA.x, zone.points.pA.y);
            const pC = DreameMapParser.CONVERT_TO_DREAME_COORDINATES(zone.points.pC.x, zone.points.pC.y);

            dreamePayload.addcpt.push([
                pA.x,
                pA.y,
                pC.x,
                pC.y
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
                        value: JSON.stringify({vw: dreamePayload})
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
                    throw new RobotFirmwareError("Cannot save temporary carpet zones. A persistent map exists.");
                case 11:
                    throw new RobotFirmwareError("Cannot save carpet zones. No persistent map exists. Let the robot do a full clean before saving carpet zones.");
                default:
                    throw new RobotFirmwareError("Got error " + res.out[0].value + " while saving carpet zones.");
            }
        }
    }
}

module.exports = DreameCarpetZonesCapability;
