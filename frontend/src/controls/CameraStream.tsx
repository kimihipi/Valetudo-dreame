import {Box, Grid2, Paper} from "@mui/material";
import React from "react";
import {
    Capability,
    useDuststreamingConfigurationQuery,
    useDuststreamingPropertiesQuery,
} from "../api";
import {useCapabilitiesSupported} from "../CapabilitiesProvider";
import {useGo2RtcStreamsQuery} from "../api/go2rtc";
import {DuststreamCanvas, LegacyCameraStream} from "../robot/Duststream";

const CameraStream = (): React.ReactElement | null => {
    const [duststreamingSupported] = useCapabilitiesSupported(Capability.Duststreaming);
    const {data: configuration} = useDuststreamingConfigurationQuery({
        enabled: duststreamingSupported,
    });
    const {data: properties} = useDuststreamingPropertiesQuery({
        enabled: duststreamingSupported,
    });
    const {
        data: legacyStreams,
        isError: legacyProbeError,
        isPending: legacyProbePending,
    } = useGo2RtcStreamsQuery();

    const legacyStreamKey = legacyProbeError ? undefined : Object.keys(legacyStreams ?? {})[0];

    const duststreamVisible = duststreamingSupported &&
        configuration?.enabled === true &&
        properties?.duststreamerInstalled === true;
    const visible = !!legacyStreamKey || (!legacyProbePending && duststreamVisible);
    const dimensions = properties ?? {width: 640, height: 480};

    if (!visible) {
        return null;
    }

    return (
        <Paper sx={{position: "relative", overflow: "hidden", flexShrink: 0}}>
            <Box px={1.5} py={1.5}>
                <Grid2
                    display="flex"
                    sx={{
                        position: "relative",
                        width: "100%",
                        aspectRatio: `${dimensions.width} / ${dimensions.height}`,
                        minHeight: "25vh",
                        flex: 1,
                        bgcolor: "#000",
                        overflow: "hidden",
                    }}
                >
                    {legacyStreamKey ? (
                        <LegacyCameraStream streamKey={legacyStreamKey}/>
                    ) : (
                        <DuststreamCanvas dimensions={dimensions}/>
                    )}
                </Grid2>
            </Box>
        </Paper>
    );
};

export default CameraStream;
