const fs = require("fs");
const os = require("os");
const path = require("path");
const should = require("should");

const Configuration = require("../../lib/Configuration");
const DEFAULT_SETTINGS = require("../../lib/res/default_config.json");
const Tools = require("../../lib/utils/Tools");

describe("Configuration", function() {
    let dataPath;
    let originalDataPath;
    let originalGetValetudoVersion;
    let beforeExitListeners;

    beforeEach(function() {
        dataPath = fs.mkdtempSync(path.join(os.tmpdir(), "valetudo-configuration-"));
        originalDataPath = process.env.VALETUDO_DATA_PATH;
        originalGetValetudoVersion = Tools.GET_VALETUDO_VERSION;
        beforeExitListeners = new Set(process.listeners("beforeExit"));

        process.env.VALETUDO_DATA_PATH = dataPath;
        Tools.GET_VALETUDO_VERSION = () => "2026.7.1";
    });

    afterEach(function() {
        Tools.GET_VALETUDO_VERSION = originalGetValetudoVersion;
        if (originalDataPath === undefined) {
            delete process.env.VALETUDO_DATA_PATH;
        } else {
            process.env.VALETUDO_DATA_PATH = originalDataPath;
        }

        process.listeners("beforeExit").forEach(listener => {
            if (!beforeExitListeners.has(listener)) {
                process.removeListener("beforeExit", listener);
            }
        });
        fs.rmSync(dataPath, {recursive: true, force: true});
    });

    it("should migrate Matter profiles without replacing an existing configuration", function() {
        const previousConfig = structuredClone(DEFAULT_SETTINGS);
        previousConfig._version = "2026.5.0";
        previousConfig.oobe.welcomeDialogDismissed = true;
        previousConfig.valetudo.customizations.friendlyName = "Downstairs";
        previousConfig.timers.retainedTimer = {enabled: true};
        previousConfig.matter.cleanModeProfiles.quiet.enabled = false;
        Object.values(previousConfig.matter.cleanModeProfiles).forEach(profile => {
            if (profile !== previousConfig.matter.cleanModeProfiles.quiet) {
                delete profile.enabled;
            }
        });
        previousConfig.matterEstimation = {
            cleaningRates: {},
            washingDuration: {value: 0, samples: 0},
            chargingRate: {value: 0, samples: 0}
        };

        const configPath = path.join(dataPath, "valetudo_config.json");
        fs.writeFileSync(configPath, JSON.stringify(previousConfig, null, 2));

        const configuration = new Configuration();
        const persistedConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));

        persistedConfig._version.should.equal("2026.7.1");
        persistedConfig.oobe.welcomeDialogDismissed.should.equal(true);
        persistedConfig.valetudo.customizations.friendlyName.should.equal("Downstairs");
        persistedConfig.timers.retainedTimer.should.deepEqual({enabled: true});
        persistedConfig.matter.cleanModeProfiles.quiet.enabled.should.equal(false);
        ["minimum", "standard", "maximum", "deepClean"].forEach(profile => {
            persistedConfig.matter.cleanModeProfiles[profile].enabled.should.equal(true);
        });
        should(persistedConfig.matterEstimation).equal(undefined);
        should(fs.existsSync(configPath + ".backup")).equal(false);
        configuration.get("valetudo").customizations.friendlyName.should.equal("Downstairs");
    });

    it("should preserve both camera streamer configurations during an update", function() {
        const previousConfig = structuredClone(DEFAULT_SETTINGS);
        previousConfig._version = "2026.7.0";
        previousConfig.webserver.streamerProxy = {
            url: "http://127.0.0.1:2984",
            timeoutMs: 9000,
            manageProcesses: true,
            stopWhenIdle: true
        };
        previousConfig.duststreaming.enabled = true;
        previousConfig.valetudo.customizations.friendlyName = "Camera Robot";

        const configPath = path.join(dataPath, "valetudo_config.json");
        fs.writeFileSync(configPath, JSON.stringify(previousConfig, null, 2));

        const configuration = new Configuration();
        const persistedConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));

        persistedConfig.webserver.streamerProxy.should.deepEqual(previousConfig.webserver.streamerProxy);
        persistedConfig.duststreaming.enabled.should.equal(true);
        persistedConfig.valetudo.customizations.friendlyName.should.equal("Camera Robot");
        should(fs.existsSync(configPath + ".backup")).equal(false);
        configuration.get("webserver").streamerProxy.should.deepEqual(previousConfig.webserver.streamerProxy);
    });

    it("should add missing streamer defaults without replacing existing settings", function() {
        const previousConfig = structuredClone(DEFAULT_SETTINGS);
        previousConfig._version = "2026.7.0";
        previousConfig.valetudo.customizations.friendlyName = "Existing Robot";
        delete previousConfig.webserver.streamerProxy;

        const configPath = path.join(dataPath, "valetudo_config.json");
        fs.writeFileSync(configPath, JSON.stringify(previousConfig, null, 2));

        const configuration = new Configuration();
        const persistedConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));

        persistedConfig.webserver.streamerProxy.should.deepEqual(DEFAULT_SETTINGS.webserver.streamerProxy);
        persistedConfig.valetudo.customizations.friendlyName.should.equal("Existing Robot");
        should(fs.existsSync(configPath + ".backup")).equal(false);
        configuration.get("webserver").streamerProxy.should.deepEqual(DEFAULT_SETTINGS.webserver.streamerProxy);
    });
});
