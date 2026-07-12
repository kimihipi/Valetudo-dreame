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
     * @param {boolean} [options.carpetIdsSupported]
     */
    constructor(options) {
        super(options);

        this.miot_actions = options.miot_actions;
        this.miot_properties = options.miot_properties;
        this.carpetIdsSupported = options.carpetIdsSupported ?? false;
    }

    /**
     * @param {ValetudoCarpetZones} carpetZones
     * @returns {Promise<void>}
     */
    async setCarpetZones(carpetZones) {
        const addcpt = [];
        const existingCarpetIds = new Map();
        const usedCarpetIds = new Set();

        if (this.carpetIdsSupported) {
            (this.robot.state.map?.entities ?? []).filter(entity => {
                return entity.type === "carpet" && entity.points.length === 8 && entity.metaData?.id !== undefined;
            }).forEach(entity => {
                const id = parseInt(entity.metaData.id);

                if (!Number.isNaN(id) && id >= 0) {
                    existingCarpetIds.set(DreameCarpetZonesCapability.GET_ZONE_KEY(
                        entity.points[0], entity.points[1], entity.points[4], entity.points[5]
                    ), id);
                    usedCarpetIds.add(id);
                }
            });
        }

        carpetZones.zones.forEach(zone => {
            const pA = DreameMapParser.CONVERT_TO_DREAME_COORDINATES(zone.points.pA.x, zone.points.pA.y);
            const pC = DreameMapParser.CONVERT_TO_DREAME_COORDINATES(zone.points.pC.x, zone.points.pC.y);

            const carpet = [
                pA.x,
                pA.y,
                pC.x,
                pC.y
            ];

            if (this.carpetIdsSupported) {
                const zoneKey = DreameCarpetZonesCapability.GET_ZONE_KEY(
                    zone.points.pA.x, zone.points.pA.y, zone.points.pC.x, zone.points.pC.y
                );
                let carpetId = existingCarpetIds.get(zoneKey);

                if (carpetId === undefined) {
                    carpetId = 1;
                    while (usedCarpetIds.has(carpetId)) {
                        carpetId++;
                    }
                }

                usedCarpetIds.add(carpetId);
                carpet.push(carpetId);
            }

            addcpt.push(carpet);
        });

        // Firmwares with carpet ID support expect the newer cpt wrapper.
        // Older ones only understand the vw one.
        const dreamePayload = this.carpetIdsSupported ?
            {cpt: {addcpt: addcpt, nocpt: []}} :
            {vw: {addcpt: addcpt}};

        const res = await this.robot.sendCommand("action",
            {
                did: this.robot.deviceId,
                siid: this.miot_actions.map_edit.siid,
                aiid: this.miot_actions.map_edit.aiid,
                in: [
                    {
                        piid: this.miot_properties.mapDetails.piid,
                        value: JSON.stringify(dreamePayload)
                    }
                ]
            }
        );

        if (
            !res || res.siid !== this.miot_actions.map_edit.siid ||
            res.aiid !== this.miot_actions.map_edit.aiid ||
            !Array.isArray(res.out) || res.out.length !== 1 ||
            res.out[0].piid !== this.miot_properties.actionResult.piid
        ) {
            throw new RobotFirmwareError("Unexpected response while saving carpet zones: " + JSON.stringify(res));
        }

        switch (res.out[0].value) {
            case 0:
                break;
            case 10:
                throw new RobotFirmwareError("Cannot save temporary carpet zones. A persistent map exists.");
            case 11:
                throw new RobotFirmwareError("Cannot save carpet zones. No persistent map exists. Let the robot do a full clean before saving carpet zones.");
            default:
                throw new RobotFirmwareError("Got error " + res.out[0].value + " while saving carpet zones.");
        }

        // Map edits are applied asynchronously by the firmware. Polling immediately can
        // return the pre-edit map and make the frontend replace the user's changes with
        // stale carpet data. Give the firmware time to persist the edit first.
        await new Promise(resolve => setTimeout(resolve, 1000));

        this.robot.pollMap();
    }

    /**
     * @private
     * @param {number} x1
     * @param {number} y1
     * @param {number} x2
     * @param {number} y2
     * @returns {string}
     */
    static GET_ZONE_KEY(x1, y1, x2, y2) {
        return [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)].join(":");
    }
}

module.exports = DreameCarpetZonesCapability;
