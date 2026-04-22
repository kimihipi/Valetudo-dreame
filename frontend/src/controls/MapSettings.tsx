import React from "react";
import {
    AppBar,
    Box,
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    List,
    styled,
    Toolbar,
    Typography,
    useTheme,
} from "@mui/material";
import {useCapabilitiesSupported} from "../CapabilitiesProvider";
import {Capability, useRobotMapQuery, useRobotStatusQuery} from "../api";
import {SpacerListMenuItem} from "../components/list_menu/SpacerListMenuItem";
import {SubHeaderListMenuItem} from "../components/list_menu/SubHeaderListMenuItem";
import {ButtonListMenuItem} from "../components/list_menu/ButtonListMenuItem";
import {
    Map as MapIcon,
    Build as UtilitiesIcon,
    Crop as CleanupCoverageIcon,
    Close as CloseIcon,
} from "@mui/icons-material";
import {
    IntelligentMapRecognitionControlSwitchListItem,
    MappingPassButtonItem,
    MapResetButtonItem,
    MultipleMapControlSwitchListItem,
    MultipleMapDeleteButtonItem,
    MultipleMapRenameButtonItem,
    MultipleMapRotateButtonItem,
    MultipleMapSelectListMenuItem,
    PersistentMapSwitchListItem,
    ValetudoMapDataExportButtonItem,
} from "../options/MapManagement";
import RobotCoverageMap from "../map/RobotCoverageMap";
import {RobotCoverageMapHelp} from "../map/res/RobotCoverageMapHelp";

interface MapSettingsProps {
    open: boolean;
    onClose: () => void;
}

const StyledDialog = styled(Dialog)(({theme}) => ({
    "& .MuiDialogContent-root": {
        padding: theme.spacing(2),
    },
    "& .MuiDialogActions-root": {
        padding: theme.spacing(1),
    },
}));

const CoverageMapContainer = styled(Box)({
    flex: "1",
    height: "100%",
    display: "flex",
    flexFlow: "column",
    justifyContent: "center",
    alignItems: "center",
});

const CoverageMapDialog = ({open, onClose}: {open: boolean; onClose: () => void}): React.ReactElement => {
    const {
        data: mapData,
        isPending: mapIsPending,
        isError: mapLoadError,
        refetch: refetchMap,
    } = useRobotMapQuery();
    const {
        data: robotStatus,
        isPending: robotStatusPending,
    } = useRobotStatusQuery();
    const theme = useTheme();

    const renderContent = () => {
        if (mapLoadError) {
            return (
                <CoverageMapContainer>
                    <Typography color="error">Error loading map data</Typography>
                    <Box m={1}/>
                    <Button color="primary" variant="contained" onClick={() => refetchMap()}>
                        Retry
                    </Button>
                </CoverageMapContainer>
            );
        }
        if ((!mapData && mapIsPending) || (!robotStatus && robotStatusPending)) {
            return (
                <CoverageMapContainer>
                    <CircularProgress/>
                </CoverageMapContainer>
            );
        }
        if (!mapData) {
            return (
                <CoverageMapContainer>
                    <Typography align="center">No map data</Typography>
                </CoverageMapContainer>
            );
        }
        if (!robotStatus) {
            return (
                <CoverageMapContainer>
                    <Typography align="center">No robot status</Typography>
                </CoverageMapContainer>
            );
        }
        return (
            <RobotCoverageMap
                rawMap={mapData}
                paletteMode={theme.palette.mode}
                helpText={RobotCoverageMapHelp}
            />
        );
    };

    return (
        <Dialog fullScreen open={open} onClose={onClose}>
            <AppBar position="relative">
                <Toolbar>
                    <IconButton edge="start" color="inherit" onClick={onClose} aria-label="close">
                        <CloseIcon/>
                    </IconButton>
                    <Typography variant="h6" sx={{ml: 2}}>
                        Robot Coverage Map
                    </Typography>
                </Toolbar>
            </AppBar>
            <Box sx={{display: "flex", flexDirection: "column", flex: 1, height: "calc(100% - 64px)"}}>
                {renderContent()}
            </Box>
        </Dialog>
    );
};

const MapSettings = (props: MapSettingsProps): React.ReactElement => {
    const {open, onClose} = props;
    const [coverageMapOpen, setCoverageMapOpen] = React.useState(false);

    const [
        multipleMapCapabilitySupported,
        multipleMapRenameCapabilitySupported,
        multipleMapRotateCapabilitySupported,
        multipleMapDeleteCapabilitySupported,
        multipleMapControlCapabilitySupported,
        intelligentMapRecognitionControlCapabilitySupported,
        persistentMapControlCapabilitySupported,
        mappingPassCapabilitySupported,
        mapResetCapabilitySupported,
    ] = useCapabilitiesSupported(
        Capability.MultipleMap,
        Capability.MultipleMapRename,
        Capability.MultipleMapRotate,
        Capability.MultipleMapDelete,
        Capability.MultipleMapControl,
        Capability.IntelligentMapRecognitionControl,
        Capability.PersistentMapControl,
        Capability.MappingPass,
        Capability.MapReset
    );

    const hasMapManagementItems =
        multipleMapCapabilitySupported ||
        multipleMapRenameCapabilitySupported ||
        multipleMapRotateCapabilitySupported ||
        multipleMapDeleteCapabilitySupported ||
        multipleMapControlCapabilitySupported ||
        intelligentMapRecognitionControlCapabilitySupported ||
        persistentMapControlCapabilitySupported ||
        mappingPassCapabilitySupported ||
        mapResetCapabilitySupported;

    return (
        <>
            <StyledDialog open={open} onClose={onClose} fullWidth maxWidth="sm">
                <DialogTitle>Map Settings</DialogTitle>
                <DialogContent>
                    <List>
                        {hasMapManagementItems && (
                            <>
                                <SubHeaderListMenuItem
                                    icon={<MapIcon/>}
                                    primaryLabel="Map Management"
                                />
                                {multipleMapCapabilitySupported && <MultipleMapSelectListMenuItem/>}
                                {multipleMapRenameCapabilitySupported && <MultipleMapRenameButtonItem/>}
                                {multipleMapRotateCapabilitySupported && <MultipleMapRotateButtonItem/>}
                                {multipleMapDeleteCapabilitySupported && <MultipleMapDeleteButtonItem/>}
                                {multipleMapControlCapabilitySupported && <MultipleMapControlSwitchListItem/>}
                                {intelligentMapRecognitionControlCapabilitySupported && <IntelligentMapRecognitionControlSwitchListItem/>}
                                {persistentMapControlCapabilitySupported && <PersistentMapSwitchListItem/>}
                                {mappingPassCapabilitySupported && <MappingPassButtonItem/>}
                                {mapResetCapabilitySupported && <MapResetButtonItem/>}
                                <SpacerListMenuItem/>
                            </>
                        )}
                        <SubHeaderListMenuItem
                            icon={<UtilitiesIcon/>}
                            primaryLabel="Map Utilities"
                        />
                        <ButtonListMenuItem
                            primaryLabel="Robot Coverage Map"
                            secondaryLabel="Check the robot's coverage"
                            icon={<CleanupCoverageIcon/>}
                            buttonLabel="Open"
                            action={() => setCoverageMapOpen(true)}
                            actionLoading={false}
                        />
                        <ValetudoMapDataExportButtonItem/>
                    </List>
                </DialogContent>
                <DialogActions>
                    <Button onClick={onClose}>Close</Button>
                </DialogActions>
            </StyledDialog>
            <CoverageMapDialog
                open={coverageMapOpen}
                onClose={() => setCoverageMapOpen(false)}
            />
        </>
    );
};

export default MapSettings;
