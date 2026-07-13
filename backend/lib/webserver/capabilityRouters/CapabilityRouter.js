const express = require("express");

const Logger = require("../../Logger");
const NotImplementedError = require("../../core/NotImplementedError");
const RobotFirmwareError = require("../../core/RobotFirmwareError");

class CapabilityRouter {
    /**
     *
     * @param {object} options
     * @param {import("../../core/capabilities/Capability") | any} options.capability
     * @param {*} options.validator
     * @param {import("../../core/CleaningTaskService")} options.cleaningTaskService
     */
    constructor(options) {
        this.router = express.Router({mergeParams: true});
        this.capability = options.capability;
        this.cleaningTaskService = options.cleaningTaskService;

        this.validator = options.validator;

        this.router.get("/properties", (req, res) => {
            res.json(this.capability.getProperties());
        });

        this.preInit();
        this.initRoutes();
    }

    /**
     * @protected
     */
    preInit() {
        // Nothing here
    }

    /**
     * @abstract
     * @protected
     */
    initRoutes() {
        throw new NotImplementedError();
    }

    /**
     * @protected
     * @param {any} req
     * @param {any} res
     * @param {Error & {commandId?: string, statusCode?: number}} err
     */
    sendErrorResponse(req, res, err) {
        if (err instanceof RobotFirmwareError) {
            Logger.warn(`${this.constructor.name}: Received error from robot while handling route "${req.path}"`, {
                body: req.body,
                message: err.message
            });
        } else {
            Logger.warn(`${this.constructor.name}: Error while handling route "${req.path}"`, {
                body: req.body,
                message: err.message
            });
        }


        if (err.commandId) {
            res.set("X-Valetudo-Command-Id", err.commandId);
        }
        const status = err.statusCode ?? (err instanceof RangeError || err instanceof TypeError ? 400 : 500);
        res.status(status).json(err.message);
    }

    getRouter() {
        return this.router;
    }
}

module.exports = CapabilityRouter;
