import {Box, Grid2, Paper} from "@mui/material";
import {Capability} from "../api";
import {useCapabilitiesSupported} from "../CapabilitiesProvider";
import RobotStatus from "./RobotStatus";
import DockCard from "./DockCard";
import React from "react";
import CameraStream from "./CameraStream";
import MapCard from "./MapCard";

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
                <DockCard/>
            }

            <MapCard />
        </Grid2>
    );
};

export default ControlsBody;
