const express = require("express");

const Logger = require("../Logger");

class MatterRouter {
    /**
     *
     * @param {object} options
     * @param {import("../matter/MatterController")} options.matterController
     * @param {import("../Configuration")} options.config
     * @param {*} options.validator
     */
    constructor(options) {
        this.router = express.Router({mergeParams: true});

        this.config = options.config;
        this.matterController = options.matterController;
        this.validator = options.validator;

        this.initRoutes();
    }


    initRoutes() {
        this.router.get("/status", (req, res) => {
            res.json(this.matterController.getStatus());
        });

        this.router.get("/pairing", (req, res) => {
            const info = this.matterController.getPairingInfo();

            if (!info) {
                res.sendStatus(404);
                return;
            }

            res.json(info);
        });

        this.router.put("/areas", (req, res) => {
            if (!Array.isArray(req.body?.segment_ids) ||
                !req.body.segment_ids.every(id => typeof id === "string")) {
                res.sendStatus(400);
                return;
            }
            this.matterController.selectMatterAreasBySegmentIds(req.body.segment_ids).then(() => {
                res.sendStatus(200);
            }).catch(err => {
                if (err instanceof RangeError) {
                    res.status(400).send(err.message);
                } else {
                    res.status(409).send(err.message);
                }
            });
        });

        // No validator: this is an intentional no-body PUT and the shared
        // validator middleware 400s on empty bodies.
        this.router.put("/reset", (req, res) => {
            this.matterController.resetCommissioning().catch((err) => {
                Logger.error("Error while resetting Matter commissioning", err);
            });

            // Reset is fire-and-forget; the reconfigure semaphore serialises
            // the actual work. Return 202 so the UI can poll /status.
            res.sendStatus(202);
        });
    }

    getRouter() {
        return this.router;
    }
}

module.exports = MatterRouter;
