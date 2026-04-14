const MaintenanceCapability = require("../../../core/capabilities/MaintenanceCapability");
const DreameMiotServices = require("../DreameMiotServices");
const stateAttrs = require("../../../entities/state/attributes");

/**
 * @extends MaintenanceCapability<import("../DreameValetudoRobot")>
 */
class DreameMaintenanceCapability extends MaintenanceCapability {
    /**
     * @param {object} options
     * @param {import("../DreameValetudoRobot")} options.robot
     * @param {Array<string>} options.supportedActions
     */
    constructor(options) {
        super(options);

        this.supportedActions = options.supportedActions;

        this.actionMap = {
            "mop_dock_auto_repair": async () => {
                await this.robot.miotHelper.writeProperty(
                    99,
                    8,
                    JSON.stringify({"bittest": [19, 0]})
                );
            },
            "mop_dock_water_hookup_test": async () => {
                await this.robot.miotHelper.writeProperty(
                    99,
                    8,
                    JSON.stringify({"bittest": [20, 0]})
                );
            },
            "robot_drain_internal_water_tank": async () => {
                await this.robot.miotHelper.executeAction(
                    DreameMiotServices["GEN2"].VACUUM_2.SIID,
                    DreameMiotServices["GEN2"].VACUUM_2.ACTIONS.MOP_DOCK_INTERACT.AIID,
                    [
                        {
                            piid: DreameMiotServices["GEN2"].VACUUM_2.PROPERTIES.ADDITIONAL_CLEANUP_PROPERTIES.PIID,
                            value: "7,1"
                        }
                    ]
                );
            },
            "mop_dock_self_cleaning": async () => {
                const mopAttachmentState = this.robot.state.getFirstMatchingAttribute({
                    attributeClass: stateAttrs.AttachmentStateAttribute.name,
                    attributeType: stateAttrs.AttachmentStateAttribute.TYPE.MOP
                });

                if (mopAttachmentState?.attached === true) {
                    await this.robot.miotHelper.executeAction(
                        DreameMiotServices["GEN2"].VACUUM_2.SIID,
                        DreameMiotServices["GEN2"].VACUUM_2.ACTIONS.MOP_DOCK_INTERACT.AIID,
                        [
                            {
                                piid: DreameMiotServices["GEN2"].VACUUM_2.PROPERTIES.ADDITIONAL_CLEANUP_PROPERTIES.PIID,
                                value: "5,1"
                            }
                        ]
                    );
                } else {
                    throw new Error("The mop pads need to be attached");
                }
            }
        };
    }

    /**
     * @param {string} action
     * @returns {Promise<void>}
     */
    async executeMaintenanceAction(action) {
        if (!this.supportedActions.includes(action)) {
            throw new Error(`Unsupported maintenance action: ${action}`);
        }

        await this.actionMap[action]();
    }

    getProperties() {
        return {
            supportedActions: this.supportedActions
        };
    }
}

module.exports = DreameMaintenanceCapability;
