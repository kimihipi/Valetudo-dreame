const CapabilityRouter = require("./CapabilityRouter");

class MapSegmentationCapabilityRouter extends CapabilityRouter {
    initRoutes() {
        this.router.get("/", async (req, res) => {
            try {
                res.json(await this.capability.getSegments());
            } catch (e) {
                this.sendErrorResponse(req, res, e);
            }
        });

        this.router.put("/", this.validator, async (req, res) => {
            if (req.body.action === "start_segment_action") {
                if (Array.isArray(req.body.segment_ids)) {
                    try {
                        const result = await this.cleaningTaskService.startSegments({
                            segmentIds: req.body.segment_ids,
                            iterations: req.body.iterations,
                            customOrder: req.body.customOrder,
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
            } else {
                res.sendStatus(400);
            }
        });
    }
}

module.exports = MapSegmentationCapabilityRouter;
