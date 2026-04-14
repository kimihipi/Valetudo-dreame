const capabilities = require("./capabilities");
const DreameMopValetudoRobot = require("./DreameMopValetudoRobot");
const DreameQuirkFactory = require("./DreameQuirkFactory");
const DreameValetudoRobot = require("./DreameValetudoRobot");
const MiioValetudoRobot = require("../MiioValetudoRobot");
const QuirksCapability = require("../../core/capabilities/QuirksCapability");
const ValetudoSelectionPreset = require("../../entities/core/ValetudoSelectionPreset");

class DreameP2149ValetudoRobot extends DreameMopValetudoRobot {
    /**
     *
     * @param {object} options
     * @param {import("../../Configuration")} options.config
     * @param {import("../../ValetudoEventStore")} options.valetudoEventStore
     */
    constructor(options) {
        super(options);

        const quirkFactory = new DreameQuirkFactory({
            robot: this
        });

        this.registerCapability(new capabilities.DreameMopDockMopCleaningFrequencyControlCapability({
            robot: this,
            presets: [
                new ValetudoSelectionPreset({name: "every_segment", value: 0}),
                new ValetudoSelectionPreset({name: "every_5_m2", value: 5}),
                new ValetudoSelectionPreset({name: "every_10_m2", value: 10}),
                new ValetudoSelectionPreset({name: "every_15_m2", value: 15}),
                new ValetudoSelectionPreset({name: "every_20_m2", value: 20}),
                new ValetudoSelectionPreset({name: "every_25_m2", value: 25}),
            ]
        }));

        this.registerCapability(new QuirksCapability({
            robot: this,
            quirks: [
                quirkFactory.getQuirk(DreameQuirkFactory.KNOWN_QUIRKS.MOP_DOCK_MOP_ONLY_MODE),
                quirkFactory.getQuirk(DreameQuirkFactory.KNOWN_QUIRKS.MOP_DOCK_UV_TREATMENT)
            ]
        }));
    }

    getModelName() {
        return "P2149";
    }

    static IMPLEMENTATION_AUTO_DETECTION_HANDLER() {
        const deviceConf = MiioValetudoRobot.READ_DEVICE_CONF(DreameValetudoRobot.DEVICE_CONF_PATH);

        return !!(deviceConf && deviceConf.model === "dreame.vacuum.p2149o");
    }
}


module.exports = DreameP2149ValetudoRobot;
