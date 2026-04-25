const CleanRouteControlCapability = require("../../../core/capabilities/CleanRouteControlCapability");

/**
 * @extends CleanRouteControlCapability<import("../RoborockValetudoRobot")>
 */
class RoborockCleanRouteControlCapability extends CleanRouteControlCapability {

    async getRoute() {
        const res = await this.robot.sendCommand("get_mop_mode", [], {});

        return res?.[0] === 301 ? RoborockCleanRouteControlCapability.ROUTE.DEEP : RoborockCleanRouteControlCapability.ROUTE.ROUTINE;
    }

    async setRoute(newRoute) {
        await this.robot.sendCommand(
            "set_mop_mode",
            [
                newRoute === RoborockCleanRouteControlCapability.ROUTE.DEEP ? 301 : 300
            ],
            {}
        );
    }

    getProperties() {
        return {
            supportedRoutes: [
                RoborockCleanRouteControlCapability.ROUTE.ROUTINE,
                RoborockCleanRouteControlCapability.ROUTE.DEEP
            ],
            mopOnly: [
                RoborockCleanRouteControlCapability.ROUTE.DEEP
            ],
            oneTime: []
        };
    }
}

module.exports = RoborockCleanRouteControlCapability;
