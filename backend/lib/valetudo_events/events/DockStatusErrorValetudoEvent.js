const DismissibleValetudoEvent = require("./DismissibleValetudoEvent");

class DockStatusErrorValetudoEvent extends DismissibleValetudoEvent {
    /**
     * @param {object}  options
     * @param {object} [options.metaData]
     * @class
     */
    constructor(options) {
        super(Object.assign({}, options, {id: DockStatusErrorValetudoEvent.ID}));
    }
}

DockStatusErrorValetudoEvent.ID = "dock_status_error";

module.exports = DockStatusErrorValetudoEvent;
