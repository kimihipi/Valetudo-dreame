const DismissibleValetudoEvent = require("./DismissibleValetudoEvent");

class DockComponentErrorValetudoEvent extends DismissibleValetudoEvent {
    /**
     * @param {object}  options
     * @param {string}  options.type
     * @param {string}  options.value
     * @param {object} [options.metaData]
     * @class
     */
    constructor(options) {
        super(Object.assign({}, options, {id: DockComponentErrorValetudoEvent.idForType(options.type)}));

        this.type = options.type;
        this.value = options.value;
    }

    /**
     * @param {string} type
     * @returns {string}
     */
    static idForType(type) {
        return "dock_component_error_" + type;
    }
}

module.exports = DockComponentErrorValetudoEvent;
