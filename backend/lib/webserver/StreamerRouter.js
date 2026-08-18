const express = require("express");
const httpProxyMiddleware = require("http-proxy-middleware");
const Logger = require("../Logger");

class StreamerRouter {
    /**
     * @param {object} options
     * @param {import("../Configuration")} options.config
     */
    constructor(options) {
        this.router = express.Router({mergeParams: true});
        this.config = options.config;
        this.webserverConfig = this.config.get("webserver");

        this.initRoutes();
    }

    initRoutes() {
        this.router.use("/", httpProxyMiddleware.createProxyMiddleware({
            target: this.webserverConfig.streamerProxy.url,
            pathRewrite: {
                "^/streamer": ""
            },
            ws: true,
            proxyTimeout: this.webserverConfig.streamerProxy.timeoutMs,
            timeout: this.webserverConfig.streamerProxy.timeoutMs,
            on: {
                error: (err) => {
                    Logger.debug("Legacy streamer proxy unavailable:", err.message);
                }
            }
        }));
    }

    getRouter() {
        return this.router;
    }
}

module.exports = StreamerRouter;
