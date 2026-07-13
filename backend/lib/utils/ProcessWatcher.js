const fs = require("fs");
const Logger = require("../Logger");
const {spawn} = require("child_process");

const DEFAULT_RETRY_DELAY_MS = 15000;
const MAX_RETRY_DELAY_MS = 5 * 60 * 1000;
const FLAP_WARN_THRESHOLD = 3;

class ProcessWatcher {
    /**
     * @param {object} options
     * @param {string} options.name
     * @param {string} options.binary
     * @param {string[]} [options.args]
     * @param {object} [options.spawnOptions]
     * @param {number} [options.retryDelay]
     */
    constructor(options) {
        this.name = options.name;
        this.binary = options.binary;
        this.args = options.args ?? [];
        this.spawnOptions = options.spawnOptions ?? {};
        this.retryDelay = options.retryDelay ?? DEFAULT_RETRY_DELAY_MS;

        this.process = null;
        this.stopped = true;
        this.retryTimeout = null;
        this.consecutiveFailures = 0;
        this.flapWarned = false;
    }

    get binaryExists() {
        return fs.existsSync(this.binary);
    }

    start() {
        if (!this.stopped) {
            return;
        }

        this.stopped = false;
        this.spawnProcess();
    }

    stop() {
        this.stopped = true;

        if (this.retryTimeout !== null) {
            Logger.info(`ProcessWatcher: Cancelling pending restart of ${this.name}`);
            clearTimeout(this.retryTimeout);
            this.retryTimeout = null;
        }

        if (this.process !== null) {
            Logger.info(`ProcessWatcher: Killing ${this.name}`);

            try {
                this.process.kill("SIGTERM");
            } catch (e) {
                Logger.warn(`ProcessWatcher: Failed to kill ${this.name}:`, e);
            }
        }
    }

    get isActive() {
        return !this.stopped;
    }

    spawnProcess() {
        if (this.process !== null) {
            return;
        }

        Logger.debug(`ProcessWatcher: Starting ${this.name}`);
        const startedAt = Date.now();
        this.process = spawn(this.binary, this.args, this.spawnOptions);

        this.process.on("error", (err) => {
            Logger.warn(`ProcessWatcher: ${this.name} error:`, err);
            this.process = null;
            this.handleFailure(startedAt);
        });

        this.process.on("exit", (code, signal) => {
            Logger.debug(`ProcessWatcher: ${this.name} exited (code=${code}, signal=${signal})`);
            this.process = null;
            this.handleFailure(startedAt);
        });
    }

    handleFailure(startedAt) {
        // A process that ran long enough to clear the base retry delay is considered healthy,
        // so we reset the flap tracking and treat this as a fresh, quiet restart.
        if (Date.now() - startedAt >= this.retryDelay) {
            this.consecutiveFailures = 0;
            this.flapWarned = false;
            this.scheduleRetry();

            return;
        }

        this.consecutiveFailures++;

        if (this.consecutiveFailures === FLAP_WARN_THRESHOLD && !this.flapWarned) {
            this.flapWarned = true;
            Logger.warn(
                `ProcessWatcher: ${this.name} has exited immediately ${this.consecutiveFailures} times in a row. ` +
                "Backing off; further restarts will be logged at debug level."
            );
        }

        this.scheduleRetry();
    }

    scheduleRetry() {
        if (this.stopped || this.retryTimeout !== null) {
            return;
        }

        const delay = Math.min(
            this.retryDelay * Math.pow(2, Math.max(0, this.consecutiveFailures - 1)),
            MAX_RETRY_DELAY_MS
        );

        Logger.debug(`ProcessWatcher: Scheduling ${this.name} restart in ${delay}ms`);
        this.retryTimeout = setTimeout(() => {
            this.retryTimeout = null;

            if (!this.stopped) {
                this.spawnProcess();
            }
        }, delay);
    }
}

module.exports = ProcessWatcher;
