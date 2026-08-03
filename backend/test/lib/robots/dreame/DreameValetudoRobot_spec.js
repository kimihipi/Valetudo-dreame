const should = require("should");

const DreameValetudoRobot = require("../../../../lib/robots/dreame/DreameValetudoRobot");
const ValetudoRobotError = require("../../../../lib/entities/core/ValetudoRobotError");

describe("DreameValetudoRobot", function() {
    it("should map error 78 to a no-go zone task-start failure", function() {
        should(DreameValetudoRobot.MAP_ERROR_CODE("78")).match({
            severity: {
                kind: ValetudoRobotError.SEVERITY_KIND.TRANSIENT,
                level: ValetudoRobotError.SEVERITY_LEVEL.WARNING,
            },
            subsystem: ValetudoRobotError.SUBSYSTEM.NAVIGATION,
            message: "Robot cannot start task in no-go zone",
            vendorErrorCode: "78",
        });
    });
});
