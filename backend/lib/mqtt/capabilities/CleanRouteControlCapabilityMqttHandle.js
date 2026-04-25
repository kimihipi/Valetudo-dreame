const CapabilityMqttHandle = require("./CapabilityMqttHandle");

const ComponentType = require("../homeassistant/ComponentType");
const DataType = require("../homie/DataType");
const EntityCategory = require("../homeassistant/EntityCategory");
const InLineHassComponent = require("../homeassistant/components/InLineHassComponent");
const PropertyMqttHandle = require("../handles/PropertyMqttHandle");

class CleanRouteControlCapabilityMqttHandle extends CapabilityMqttHandle {
    /**
     * @param {object} options
     * @param {import("../handles/RobotMqttHandle")} options.parent
     * @param {import("../MqttController")} options.controller MqttController instance
     * @param {import("../../core/ValetudoRobot")} options.robot
     * @param {import("../../core/capabilities/CleanRouteControlCapability")} options.capability
     */
    constructor(options) {
        super(Object.assign(options, {friendlyName: "Clean Route control"}));
        this.capability = options.capability;

        const supportedRoutes = this.capability.getProperties().supportedRoutes;

        this.registerChild(
            new PropertyMqttHandle({
                parent: this,
                controller: this.controller,
                topicName: "route",
                friendlyName: "Clean Route",
                datatype: DataType.ENUM,
                format: supportedRoutes.join(","),
                setter: async (value) => {
                    if (!supportedRoutes.includes(value)) {
                        throw new Error(`Invalid route: ${value}`);
                    }
                    await this.capability.setRoute(value);
                },
                getter: async () => {
                    return await this.capability.getRoute();
                },
                helpText: "This handle allows setting the clean route. " +
                    "It accepts the route payloads specified in `$format` or in the HAss json attributes.",
                helpMayChange: {
                    "Enum payloads": "Different robot models support different clean routes. Always check `$format`/`json_attributes` during startup."
                }
            }).also((prop) => {
                this.controller.withHass((hass) => {
                    prop.attachHomeAssistantComponent(
                        new InLineHassComponent({
                            hass: hass,
                            robot: this.robot,
                            name: "CleanRouteControlCapability",
                            friendlyName: "Clean Route",
                            componentType: ComponentType.SELECT,
                            autoconf: {
                                state_topic: prop.getBaseTopic(),
                                value_template: "{{ value }}",
                                command_topic: prop.getBaseTopic() + "/set",
                                options: supportedRoutes,
                                icon: "mdi:routes",
                                entity_category: EntityCategory.CONFIG,
                            }
                        })
                    );
                });
            })
        );
    }
}

CleanRouteControlCapabilityMqttHandle.OPTIONAL = true;

module.exports = CleanRouteControlCapabilityMqttHandle;
