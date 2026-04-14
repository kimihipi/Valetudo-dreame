import {Box, Button, Grid2, Icon, Paper, Typography, styled} from "@mui/material";
import ControlsBody from "./ControlsBody";
import {
    ExpandLess as OpenIcon,
    ExpandMore as CloseIcon,
    PlayArrow as StartIcon,
    Pause as PauseIcon,
    Stop as StopIcon,
    Home as HomeIcon,
    SvgIconComponent,
} from "@mui/icons-material";
import React from "react";
import {
    BasicControlCommand,
    Capability,
    RobotAttributeClass,
    useBasicControlMutation,
    useRobotAttributeQuery,
    useRobotStatusQuery,
} from "../api";
import {useCapabilitiesSupported} from "../CapabilitiesProvider";
import {useValetudoColorsInverse} from "../hooks/useValetudoColors";
import {usePendingMapAction, useMapEditorOpen} from "../map/BaseMap";

const ActiveStates = ["cleaning", "returning", "moving"];

interface CompactButton {
    command: BasicControlCommand;
    enabled: boolean;
    Icon: SvgIconComponent;
    color: string;
}

const CollapsedHeader = (): React.ReactElement => {
    const palette = useValetudoColorsInverse();
    const {data: status} = useRobotStatusQuery();
    const {data: battery} = useRobotAttributeQuery(
        RobotAttributeClass.BatteryState,
        (attrs) => attrs[0]
    );
    const [basicControlSupported] = useCapabilitiesSupported(Capability.BasicControl);
    const {mutate: sendCommand, isPending} = useBasicControlMutation();
    const {hasPendingMapAction} = usePendingMapAction();
    const {isMapEditorOpen} = useMapEditorOpen();

    const statusText = status ? status.value.replace(/_/g, " ") : "—";

    const buttons: CompactButton[] = React.useMemo(() => {
        if (!status) {return [];}

        if (ActiveStates.includes(status.value)) {
            return [
                {command: "pause", enabled: !hasPendingMapAction && !isMapEditorOpen, Icon: PauseIcon, color: palette.yellow},
                {command: "stop", enabled: !isMapEditorOpen, Icon: StopIcon, color: palette.crimson},
            ];
        }

        if (status.value === "paused") {
            return [
                {command: "start", enabled: !hasPendingMapAction && !isMapEditorOpen, Icon: StartIcon, color: palette.green},
                {command: "stop", enabled: !isMapEditorOpen, Icon: StopIcon, color: palette.crimson},
            ];
        }

        return [
            {command: "start", enabled: !hasPendingMapAction && !isMapEditorOpen, Icon: StartIcon, color: palette.green},
            {command: "home", enabled: status.value !== "docked" && !isMapEditorOpen, Icon: HomeIcon, color: palette.teal},
        ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status, palette, hasPendingMapAction, isMapEditorOpen]);

    return (
        <>
            <Grid2 sx={{flexGrow: 1, display: "flex", flexDirection: "column", justifyContent: "center", pl: 2}}>
                <Typography variant="body2" sx={{textTransform: "capitalize", fontWeight: 500, lineHeight: 1.2}}>
                    {statusText}
                </Typography>
                {battery && (
                    <Typography variant="caption" color="text.secondary">
                        {battery.level}%
                    </Typography>
                )}
            </Grid2>
            {basicControlSupported && status && (
                <Grid2 sx={{display: "flex", alignItems: "center", gap: 0.5}}>
                    {buttons.map(({command, enabled, Icon, color}) => (
                        <Button
                            key={command}
                            variant="outlined"
                            disabled={!enabled || isPending}
                            onClick={(e) => { e.stopPropagation(); sendCommand(command); }}
                            sx={{
                                minWidth: 0,
                                width: "36px",
                                height: "36px",
                                p: 0,
                                color: enabled ? color : undefined,
                                borderColor: enabled ? color : undefined,
                                "&:hover": {
                                    borderColor: enabled ? color : undefined,
                                    backgroundColor: enabled ? `${color}18` : undefined,
                                },
                            }}
                        >
                            <Icon sx={{fontSize: "1.25rem"}}/>
                        </Button>
                    ))}
                </Grid2>
            )}
        </>
    );
};

const MobileControls: React.FunctionComponent<{ open: boolean, setOpen: (newOpen: boolean) => void }> = ({
    open,
    setOpen
}): React.ReactElement => {
    const StyledIcon = styled(Icon)(() => ({fontSize: "2.5em"}));
    const ControlsSheetContainer = styled(Box)(({theme}) => {
        const color = theme.palette.mode === "light" ? "#ededed" : "#242424";
        return {
            backgroundColor: color,
            borderColor: color,
            borderTopWidth: "4px",
            borderLeftWidth: "1px",
            borderRightWidth: "1px",
            borderBottomWidth: "1px",
            borderStyle: "solid",
            borderTopLeftRadius: "4px",
            borderTopRightRadius: "4px",
            paddingTop: "0.125rem",
        };
    });

    return (
        <Paper sx={{height: "100%"}}>
            <ControlsSheetContainer
                style={{
                    display: open ? "" : "none",
                    height: "calc(95% - 68px)",
                }}
            >
                <Box p={1} sx={{overflow: open ? "scroll" : "hidden", height: "100%"}}>
                    <ControlsBody/>
                </Box>
            </ControlsSheetContainer>
            <Grid2
                container
                direction="row"
                alignItems="center"
                sx={{height: "68px"}}
                onClick={() => setOpen(!open)}
            >
                <CollapsedHeader/>
                <Grid2>
                    <Box px={2} pt={2} pb={1}>
                        <StyledIcon as={open ? CloseIcon : OpenIcon}/>
                    </Box>
                </Grid2>
            </Grid2>
        </Paper>
    );
};

export default MobileControls;
