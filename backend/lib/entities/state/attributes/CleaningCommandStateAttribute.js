const StateAttribute = require("./StateAttribute");

class CleaningCommandStateAttribute extends StateAttribute {
    /** @param {object} options */
    constructor(options) {
        super(options);
        this.id = options.id;
        this.command = options.command;
        this.state = options.state;
        this.source = options.source ?? "robot";
        this.targetRevision = options.targetRevision ?? null;
        this.createdAt = options.createdAt;
        this.updatedAt = options.updatedAt ?? options.createdAt;
        this.error = options.error ?? null;
        this.revision = options.revision ?? 0;
    }
}

CleaningCommandStateAttribute.STATE = Object.freeze({
    PENDING: "pending",
    ACCEPTED: "accepted",
    VERIFIED: "verified",
    FAILED: "failed",
    UNCERTAIN: "uncertain"
});

CleaningCommandStateAttribute.COMMAND = Object.freeze({
    HOME: "home",
    PAUSE: "pause",
    RESUME: "resume",
    START_ALL: "start_all",
    START_SEGMENTS: "start_segments",
    STOP: "stop"
});

module.exports = CleaningCommandStateAttribute;
