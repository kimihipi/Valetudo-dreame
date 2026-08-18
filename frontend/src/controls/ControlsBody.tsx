import {Grid2} from "@mui/material";
import {Capability} from "../api";
import {useCapabilitiesSupported} from "../CapabilitiesProvider";
import RobotStatus from "./RobotStatus";
import DockCard from "./DockCard";
import React from "react";
import CameraStream from "./CameraStream";
import MapCard from "./MapCard";

const ControlsBody = ({showCamera = true}: {showCamera?: boolean}): React.ReactElement => {
    const [
        triggerEmptySupported,
        mopDockCleanTriggerSupported,
        mopDockDryTriggerSupported,
    ] = useCapabilitiesSupported(
        Capability.AutoEmptyDockManualTrigger,
        Capability.MopDockCleanManualTrigger,
        Capability.MopDockDryManualTrigger,
    );

    return (
        <Grid2 container spacing={1.5} direction="column" sx={{userSelect: "none"}}>
            {showCamera && <CameraStream />}

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
