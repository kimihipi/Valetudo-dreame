const CleanRouteControlCapability = require("../../../core/capabilities/CleanRouteControlCapability");

/**
 * @extends CleanRouteControlCapability<import("../MockValetudoRobot")>
 */
class MockCleanRouteControlCapability extends CleanRouteControlCapability {
    /**
     * @param {object} options
     * @param {import("../MockValetudoRobot")} options.robot
     */
    constructor(options) {
        super(options);

        this.currentRoute = CleanRouteControlCapability.ROUTE.ROUTINE;
    }

    async getRoute() {
        return this.currentRoute;
    }

    async setRoute(newRoute) {
        this.currentRoute = newRoute;
    }

    getProperties() {
        return {
            supportedRoutes: Object.values(CleanRouteControlCapability.ROUTE),
            mopOnly: [],
            oneTime: []
        };
    }
}

module.exports = MockCleanRouteControlCapability;
