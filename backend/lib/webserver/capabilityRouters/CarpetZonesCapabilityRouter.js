const CapabilityRouter = require("./CapabilityRouter");
const ValetudoCarpetZones = require("../../entities/core/ValetudoCarpetZones");

class CarpetZonesCapabilityRouter extends CapabilityRouter {
    initRoutes() {
        this.router.get("/", async (req, res) => {
            try {
                res.json(await this.capability.getCarpetZones());
            } catch (e) {
                this.sendErrorResponse(req, res, e);
            }
        });

        this.router.put("/", this.validator, async (req, res) => {
            if (Array.isArray(req.body.zones)) {
                const carpetZones = new ValetudoCarpetZones({
                    zones: req.body.zones.map(z => ({
                        points: {
                            pA: {x: z.points.pA.x, y: z.points.pA.y},
                            pB: {x: z.points.pB.x, y: z.points.pB.y},
                            pC: {x: z.points.pC.x, y: z.points.pC.y},
                            pD: {x: z.points.pD.x, y: z.points.pD.y}
                        }
                    }))
                });

                try {
                    await this.capability.setCarpetZones(carpetZones);
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

module.exports = CarpetZonesCapabilityRouter;
