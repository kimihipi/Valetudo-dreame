const CapabilityRouter = require("./CapabilityRouter");
const {StatusStateAttribute} = require("../../entities/state/attributes");

class BasicControlCapabilityRouter extends CapabilityRouter {
    initRoutes() {
        const methodMap = {
            "start": () => {
                return this.capability.start();
            },
            "stop": () => {
                return this.capability.stop();
            },
            "pause": () => {
                return this.capability.pause();
            },
            "home": () => {
                return this.capability.home();
            }
        };

        this.router.put("/", this.validator, async (req, res) => {
            const method = methodMap[req.body.action];

            if (method) {
                try {
                    const status = this.capability.robot.state.getFirstMatchingAttributeByConstructor(StatusStateAttribute);
                    if (req.body.action === "start" && status?.value !== StatusStateAttribute.VALUE.PAUSED) {
                        this.capability.robot.setCleaningTarget({
                            value: "all", segmentIds: [], source: "webui", active: true
                        });
                    }
                    await method();
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

module.exports = BasicControlCapabilityRouter;
