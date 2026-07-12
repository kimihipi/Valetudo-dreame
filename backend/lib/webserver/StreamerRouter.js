const express = require("express");
const httpProxyMiddleware = require("http-proxy-middleware");
const Logger = require("../Logger");
const SSEHub = require("./middlewares/sse/SSEHub");
const SSEMiddleware = require("./middlewares/sse/SSEMiddleware");
const VideoMonitorManager = require("../VideoMonitorManager");

const STREAMER_STATE_EVENT = "StreamerState";

class StreamerRouter {
    /**
     * @param {object} options
     * @param {import("../Configuration")} options.config
     * @param {import("../VideoMonitorManager")} [options.videoMonitorManager]
     */
    constructor(options) {
        this.router = express.Router({mergeParams: true});

        this.config = options.config;
        this.webserverConfig = this.config.get("webserver");
        this.videoMonitorManager = options.videoMonitorManager ?? null;

        this.stateHub = new SSEHub({name: "StreamerState"});

        if (this.videoMonitorManager) {
            this.videoMonitorManager.on(VideoMonitorManager.EVENTS.StreamerStarted, () => {
                this.stateHub.latestEvent(STREAMER_STATE_EVENT, JSON.stringify({running: true, managed: true}));
            });
            this.videoMonitorManager.on(VideoMonitorManager.EVENTS.StreamerStopped, () => {
                this.stateHub.latestEvent(STREAMER_STATE_EVENT, JSON.stringify({running: false, managed: true}));
            });
        }

        this.initRoutes();
    }

    initRoutes() {
        // SSE state endpoint — registered before the proxy so it is handled directly
        this.router.get(
            "/state/sse",
            SSEMiddleware({
                hub: this.stateHub,
                keepAliveInterval: 5000,
                maxClients: 5
            }),
            (_req, res) => {
                const managed = this.videoMonitorManager?.isManaged ?? false;
                const running = managed ? (this.videoMonitorManager?.streamerRunning ?? false) : false;
                /** @type {any} */ (res).sse.writeLatest(`event: ${STREAMER_STATE_EVENT}\ndata: ${JSON.stringify({running: running, managed: managed})}\n\n`);
            }
        );

        this.router.use("/", httpProxyMiddleware.createProxyMiddleware({
            target: this.webserverConfig.streamerProxy.url,
            pathRewrite: {
                "^/streamer": ""
            },
            ws: true,
            proxyTimeout: this.webserverConfig.streamerProxy.timeoutMs,
            timeout: this.webserverConfig.streamerProxy.timeoutMs,
            on: {
                error: (err, _req, res) => {
                    const anyErr = /** @type {any} */ (err);
                    if (anyErr.code === "ECONNREFUSED") {
                        Logger.debug("Streamer proxy not available: ", err.message);
                    } else {
                        Logger.error("Failed to proxy request: ", err);
                    }
                    // res may be a Socket for WebSocket upgrades — only respond for HTTP requests
                    const anyRes = /** @type {any} */ (res);
                    if (anyRes && typeof anyRes.status === "function" && !anyRes.headersSent) {
                        anyRes.status(503).json({message: "Streamer unavailable"});
                    }
                },
            },
        }));
    }

    getRouter() {
        return this.router;
    }

    shutdown() {
        this.stateHub.shutdown();
    }
}

module.exports = StreamerRouter;
