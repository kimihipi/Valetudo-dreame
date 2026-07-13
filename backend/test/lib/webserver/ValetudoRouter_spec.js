const should = require("should");

const defaultConfig = require("../../../lib/res/default_config.json");
const ValetudoRouter = require("../../../lib/webserver/ValetudoRouter");

describe("ValetudoRouter Matter configuration", function() {
    it("should migrate legacy clean profiles to enabled profiles", function() {
        const config = structuredClone(defaultConfig.matter);
        Object.values(config.cleanModeProfiles).forEach(profile => delete profile.enabled);

        const mapped = ValetudoRouter.MAP_MATTER_CONFIG(config);

        should(mapped).not.equal(null);
        Object.values(mapped.cleanModeProfiles).every(profile => profile.enabled).should.equal(true);
    });

    it("should require at least one enabled Matter clean profile", function() {
        const config = structuredClone(defaultConfig.matter);
        Object.values(config.cleanModeProfiles).forEach(profile => {
            profile.enabled = false;
        });

        should(ValetudoRouter.MAP_MATTER_CONFIG(config)).equal(null);
    });
});
