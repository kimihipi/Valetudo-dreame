import {Box, Grid2, Paper} from "@mui/material";
import {Capability} from "../api";
import {useCapabilitiesSupported} from "../CapabilitiesProvider";
import RobotStatus from "./RobotStatus";
import Dock from "./Dock";
import React from "react";
import CameraStream from "./CameraStream";
import MultipleMap from "./MultipleMap";

const ControlsBody = (): React.ReactElement => {
    const [
        triggerEmptySupported,
        mopDockCleanTriggerSupported,
        mopDockDryTriggerSupported,
    ] = useCapabilitiesSupported(
        Capability.AutoEmptyDockManualTrigger,
        Capability.MopDockCleanManualTrigger,
        Capability.MopDockDryManualTrigger,
    );

    const [cameraVisible, setCameraVisible] = React.useState(false);

    return (
        <Grid2 container spacing={1.5} direction="column" sx={{userSelect: "none"}}>
            <Paper style={{display: !cameraVisible ? "none" : undefined, position: "relative"}}>
                <Box px={1.5} py={1.5}>
                    <CameraStream iframeStyle={{minHeight: "25vh"}} setVisible={setCameraVisible} />
                </Box>
            </Paper>

            <RobotStatus />

            {
                (triggerEmptySupported || mopDockCleanTriggerSupported || mopDockDryTriggerSupported) &&
                <Dock/>
            }

            <MultipleMap />
        </Grid2>
    );
};

export default ControlsBody;
