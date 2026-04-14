const CapabilityRouter = require("./CapabilityRouter");
const {SSEHub, SSEMiddleware} = require("../middlewares/sse");

class SimpleToggleCapabilityRouter extends CapabilityRouter {
    preInit() {
        this.sseHub = new SSEHub({name: "SimpleToggle"});

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
                    enabled: await this.capability.isEnabled()
                });
            } catch (e) {
                this.sendErrorResponse(req, res, e instanceof Error ? e : new Error(String(e)));
            }
        });

        this.router.put("/", this.validator, async (req, res) => {
            try {
                switch (req.body.action) {
                    case "enable":
                        await this.capability.enable();
                        break;
                    case "disable":
                        await this.capability.disable();
                        break;
                    default:
                        // noinspection ExceptionCaughtLocallyJS
                        throw new Error("Invalid action");
                }

                res.sendStatus(200);

                // Emit SSE event with updated state
                try {
                    const state = await this.capability.isEnabled();
                    this.sseHub?.event("SimpleToggleUpdated", JSON.stringify({enabled: state}));
                } catch (e) {
                    // intentional - state emission shouldn't block the response
                }
            } catch (e) {
                this.sendErrorResponse(req, res, e instanceof Error ? e : new Error(String(e)));
            }
        });
    }
}

module.exports = SimpleToggleCapabilityRouter;
