const express = require("express");


const ValetudoRobot = require("../core/ValetudoRobot");

const CapabilitiesRouter = require("./CapabilitiesRouter");
const {SSEHub, SSEMiddleware} = require("./middlewares/sse");

class RobotRouter {
    /**
     *
     * @param {object} options
     * @param {import("../core/ValetudoRobot")} options.robot
     * @param {*} options.validator
     */
    constructor(options) {
        this.robot = options.robot;
        this.router = express.Router({mergeParams: true});

        this.validator = options.validator;

        /** @type {{timestamp: string, robotStatus: string, robotFlag: string, dockStatus: string|null, batteryLevel: number|null, batteryFlag: string|null}[]} */
        this.activityHistory = [];
        /** @type {string|null} */
        this.prevStatusKey = null;
        /** @type {ReturnType<typeof setTimeout>|null} */
        this.activityHistoryDebounceTimer = null;

        this.initRoutes();
        this.initSSE();
    }


    initRoutes() {
        this.router.get("/", (req, res) => {
            res.json({
                manufacturer: this.robot.getManufacturer(),
                modelName: this.robot.getModelName(),
                modelDetails: this.robot.getModelDetails(),
                implementation: this.robot.constructor.name
            });
        });

        this.router.get("/properties", (req, res) => {
            res.json(this.robot.getProperties());
        });

        this.router.get("/state", async (req, res) => {
            try {
                const polledState = await this.robot.pollState();

                res.json(polledState);
            } catch (err) {
                res.status(500).send(String(err));
            }
        });

        this.router.get("/state/attributes", async (req, res) => {
            try {
                const polledState = await this.robot.pollState();

                res.json(polledState.attributes);
            } catch (err) {
                res.status(500).send(String(err));
            }
        });

        this.router.get("/state/map", async (req, res) => {
            try {
                res.json(this.robot.state.map);
            } catch (err) {
                res.status(500).send(String(err));
            }
        });


        this.router.get("/activityHistory", (req, res) => {
            res.json(this.activityHistory);
        });

        this.router.use("/capabilities/", new CapabilitiesRouter({
            robot: this.robot,
            validator: this.validator
        }).getRouter());
    }

    initSSE() {
        const sseHubs = {
            state: new SSEHub({name: "State"}),
            attributes: new SSEHub({name: "Attributes"}),
            map: new SSEHub({name: "Map"})
        };
        this.sseHubs = sseHubs;

        this.stateUpdateListener = () => {
            if (sseHubs.state.clients.size === 0) return;
            sseHubs.state.event(
                ValetudoRobot.EVENTS.StateUpdated,
                JSON.stringify(this.robot.state)
            );
        };

        this.stateAttributesUpdateListener = () => {
            if (sseHubs.attributes.clients.size === 0) return;
            sseHubs.attributes.event(
                ValetudoRobot.EVENTS.StateAttributesUpdated,
                JSON.stringify(this.robot.state.attributes)
            );
        };

        this.mapUpdateListener = () => {
            if (sseHubs.map.clients.size === 0) return;
            sseHubs.map.event(
                ValetudoRobot.EVENTS.MapUpdated,
                JSON.stringify(this.robot.state.map)
            );
        };

        this.activityHistoryListener = () => {
            const attrs = this.robot.state.attributes;
            const status = /** @type {{value: string, flag: string}|undefined} */ (/** @type {unknown} */ (attrs.find(a => a.__class === "StatusStateAttribute")));
            if (!status) return;

            const currentKey = `${status.value}:${status.flag}`;

            // Status returned to last committed state — cancel any pending transient entry
            if (currentKey === this.prevStatusKey) {
                if (this.activityHistoryDebounceTimer !== null) {
                    clearTimeout(this.activityHistoryDebounceTimer);
                    this.activityHistoryDebounceTimer = null;
                }
                return;
            }

            const battery = /** @type {{level: number, flag: string}|undefined} */ (/** @type {unknown} */ (attrs.find(a => a.__class === "BatteryStateAttribute")));
            const dock    = /** @type {{value: string}|undefined} */ (/** @type {unknown} */ (attrs.find(a => a.__class === "DockStatusStateAttribute")));

            // Snapshot the entry at the moment of transition
            const pendingEntry = {
                timestamp: new Date().toISOString(),
                robotStatus: status.value,
                robotFlag:   status.flag,
                dockStatus:  dock && dock.value !== "idle" ? dock.value : null,
                batteryLevel: battery ? Math.round(battery.level) : null,
                batteryFlag:  battery ? battery.flag : null,
            };
            const pendingKey = currentKey;

            // Cancel any previous pending entry and wait for this state to stabilise
            if (this.activityHistoryDebounceTimer !== null) {
                clearTimeout(this.activityHistoryDebounceTimer);
            }

            this.activityHistoryDebounceTimer = setTimeout(() => {
                this.activityHistoryDebounceTimer = null;
                this.prevStatusKey = pendingKey;
                this.activityHistory.unshift(pendingEntry);
                if (this.activityHistory.length > 500) {
                    this.activityHistory.length = 500;
                }
            }, 2000);
        };

        this.robot.onStateUpdated(this.stateUpdateListener);
        this.robot.onStateAttributesUpdated(this.stateAttributesUpdateListener);
        this.robot.onStateAttributesUpdated(this.activityHistoryListener);
        this.robot.onMapUpdated(this.mapUpdateListener);

        this.router.get(
            "/state/sse",
            SSEMiddleware({
                hub: this.sseHubs.state,
                keepAliveInterval: 5000,
                maxClients: 5
            }),
            (req, res) => {
                //Intentional, as the response will be handled by the SSEMiddleware
            }
        );

        this.router.get(
            "/state/attributes/sse",
            SSEMiddleware({
                hub: this.sseHubs.attributes,
                keepAliveInterval: 5000,
                maxClients: 5
            }),
            (req, res) => {
                //Intentional, as the response will be handled by the SSEMiddleware
            }
        );

        this.router.get(
            "/state/map/sse",
            SSEMiddleware({
                hub: this.sseHubs.map,
                keepAliveInterval: 5000,
                maxClients: 5
            }),
            (req, res) => {
                //Intentional, as the response will be handled by the SSEMiddleware
            }
        );
    }

    getRouter() {
        return this.router;
    }

    shutdown() {
        // Remove event listeners to prevent memory leaks
        if (this.stateUpdateListener) {
            this.robot.offStateUpdated(this.stateUpdateListener);
        }
        if (this.stateAttributesUpdateListener) {
            this.robot.offStateAttributesUpdated(this.stateAttributesUpdateListener);
        }
        if (this.activityHistoryListener) {
            this.robot.offStateAttributesUpdated(this.activityHistoryListener);
        }
        if (this.activityHistoryDebounceTimer !== null) {
            clearTimeout(this.activityHistoryDebounceTimer);
            this.activityHistoryDebounceTimer = null;
        }
        if (this.mapUpdateListener) {
            this.robot.offMapUpdated(this.mapUpdateListener);
        }

        if (this.sseHubs) {
            Object.values(this.sseHubs).forEach(hub => {
                hub.shutdown();
            });
        }
    }
}

module.exports = RobotRouter;
