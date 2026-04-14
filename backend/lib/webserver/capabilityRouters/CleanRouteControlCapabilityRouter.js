const CapabilityRouter = require("./CapabilityRouter");
const {SSEHub, SSEMiddleware} = require("../middlewares/sse");

class CleanRouteControlCapabilityRouter extends CapabilityRouter {
    preInit() {
        this.sseHub = new SSEHub({name: "CleanRouteControl"});

        this.router.get("/sse", SSEMiddleware({
            hub: this.sseHub,
            keepAliveInterval: 5000,
            maxClients: 5,
        }), (req, res) => {
            //Intentional, as the response will be handled by the SSEMiddleware
        });
    }

    initRoutes() {
        this.router.get("/", async (req, res) => {
            try {
                res.json({
                    route: await this.capability.getRoute()
                });
            } catch (e) {
                this.sendErrorResponse(req, res, e instanceof Error ? e : new Error(String(e)));
            }
        });

        this.router.put("/", this.validator, async (req, res) => {
            if (req.body.route) {
                try {
                    await this.capability.setRoute(req.body.route);

                    res.sendStatus(200);

                    // Emit SSE event with updated route
                    try {
                        const route = await this.capability.getRoute();
                        this.sseHub?.event("CleanRouteUpdated", JSON.stringify({route: route}));
                    } catch (e) {
                        // intentional - state emission shouldn't block the response
                    }
                } catch (e) {
                    this.sendErrorResponse(req, res, e instanceof Error ? e : new Error(String(e)));
                }
            } else {
                res.sendStatus(400);
            }
        });
    }
}

module.exports = CleanRouteControlCapabilityRouter;
