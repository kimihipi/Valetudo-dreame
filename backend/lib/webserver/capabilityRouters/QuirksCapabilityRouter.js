const CapabilityRouter = require("./CapabilityRouter");
const {SSEHub, SSEMiddleware} = require("../middlewares/sse");

class QuirksCapabilityRouter extends CapabilityRouter {
    preInit() {
        this.sseHub = new SSEHub({name: "Quirks"});

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
                res.json(await this.capability.getQuirks());
            } catch (e) {
                this.sendErrorResponse(req, res, e);
            }
        });

        this.router.put("/", this.validator, async (req, res) => {
            if (req.body.id && req.body.value) {
                try {
                    await this.capability.setQuirkValue(req.body.id, req.body.value);

                    res.sendStatus(200);

                    this.capability.getQuirks().then(quirks => {
                        this.sseHub.event("QuirksUpdated", JSON.stringify(quirks));
                    }).catch(() => {/*intentional*/});
                } catch (e) {
                    this.sendErrorResponse(req, res, e);
                }
            } else {
                res.sendStatus(400);
            }
        });
    }
}

module.exports = QuirksCapabilityRouter;
