import {Box, Button, CircularProgress, styled, Typography, useTheme} from "@mui/material";
import {
    Capability,
    useRobotMapQuery,
    useRobotStatusQuery
} from "../api";
import {useCapabilitiesSupported} from "../CapabilitiesProvider";
import EditMap, { mode } from "./EditMap";
import {SegmentEditHelp} from "./res/SegmentEditHelp";
import {VirtualRestrictionEditHelp} from "./res/VirtualRestrictionEditHelp";
import {VirtualThresholdEditHelp} from "./res/VirtualThresholdEditHelp";
import {CurtainEditHelp} from "./res/CurtainEditHelp";
import {useSnackbar} from "notistack";
import React from "react";


const Container = styled(Box)({
    flex: "1",
    height: "100%",
    display: "flex",
    flexFlow: "column",
    justifyContent: "center",
    alignItems: "center",
});

const EditMapPage = (props: {
    mode: mode;
    modeSwitcher?: React.ReactNode;
}): React.ReactElement => {
    const {
        data: mapData,
        isPending: mapIsPending,
        isError: mapLoadError,
        refetch: refetchMap
    } = useRobotMapQuery();
    const {
        data: robotStatus,
        isPending: robotStatusPending
    } = useRobotStatusQuery();

    const [
        combinedVirtualRestrictionsCapabilitySupported,
        combinedVirtualThresholdsCapabilitySupported,
        curtainsCapabilitySupported,

        mapSegmentEditCapabilitySupported,
        mapSegmentRenameCapabilitySupported,
        mapSegmentMaterialControlCapabilitySupported,
        mapSegmentHideCapabilitySupported,
        mapSegmentCleanOrderCapabilitySupported,
    ] = useCapabilitiesSupported(
        Capability.CombinedVirtualRestrictions,
        Capability.CombinedVirtualThresholds,
        Capability.Curtains,

        Capability.MapSegmentEdit,
        Capability.MapSegmentRename,
        Capability.MapSegmentMaterialControl,
        Capability.MapSegmentHide,
        Capability.MapSegmentCleanOrder,
    );

    const theme = useTheme();
    const {enqueueSnackbar} = useSnackbar();

    let helpText = "";

    if (props.mode === "segments") {
        helpText = SegmentEditHelp;
    } else if (props.mode === "virtual_restrictions") {
        helpText = VirtualRestrictionEditHelp;
    } else if (props.mode === "virtual_thresholds") {
        helpText = VirtualThresholdEditHelp;
    } else if (props.mode === "curtains") {
        helpText = CurtainEditHelp;
    }

    if (mapLoadError) {
        return (
            <Container>
                <Typography color="error">Error loading map data</Typography>
                <Box m={1}/>
                <Button color="primary" variant="contained" onClick={() => {
                    return refetchMap();
                }}>
                    Retry
                </Button>
            </Container>
        );
    }

    if ((!mapData && mapIsPending) || (!robotStatus && robotStatusPending)) {
        return (
            <Container>
                <CircularProgress/>
            </Container>
        );
    }

    if (!mapData) {
        return (
            <Container>
                <Typography align="center">No map data</Typography>;
            </Container>
        );
    }

    if (!robotStatus) {
        return (
            <Container>
                <Typography align="center">No robot status</Typography>;
            </Container>
        );
    }

    return <EditMap
        rawMap={mapData}
        paletteMode={theme.palette.mode}
        mode={props.mode}
        helpText={helpText}
        robotStatus={robotStatus}
        enqueueSnackbar={enqueueSnackbar}

        supportedCapabilities={{
            [Capability.CombinedVirtualRestrictions]: combinedVirtualRestrictionsCapabilitySupported,
            [Capability.CombinedVirtualThresholds]: combinedVirtualThresholdsCapabilitySupported,
            [Capability.Curtains]: curtainsCapabilitySupported,

            [Capability.MapSegmentEdit]: mapSegmentEditCapabilitySupported,
            [Capability.MapSegmentRename]: mapSegmentRenameCapabilitySupported,
            [Capability.MapSegmentMaterialControl]: mapSegmentMaterialControlCapabilitySupported,
            [Capability.MapSegmentHide]: mapSegmentHideCapabilitySupported,
            [Capability.MapSegmentCleanOrder]: mapSegmentCleanOrderCapabilitySupported,
        }}
        modeSwitcher={props.modeSwitcher}
    />;
};

export default EditMapPage;
