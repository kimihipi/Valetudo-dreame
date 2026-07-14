const CapabilityRouter = require("./CapabilityRouter");

class BasicControlCapabilityRouter extends CapabilityRouter {
    initRoutes() {
        const methodMap = {
            "start": req => {
                return this.cleaningTaskService.startAll({source: "webui"});
            },
            "stop": () => {
                return this.cleaningTaskService.stop({source: "webui"});
            },
            "pause": () => {
                return this.cleaningTaskService.pause({source: "webui"});
            },
            "home": () => {
                return this.cleaningTaskService.home({source: "webui"});
            }
        };

        this.router.put("/", this.validator, async (req, res) => {
            const method = methodMap[req.body.action];

            if (method) {
                try {
                    const result = await method(req);
                    if (result?.commandId) {
                        res.set("X-Valetudo-Command-Id", result.commandId).status(200).json({commandId: result.commandId});
                    } else {
                        res.sendStatus(200);
                    }
                } catch (e) {
                    this.sendErrorResponse(req, res, e);
                }
            } else {
                res.sendStatus(400);
            }
        });
    }
}

module.exports = BasicControlCapabilityRouter;
