const CapabilityRouter = require("./CapabilityRouter");

class MapSegmentHideCapabilityRouter extends CapabilityRouter {
    initRoutes() {
        this.router.put("/", this.validator, async (req, res) => {
            if (req.body.action === "set_hidden_segments") {
                if (!Array.isArray(req.body.segment_ids)) {
                    res.sendStatus(400);
                    return;
                }
                try {
                    await this.capability.setHiddenSegments(req.body.segment_ids);
                    res.sendStatus(200);
                } catch (e) {
                    this.sendErrorResponse(req, res, e);
                }
            } else {
                res.sendStatus(400);
            }
        });
    }
}

module.exports = MapSegmentHideCapabilityRouter;
