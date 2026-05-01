const Capability = require("./Capability");
const NotImplementedError = require("../NotImplementedError");

const ValetudoCarpetZones = require("../../entities/core/ValetudoCarpetZones");

const entities = require("../../entities");

/**
 * @template {import("../ValetudoRobot")} T
 * @extends Capability<T>
 */
class CarpetZonesCapability extends Capability {
    /**
     * Returns rectangular carpet zones from the map (8-point polygons only;
     * irregular sensor-detected carpet polygons are excluded).
     *
     * @returns {Promise<import("../../entities/core/ValetudoCarpetZones")>}
     */
    async getCarpetZones() {
        const zones = [];

        this.robot.state.map.entities.filter(e => {
            return e instanceof entities.map.PolygonMapEntity &&
                e.type === entities.map.PolygonMapEntity.TYPE.CARPET &&
                e.points.length === 8;
        }).forEach(polygon => {
            zones.push({
                points: {
                    pA: {x: polygon.points[0], y: polygon.points[1]},
                    pB: {x: polygon.points[2], y: polygon.points[3]},
                    pC: {x: polygon.points[4], y: polygon.points[5]},
                    pD: {x: polygon.points[6], y: polygon.points[7]}
                }
            });
        });

        return new ValetudoCarpetZones({zones: zones});
    }

    /**
     * @param {import("../../entities/core/ValetudoCarpetZones")} carpetZones
     * @returns {Promise<void>}
     */
    async setCarpetZones(carpetZones) {
        throw new NotImplementedError();
    }

    getType() {
        return CarpetZonesCapability.TYPE;
    }
}

CarpetZonesCapability.TYPE = "CarpetZonesCapability";

module.exports = CarpetZonesCapability;
