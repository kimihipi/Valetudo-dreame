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
import {CarpetEditHelp} from "./res/CarpetEditHelp";
import {MapAnnotationsHelp} from "./res/MapAnnotationsHelp";
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
        mapAnnotationsCapabilitySupported,
        carpetZonesCapabilitySupported,

        mapSegmentEditCapabilitySupported,
        mapSegmentRenameCapabilitySupported,
        mapSegmentMaterialControlCapabilitySupported,
        mapSegmentHideCapabilitySupported,
        mapSegmentCleanOrderCapabilitySupported,
    ] = useCapabilitiesSupported(
        Capability.CombinedVirtualRestrictions,
        Capability.MapAnnotations,
        Capability.CarpetZones,

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
    } else if (props.mode === "annotations") {
        helpText = MapAnnotationsHelp;
    } else if (props.mode === "carpets") {
        helpText = CarpetEditHelp;
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
            [Capability.MapAnnotations]: mapAnnotationsCapabilitySupported,
            [Capability.CarpetZones]: carpetZonesCapabilitySupported,

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
