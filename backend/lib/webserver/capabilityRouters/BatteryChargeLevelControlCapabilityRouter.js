const CapabilityRouter = require("./CapabilityRouter");

class BatteryChargeLevelControlCapabilityRouter extends CapabilityRouter {
    initRoutes() {
        this.router.get("/properties", (req, res) => {
            try {
                res.json(this.capability.getProperties());
            } catch (e) {
                this.sendErrorResponse(req, res, e);
            }
        });

        this.router.get("/", async (req, res) => {
            try {
                res.json({level: await this.capability.getLevel()});
            } catch (e) {
                this.sendErrorResponse(req, res, e);
            }
        });

        this.router.put("/", this.validator, async (req, res) => {
            if (req.body.level) {
                try {
                    await this.capability.setLevel(req.body.level);
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

module.exports = BatteryChargeLevelControlCapabilityRouter;
