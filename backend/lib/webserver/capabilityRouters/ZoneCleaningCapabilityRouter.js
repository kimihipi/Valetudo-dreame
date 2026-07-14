const CapabilityRouter = require("./CapabilityRouter");

class ZoneCleaningCapabilityRouter extends CapabilityRouter {
    initRoutes() {
        this.router.put("/", this.validator, async (req, res) => {
            if (req.body.action === "clean" && Array.isArray(req.body.zones)) {
                try {
                    const result = await this.cleaningTaskService.startZones({
                        zones: req.body.zones,
                        iterations: req.body.iterations,
                        expectedRevision: req.body.targetRevision,
                        source: "webui"
                    });
                    res.set("X-Valetudo-Command-Id", result.commandId).status(200).json({
                        commandId: result.commandId
                    });
                } catch (e) {
                    this.sendErrorResponse(req, res, e);
                }
            } else {
                res.sendStatus(400);
            }
        });
    }
}

module.exports = ZoneCleaningCapabilityRouter;
