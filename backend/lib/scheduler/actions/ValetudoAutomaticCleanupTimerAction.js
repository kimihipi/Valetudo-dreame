const AutomaticControlCapability = require("../../core/capabilities/AutomaticControlCapability");
const AutomaticSubModeControlCapability = require("../../core/capabilities/AutomaticSubModeControlCapability");
const ValetudoTimerAction = require("./ValetudoTimerAction");

class ValetudoAutomaticCleanupTimerAction extends ValetudoTimerAction {
    /**
     * @param {object} options
     * @param {import("../../core/ValetudoRobot")} options.robot
     * @param {string} options.preset
     * @param {string} [options.subMode]
     */
    constructor(options) {
        super(options);
        this.preset = options.preset;
        this.subMode = options.subMode;
    }

    async run() {
        if (!this.robot.hasCapability(AutomaticControlCapability.TYPE)) {
            throw new Error("Robot is missing the AutomaticControlCapability");
        }

        if (this.subMode && this.robot.hasCapability(AutomaticSubModeControlCapability.TYPE)) {
            await this.robot.capabilities[AutomaticSubModeControlCapability.TYPE].selectPreset(this.subMode);
        }

        return this.robot.capabilities[AutomaticControlCapability.TYPE].selectPreset(this.preset);
    }
}

module.exports = ValetudoAutomaticCleanupTimerAction;
