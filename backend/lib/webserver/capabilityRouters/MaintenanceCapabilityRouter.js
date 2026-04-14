const CapabilityRouter = require("./CapabilityRouter");

class MaintenanceCapabilityRouter extends CapabilityRouter {
    initRoutes() {
        this.router.get("/", async (req, res) => {
            try {
                res.json(this.capability.getProperties());
            } catch (e) {
                this.sendErrorResponse(req, res, e instanceof Error ? e : new Error(String(e)));
            }
        });

        this.router.put("/", this.validator, async (req, res) => {
            if (req.body.action) {
                try {
                    await this.capability.executeMaintenanceAction(req.body.action);
                    res.sendStatus(200);
                } catch (e) {
                    this.sendErrorResponse(req, res, e instanceof Error ? e : new Error(String(e)));
                }
            } else {
                res.sendStatus(400);
            }
        });
    }
}

module.exports = MaintenanceCapabilityRouter;
