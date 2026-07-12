const StateAttribute = require("./StateAttribute");

class ActiveCleaningTaskStateAttribute extends StateAttribute {
    /** @param {object} options */
    constructor(options) {
        super(options);
        this.id = options.id;
        this.state = options.state;
        this.source = options.source ?? "robot";
        this.startedAt = options.startedAt;
        this.target = options.target ?? {type: "all", segmentIds: [], segmentNames: []};
        this.profile = options.profile ?? {};
        this.progress = options.progress ?? {};
        this.outcome = options.outcome ?? null;
        this.revision = options.revision ?? 0;
    }
}

module.exports = ActiveCleaningTaskStateAttribute;
