import {Box, Button, CircularProgress, styled, Typography, useTheme} from "@mui/material";
import {Capability, prefetchObstacleImagesProperties, RobotAttributeClass, sendCleaningTarget, useMapSegmentationPropertiesQuery, useRobotAttributeQuery, useRobotMapQuery} from "../api";
import LiveMap from "./LiveMap";
import {useCapabilitiesSupported} from "../CapabilitiesProvider";
import React from "react";
import {useQueryClient} from "@tanstack/react-query";
import ManualControl from "../robot/ManualControl";
import {ActionButton} from "./Styled";
import {ArrowBack as ArrowBackIcon} from "@mui/icons-material";
import MapEditorPage from "./MapEditorPage";
import {useValetudoColors} from "../hooks/useValetudoColors";
import {useMapEditorOpen} from "./BaseMap";
import ActivityHistory from "../controls/ActivityHistory";

const Container = styled(Box)({
    flex: "1",
    height: "100%",
    display: "flex",
    flexFlow: "column",
    justifyContent: "center",
    alignItems: "center",
});

const LiveMapPage = (): React.ReactElement => {
    const queryClient = useQueryClient();
    const palette = useValetudoColors();
    const {
        data: mapData,
        isPending: mapIsPending,
        isError: mapLoadError,
        refetch: refetchMap
    } = useRobotMapQuery();
    const {data: cleaningTarget} = useRobotAttributeQuery(
        RobotAttributeClass.CleaningTargetState,
        attributes => attributes[0]
    );

    const [
        goToLocationCapabilitySupported,
        mapSegmentationCapabilitySupported,
        zoneCleaningCapabilitySupported,
        automaticControlCapabilitySupported,

        obstacleImagesSupported,
        manualControlSupported,
        highResManualControlSupported,
        currentStatisticsSupported,

        mapSegmentEditCapabilitySupported,
        mapSegmentRenameCapabilitySupported,
        mapSegmentCleanOrderCapabilitySupported,
        combinedVirtualRestrictionsCapabilitySupported,
    ] = useCapabilitiesSupported(
        Capability.GoToLocation,
        Capability.MapSegmentation,
        Capability.ZoneCleaning,
        Capability.AutomaticControl,

        Capability.ObstacleImages,
        Capability.ManualControl,
        Capability.HighResolutionManualControl,
        Capability.CurrentStatistics,

        Capability.MapSegmentEdit,
        Capability.MapSegmentRename,
        Capability.MapSegmentCleanOrder,
        Capability.CombinedVirtualRestrictions,
    );

    const mapEditorSupported =
        mapSegmentEditCapabilitySupported ||
        mapSegmentRenameCapabilitySupported ||
        mapSegmentCleanOrderCapabilitySupported ||
        combinedVirtualRestrictionsCapabilitySupported;

    const [manualControlOpen, setManualControlOpen] = React.useState(false);
    const [statisticsOpen, setStatisticsOpen] = React.useState(false);
    const [mapEditorOpen, setMapEditorOpen] = React.useState(false);

    React.useEffect(() => {
        useMapEditorOpen.setState({isMapEditorOpen: mapEditorOpen});
    }, [mapEditorOpen]);

    React.useEffect(() => {
        return () => {
            useMapEditorOpen.setState({isMapEditorOpen: false});
        };
    }, []);

    // If the capability is supported, we prefetch the properties now, so that the image size
    // is already available once the user opens a dialog
    // => This prevents the content from jumping around
    React.useEffect(() => {
        if (!obstacleImagesSupported) {
            return;
        }

        prefetchObstacleImagesProperties(queryClient).catch(err => {
            // eslint-disable-next-line no-console
            console.error("Prefetching obstacle image properties failed", err);
        });
    }, [obstacleImagesSupported, queryClient]);

    const {
        data: mapSegmentationProperties,
        isPending: mapSegmentationPropertiesPending
    } = useMapSegmentationPropertiesQuery(mapSegmentationCapabilitySupported);

    const theme = useTheme();

    if (mapEditorOpen) {
        return (
            <Box sx={{position: "relative", height: "100%", width: "100%", backgroundColor: `${palette.yellow}40`}}>
                <MapEditorPage/>
                <ActionButton
                    color="inherit"
                    size="small"
                    onClick={() => setMapEditorOpen(false)}
                    title="Back to Map"
                    style={{position: "absolute", top: "16px", left: "16px", zIndex: 1000, pointerEvents: "auto"}}
                    sx={{backgroundColor: palette.teal, "&:hover": {backgroundColor: palette.teal}, "& .MuiSvgIcon-root": {color: "#fff"}}}
                >
                    <ArrowBackIcon/>
                </ActionButton>
            </Box>
        );
    }

    if (manualControlOpen) {
        return (
            <Box sx={{ position: "relative", height: "100%", width: "100%", display: "flex", flexDirection: "column", justifyContent: "center", overflow: "auto" }}>
                <ManualControl />
                <ActionButton
                    color="inherit"
                    size="small"
                    onClick={() => setManualControlOpen(false)}
                    title="Back to Map"
                    style={{ position: "absolute", top: "16px", left: "16px", zIndex: 1000, pointerEvents: "auto" }}
                    sx={{backgroundColor: palette.teal, "&:hover": {backgroundColor: palette.teal}, "& .MuiSvgIcon-root": {color: "#fff"}}}
                >
                    <ArrowBackIcon/>
                </ActionButton>

            </Box>
        );
    }

    if (statisticsOpen) {
        return (
            <Box sx={{ position: "relative", height: "100%", width: "100%", overflow: "auto" }}>
                <Box sx={{ pt: 8, px: 2, pb: 2 }}>
                    <ActivityHistory />
                </Box>
                <ActionButton
                    color="inherit"
                    size="small"
                    onClick={() => setStatisticsOpen(false)}
                    title="Back to Map"
                    style={{ position: "absolute", top: "16px", left: "16px", zIndex: 1000, pointerEvents: "auto" }}
                    sx={{backgroundColor: palette.teal, "&:hover": {backgroundColor: palette.teal}, "& .MuiSvgIcon-root": {color: "#fff"}}}
                >
                    <ArrowBackIcon/>
                </ActionButton>
            </Box>
        );
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

    if (
        (!mapData && mapIsPending) ||
        (mapSegmentationCapabilitySupported && !mapSegmentationProperties && mapSegmentationPropertiesPending)
    ) {
        return (
            <Container>
                <CircularProgress/>
            </Container>
        );
    }

    if (!mapData) {
        return (
            <Container>
                <Typography align="center">No map data</Typography>
            </Container>
        );
    }

    return <LiveMap
        rawMap={mapData}
        paletteMode={theme.palette.mode}
        trackSegmentSelectionOrder={mapSegmentationProperties ? mapSegmentationProperties.customOrderSupport : false}
        cleaningTarget={cleaningTarget}
        onCleaningTargetChange={sendCleaningTarget}

        supportedCapabilities={{
            [Capability.MapSegmentation]: mapSegmentationCapabilitySupported,
            [Capability.ZoneCleaning]: zoneCleaningCapabilitySupported,
            [Capability.GoToLocation]: goToLocationCapabilitySupported,
            [Capability.AutomaticControl]: automaticControlCapabilitySupported,
        }}

        onManualControlOpen={
            (manualControlSupported || highResManualControlSupported) ?
                () => setManualControlOpen(true) :
                undefined
        }

        onStatisticsOpen={
            currentStatisticsSupported ?
                () => setStatisticsOpen(true) :
                undefined
        }

        onMapEditorOpen={
            mapEditorSupported ?
                () => setMapEditorOpen(true) :
                undefined
        }
    />;
};

export default LiveMapPage;
