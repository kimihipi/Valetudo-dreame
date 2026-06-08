import { Grid2 } from "@mui/material";
import React from "react";
import { useGo2RtcStreamsQuery, useStreamerStateQuery } from "../api/go2rtc";

const CameraStream = (props: { iframeStyle?: React.CSSProperties; setVisible?: (value: boolean) => void }): React.ReactElement => {
    const { iframeStyle, setVisible } = props;
    const { data: streamerState } = useStreamerStateQuery();
    const { data: streams } = useGo2RtcStreamsQuery(streamerState);

    const firstStreamKey = React.useMemo(() => {
        // When SSE-managed and stopped, hide immediately without waiting for stale stream data to clear
        if ((streamerState?.managed ?? false) && !(streamerState?.running ?? false)) {
            return undefined;
        }
        return Object.keys(streams ?? {}).at(0);
    }, [streamerState, streams]);

    React.useEffect(() => {
        setVisible?.(!!firstStreamKey);
    }, [firstStreamKey, setVisible]);

    const handleIFrameLoad = (e: React.SyntheticEvent<HTMLIFrameElement>) => {
        const video = e.currentTarget.contentDocument?.querySelector("video");
        if (video) {
            video.muted = true;
            video.removeAttribute("controls");
        }
    };

    if (!firstStreamKey) {
        return <></>;
    }

    return (
        <Grid2 display="flex" sx={{minHeight: 0, flex: 1}}>
            <iframe
                style={{flexGrow: 1, border: 0, height: "100%", ...iframeStyle}}
                src={`/streamer/stream.html?src=${firstStreamKey}`}
                onLoad={handleIFrameLoad}
            />
        </Grid2>
    );
};

export default CameraStream;
