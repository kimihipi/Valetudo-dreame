import { Grid2 } from "@mui/material";
import React from "react";
import { useGo2RtcStreamsQuery } from "../api/go2rtc";

const CameraStream = (props: { iframeStyle?: React.CSSProperties; setVisible?: (value: boolean) => void }): React.ReactElement => {
    const { data: streams } = useGo2RtcStreamsQuery();
    const firstStreamKey = React.useMemo(() => Object.keys(streams ?? {}).at(0), [streams]);

    React.useEffect(() => {
        if (props.setVisible) {
            props.setVisible(!!firstStreamKey);
        }
    });

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
                style={{flexGrow: 1, border: 0, height: "100%", ...props.iframeStyle}}
                src={`/streamer/stream.html?src=${firstStreamKey}`}
                onLoad={handleIFrameLoad}
            />
        </Grid2>
    );
};

export default CameraStream;
