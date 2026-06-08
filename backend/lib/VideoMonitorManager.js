const env = require("./res/env");
const EventEmitter = require("events");
const path = require("path");
const ProcessWatcher = require("./utils/ProcessWatcher");
const StatusStateAttribute = require("./entities/state/attributes/StatusStateAttribute");

class VideoMonitorManager extends EventEmitter {
    /**
     * @param {object} options
     * @param {import("./Configuration")} options.config
     * @param {import("./core/ValetudoRobot")} options.robot
     */
    constructor(options) {
        super();

        this.config = options.config;
        this.robot = options.robot;
        this.isManaged = false;
        this.streamerRunning = false;

        const streamerProxyConfig = this.config.get("webserver")?.streamerProxy ?? {};

        if (streamerProxyConfig.manageProcesses !== true) {
            return;
        }

        const streamerBase = path.join(process.env[env.DataPath], "streamer");

        this.videoMonitorWatcher = new ProcessWatcher({
            name: "video_monitor",
            binary: path.join(streamerBase, "video_monitor"),
            spawnOptions: {
                env: {LD_PRELOAD: path.join(streamerBase, "vacuumstreamer.so")},
                stdio: "ignore"
            }
        });

        this.go2rtcWatcher = new ProcessWatcher({
            name: "go2rtc",
            binary: path.join(streamerBase, "go2rtc"),
            args: ["-c", path.join(streamerBase, "go2rtc.yaml")],
            spawnOptions: {stdio: "ignore"}
        });

        if (!this.videoMonitorWatcher.binaryExists || !this.go2rtcWatcher.binaryExists) {
            return;
        }

        this.isManaged = true;

        if (streamerProxyConfig.stopWhenIdle === true) {
            this.robot.onStateAttributesUpdated(() => {
                this.handleStateUpdate();
            });
        } else {
            this.startWatchers();
        }
    }

    handleStateUpdate() {
        const statusAttribute = this.robot.state.getFirstMatchingAttributeByConstructor(StatusStateAttribute);

        if (!statusAttribute) {
            return;
        }

        if (statusAttribute.isActiveState && !this.videoMonitorWatcher.isActive) {
            this.startWatchers();
        } else if (!statusAttribute.isActiveState && this.videoMonitorWatcher.isActive) {
            this.stopWatchers();
        }
    }

    startWatchers() {
        this.videoMonitorWatcher.start();
        this.go2rtcWatcher.start();
        this.streamerRunning = true;
        this.emit(VideoMonitorManager.EVENTS.StreamerStarted);
    }

    stopWatchers() {
        this.videoMonitorWatcher.stop();
        this.go2rtcWatcher.stop();
        this.streamerRunning = false;
        this.emit(VideoMonitorManager.EVENTS.StreamerStopped);
    }

    async shutdown() {
        if (this.videoMonitorWatcher) {
            this.stopWatchers();
        }
    }
}

VideoMonitorManager.EVENTS = {
    StreamerStarted: "StreamerStarted",
    StreamerStopped: "StreamerStopped",
};

module.exports = VideoMonitorManager;
