import {Box, Typography} from "@mui/material";
import {FetchSource, Player} from "jsmpeg";
import type {JSMpegOptions, StreamStatus} from "jsmpeg";
import React from "react";
import {Capability, valetudoAPIBaseURL} from "../api";
import {getScaledConfusedPlaceholderDog} from "../components/res/ValetudogPlaceholder";

const STREAM_URL = `${valetudoAPIBaseURL}/robot/capabilities/${Capability.Duststreaming}/stream`;

const INITIAL_RECONNECT_DELAY_MS = 2_000;
const MAX_RECONNECT_DELAY_MS = 30_000;
const STABLE_STREAM_RESET_MS = 10_000;
// A connection can go "half-open" on flaky robot wifi: the socket never
// errors, it just stops delivering bytes. Without this, such a stall would
// never be detected or recovered from.
const STALL_TIMEOUT_SECONDS = 5;
// Debounce hiding the video behind the placeholder so a reconnect cycle that
// self-heals within this window never becomes visible to the user.
const HIDE_DEBOUNCE_MS = 250;

type DuststreamDimensions = {
    width: number;
    height: number;
};

export const DuststreamCanvas = ({
    dimensions,
}: {
    dimensions: DuststreamDimensions;
}): React.ReactElement => {
    const canvasRef = React.useRef<HTMLCanvasElement>(null);
    const [visible, setVisible] = React.useState(false);

    const {width, height} = dimensions;

    React.useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) {
            return;
        }

        setVisible(false);

        let disposed = false;
        let player: Player | null = null;
        let hideTimeoutId: ReturnType<typeof setTimeout> | undefined;
        let reconnectTimeoutId: ReturnType<typeof setTimeout> | undefined;
        let stableStreamTimeoutId: ReturnType<typeof setTimeout> | undefined;
        let reconnectAttempt = 0;
        let suppressStateChanges = false;

        const clearHideTimeout = () => {
            if (hideTimeoutId !== undefined) {
                clearTimeout(hideTimeoutId);
                hideTimeoutId = undefined;
            }
        };

        const clearReconnectTimeout = () => {
            if (reconnectTimeoutId !== undefined) {
                clearTimeout(reconnectTimeoutId);
                reconnectTimeoutId = undefined;
            }
        };

        const clearStableStreamTimeout = () => {
            if (stableStreamTimeoutId !== undefined) {
                clearTimeout(stableStreamTimeoutId);
                stableStreamTimeoutId = undefined;
            }
        };

        const destroyPlayer = () => {
            suppressStateChanges = true;
            try {
                player?.destroy();
            } catch (e) {
                // intentional
            } finally {
                player = null;
                suppressStateChanges = false;
            }
        };

        const scheduleReconnect = () => {
            if (disposed || reconnectTimeoutId !== undefined) {
                return;
            }

            const delay = Math.min(
                INITIAL_RECONNECT_DELAY_MS * (2 ** reconnectAttempt),
                MAX_RECONNECT_DELAY_MS
            );

            reconnectTimeoutId = setTimeout(() => {
                reconnectTimeoutId = undefined;
                reconnectAttempt += 1;
                spawnPlayer();
            }, delay);
        };

        const spawnPlayer = () => {
            destroyPlayer();

            const onStreamStateChange = (status: StreamStatus) => {
                if (disposed || suppressStateChanges) {
                    return;
                }

                if (status.state === "streaming") {
                    clearHideTimeout();
                    clearReconnectTimeout();
                    setVisible(true);

                    // Do not reset the backoff for a connection that only
                    // survives long enough to deliver its first chunk.
                    if (stableStreamTimeoutId === undefined) {
                        stableStreamTimeoutId = setTimeout(() => {
                            stableStreamTimeoutId = undefined;
                            reconnectAttempt = 0;
                        }, STABLE_STREAM_RESET_MS);
                    }
                } else if (status.state === "stalled") {
                    clearHideTimeout();
                    clearStableStreamTimeout();
                    scheduleReconnect();
                } else {
                    clearStableStreamTimeout();
                    if (hideTimeoutId === undefined) {
                        hideTimeoutId = setTimeout(() => {
                            hideTimeoutId = undefined;
                            if (!disposed) {
                                setVisible(false);
                            }
                        }, HIDE_DEBOUNCE_MS);
                    }

                    if (status.state === "closed" || status.state === "error") {
                        scheduleReconnect();
                    }
                }
            };

            const options: JSMpegOptions = {
                source: FetchSource,
                canvas: canvas,
                autoplay: true,
                audio: false,
                // Reconnection is managed here so repeated failures back off
                // instead of hitting the robot once per second forever.
                reconnectInterval: 0,
                stallTimeout: STALL_TIMEOUT_SECONDS,
                videoWidth: width,
                videoHeight: height,
                onStreamStateChange: onStreamStateChange,
            };

            try {
                player = new Player(STREAM_URL, options);
            } catch (e) {
                scheduleReconnect();
            }
        };

        spawnPlayer();

        return () => {
            disposed = true;
            clearHideTimeout();
            clearReconnectTimeout();
            clearStableStreamTimeout();
            destroyPlayer();
        };
    }, [height, width]);

    return (
        <Box sx={{
            position: "absolute",
            inset: 0,
            bgcolor: "#000",
            overflow: "hidden",
        }}>
            <DuststreamPlaceholder dimensions={dimensions}/>
            <canvas
                ref={canvasRef}
                width={width}
                height={height}
                style={{
                    width: "100%",
                    height: "100%",
                    display: "block",
                    objectFit: "contain",
                    opacity: visible ? 1 : 0,
                    position: "relative",
                    zIndex: 1,
                }}
            />
        </Box>
    );
};

export const LegacyCameraStream = ({streamKey}: {streamKey: string}): React.ReactElement => {
    const handleIFrameLoad = (e: React.SyntheticEvent<HTMLIFrameElement>) => {
        const video = e.currentTarget.contentDocument?.querySelector("video");
        if (video) {
            video.muted = true;
            video.removeAttribute("controls");
        }
    };

    return (
        <iframe
            title="Legacy camera stream"
            src={`/streamer/stream.html?src=${encodeURIComponent(streamKey)}`}
            onLoad={handleIFrameLoad}
            style={{
                flexGrow: 1,
                width: "100%",
                height: "100%",
                border: 0,
                minHeight: "25vh",
            }}
        />
    );
};

export const DuststreamPlaceholder = ({
    dimensions,
    caption,
}: {
    dimensions: DuststreamDimensions;
    caption?: string;
}): React.ReactElement => {
    return (
        <Box sx={{
            position: "absolute",
            inset: 0,
            bgcolor: "#000",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
        }}>
            <Box sx={{
                flex: 1,
                minHeight: 0,
                display: "flex",
            }}>
                <img
                    src={getScaledConfusedPlaceholderDog(dimensions.width, dimensions.height, true)}
                    style={{
                        margin: "auto",
                        maxWidth: "100%",
                        maxHeight: "100%",
                        objectFit: "contain",
                    }}
                />
            </Box>
            {caption && (
                <Typography
                    variant="body2"
                    flexShrink={0}
                    sx={{
                        position: "absolute",
                        bottom: 0,
                        left: "50%",
                        transform: "translateX(-50%)",
                        width: "100%",
                        maxWidth: 600,
                        textAlign: "center",
                        bgcolor: "rgba(0,0,0,0.7)",
                        color: "white",
                        py: 1,
                        px: 2,
                        boxSizing: "border-box",
                        wordBreak: "break-word",
                    }}
                >
                    {caption}
                </Typography>
            )}
        </Box>
    );
};
