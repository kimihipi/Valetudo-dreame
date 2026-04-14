const CapabilityRouter = require("./CapabilityRouter");
const ValetudoCurtains = require("../../entities/core/ValetudoCurtains");

class CurtainsCapabilityRouter extends CapabilityRouter {
    initRoutes() {
        this.router.get("/", async (req, res) => {
            try {
                res.json(await this.capability.getCurtains());
            } catch (e) {
                this.sendErrorResponse(req, res, e);
            }
        });

        this.router.put("/", this.validator, async (req, res) => {
            if (Array.isArray(req.body.curtains)) {
                const curtains = new ValetudoCurtains({
                    curtains: req.body.curtains.map(c => ({
                        points: {
                            pA: {x: c.points.pA.x, y: c.points.pA.y},
                            pB: {x: c.points.pB.x, y: c.points.pB.y}
                        }
                    }))
                });

                try {
                    await this.capability.setCurtains(curtains);
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

module.exports = CurtainsCapabilityRouter;
