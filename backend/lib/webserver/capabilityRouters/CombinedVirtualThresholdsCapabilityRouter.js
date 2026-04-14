const CapabilityRouter = require("./CapabilityRouter");
const ValetudoVirtualThresholds = require("../../entities/core/ValetudoVirtualThresholds");

class CombinedVirtualThresholdsCapabilityRouter extends CapabilityRouter {
    initRoutes() {
        this.router.get("/", async (req, res) => {
            try {
                res.json(await this.capability.getVirtualThresholds());
            } catch (e) {
                this.sendErrorResponse(req, res, e);
            }
        });

        this.router.put("/", this.validator, async (req, res) => {
            if (
                Array.isArray(req.body.passableThresholds) &&
                Array.isArray(req.body.impassableThresholds) &&
                Array.isArray(req.body.ramps)
            ) {
                const virtualThresholds = new ValetudoVirtualThresholds({
                    passableThresholds: req.body.passableThresholds.map(t => ({
                        points: {
                            pA: {x: t.points.pA.x, y: t.points.pA.y},
                            pB: {x: t.points.pB.x, y: t.points.pB.y}
                        }
                    })),
                    impassableThresholds: req.body.impassableThresholds.map(t => ({
                        points: {
                            pA: {x: t.points.pA.x, y: t.points.pA.y},
                            pB: {x: t.points.pB.x, y: t.points.pB.y}
                        }
                    })),
                    ramps: req.body.ramps.map(r => ({
                        points: {
                            pA: {x: r.points.pA.x, y: r.points.pA.y},
                            pC: {x: r.points.pC.x, y: r.points.pC.y}
                        },
                        direction: r.direction ?? 0
                    }))
                });

                try {
                    await this.capability.setVirtualThresholds(virtualThresholds);
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

module.exports = CombinedVirtualThresholdsCapabilityRouter;
