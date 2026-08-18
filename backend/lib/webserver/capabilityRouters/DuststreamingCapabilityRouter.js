const CapabilityRouter = require("./CapabilityRouter");
const Logger = require("../../Logger");

// res.write() returning false only means that Node has started buffering. It
// does not mean that the write failed. Allow a short burst before considering
// the client stale, otherwise normal socket backpressure repeatedly tears down
// an otherwise healthy live stream.
//
// The allowed burst is sized relative to the stream's own bitrate rather than
// a fixed byte count: a fixed limit is either too tight for a high-bitrate
// stream or, as happened with a flat 1MB at the default 1 Mbit/s, lets a
// struggling client sit ~8s behind live before being dropped. Capping it at a
// couple of seconds of video keeps the stream close to real-time.
const MAX_CLIENT_BUFFER_SECONDS = 1.5;
const MIN_CLIENT_BUFFER_BYTES = 64 * 1024;

class DuststreamingCapabilityRouter extends CapabilityRouter {
    initRoutes() {
        this.router.delete("/stream", (_req, res) => {
            this.capability.stop();
            res.sendStatus(200);
        });

        this.router.get("/stream", (req, res) => {
            if (this.capability.robot.config.get("duststreaming")?.enabled !== true) {
                return res.sendStatus(403);
            }

            if (!this.capability.isDuststreamerInstalled()) {
                return res.sendStatus(503);
            }

            res.set({
                "Content-Type": "video/MP2T",
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no"
            });
            res.flushHeaders();

            const maxClientBufferBytes = Math.max(
                MIN_CLIENT_BUFFER_BYTES,
                (this.capability.getBitrate() / 8) * MAX_CLIENT_BUFFER_SECONDS
            );

            this.capability.register({
                write: (buf) => {
                    if (res.destroyed || res.writableEnded) {
                        return false;
                    }

                    const bufferedBytes = Math.max(
                        res.writableLength ?? 0,
                        res.socket?.writableLength ?? 0
                    );
                    if (bufferedBytes > maxClientBufferBytes) {
                        Logger.debug("Terminating stale duststream client.");
                        res.destroy();

                        return false;
                    }

                    // A false return value means that the data was accepted but
                    // queued. The size guard above handles clients that cannot
                    // catch up without disconnecting on transient backpressure.
                    res.write(buf);

                    return true;
                },
                destroy: () => {
                    res.destroy();
                },
                onClose: (fn) => {
                    res.once("close", fn);
                }
            });
        });
    }
}

module.exports = DuststreamingCapabilityRouter;
