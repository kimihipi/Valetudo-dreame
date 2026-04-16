import {
    Box,
    Button,
    DialogContentText,
    Divider,
    Grid2,
    Icon,
    IconButton,
    LinearProgress,
    Paper,
    ToggleButton,
    ToggleButtonGroup,
    Tooltip,
    Typography,
} from "@mui/material";
import React from "react";
import {
    BasicControlCommand,
    Capability,
    CleanRoute,
    ConsumableMeta,
    ConsumableState,
    RobotAttributeClass,
    StatusState,
    useBasicControlMutation,
    useCleanRouteControlPropertiesQuery,
    useCleanRouteMutation,
    useCleanRouteQuery,
    useConsumablePropertiesQuery,
    useConsumableResetMutation,
    useConsumableStateQuery,
    useRobotAttributeQuery,
    useRobotStatusQuery,
    useSuctionBoostControlQuery,
    useSuctionBoostControlMutation,
    usePresetSelectionsQuery,
} from "../api";
import {RobotMonochromeIcon} from "../components/CustomIcons";
import ControlsCard from "./ControlsCard";
import {useValetudoColorsInverse} from "../hooks/useValetudoColors";
import {
    AppRegistration as OperationModeIcon,
    Battery0Bar,
    Battery1Bar,
    Battery2Bar,
    Battery3Bar,
    Battery4Bar,
    Battery5Bar,
    Battery6Bar,
    BatteryFull,
    BatteryChargingFull,
    CheckCircle as StatusOkIcon,
    Error as StatusErrorIcon,
    CleaningServices as MopIcon,
    ExpandLess as CloseIcon,
    ExpandMore as OpenIcon,
    Home as HomeIcon,
    Pause as PauseIcon,
    PlayArrow as StartIcon,
    Route as CleanRouteIcon,
    Settings as SettingsIcon,
    Stop as StopIcon,
    SvgIconComponent,
} from "@mui/icons-material";
import ConfirmationDialog from "../components/ConfirmationDialog";
import LoadingFade from "../components/LoadingFade";
import {usePendingMapAction, useMapEditorOpen} from "../map/BaseMap";
import {useCapabilitiesSupported} from "../CapabilitiesProvider";
import {useLiveMapMode} from "../map/LiveMap";
import MapModeControls from "./MapModeControls";
import PresetSelectionControl from "./PresetSelection";
import {DeepRouteIcon, FanSpeedMediumIcon, IntensiveRouteIcon, NormalRouteIcon, QuickRouteIcon, WaterGradeLowIcon} from "../components/CustomIcons";
import {getPresetIconOrLabel, presetFriendlyNames, sortPresets} from "../presetUtils";
import {getConsumableName} from "../utils";
import RobotSettings from "./RobotSettings";

const ActiveStates: StatusState["value"][] = ["cleaning", "returning", "moving"];

interface CommandButton {
    command: BasicControlCommand;
    enabled: boolean;
    label: string;
    Icon: SvgIconComponent;
    color: string;
}

const getBatteryIcon = (level: number): SvgIconComponent => {
    if (level < 10) {
        return Battery0Bar;
    }
    if (level < 25) {
        return Battery1Bar;
    }
    if (level < 40) {
        return Battery2Bar;
    }
    if (level < 55) {
        return Battery3Bar;
    }
    if (level < 70) {
        return Battery4Bar;
    }
    if (level < 85) {
        return Battery5Bar;
    }
    if (level < 100) {
        return Battery6Bar;
    }
    return BatteryFull;
};

const ICON_STYLE = {height: "14px", width: "auto", verticalAlign: "middle"};

interface AttachmentsSubmenuProps {
    mop: {type: string; attached: boolean} | undefined;
}

const AttachmentsSubmenu = ({mop}: AttachmentsSubmenuProps): React.ReactElement => {
    const palette = useValetudoColorsInverse();
    const [expanded, setExpanded] = React.useState(false);

    return (
        <Paper variant="outlined" sx={{mt: 1, p: 1, backgroundColor: "transparent"}}>
            <Grid2
                container
                alignItems="center"
                onClick={() => setExpanded(!expanded)}
                sx={{cursor: "pointer"}}
            >
                <Grid2 sx={{flexGrow: 1}}>
                    <Typography variant="subtitle2" sx={{ml: 0.5}}>Attachments</Typography>
                </Grid2>
                <Grid2 sx={{display: "flex", alignItems: "center"}}>
                    {!expanded && mop !== undefined && (
                        <Box sx={{display: "flex", alignItems: "center", mr: 1}}>
                            <MopIcon
                                sx={{color: mop.attached ? palette.green : "text.disabled", fontSize: "14px"}}
                            />
                        </Box>
                    )}
                    <Icon component={expanded ? CloseIcon : OpenIcon} />
                </Grid2>
            </Grid2>
            <Box sx={{display: expanded ? "block" : "none", pt: 1}}>
                {mop !== undefined && (
                    <Box sx={{display: "flex", alignItems: "center", gap: "8px", px: 0.5}}>
                        <MopIcon fontSize="small" sx={{color: mop.attached ? palette.green : "text.disabled"}} />
                        <Typography variant="body2">Mop</Typography>
                        <Typography
                            variant="caption"
                            sx={{
                                ml: "auto",
                                fontWeight: "bold",
                                color: mop.attached ? palette.green : "text.disabled",
                            }}
                        >
                            {mop.attached ? "Attached" : "Not attached"}
                        </Typography>
                    </Box>
                )}
            </Box>
        </Paper>
    );
};

const CLEAN_ROUTE_ORDER: Record<CleanRoute, number> = {
    "quick": 1, "normal": 2, "intensive": 3, "deep": 4,
};
const CLEAN_ROUTE_LABELS: Record<CleanRoute, string> = {
    "quick": "Quick", "normal": "Normal", "intensive": "Intensive", "deep": "Deep",
};
const CLEAN_ROUTE_ICON_STYLE: React.CSSProperties = {height: "14px", width: "auto"};
const CLEAN_ROUTE_ICON_COMPONENTS: Record<CleanRoute, React.ComponentType<{style?: React.CSSProperties}>> = {
    "quick": QuickRouteIcon,
    "normal": NormalRouteIcon,
    "intensive": IntensiveRouteIcon,
    "deep": DeepRouteIcon,
};

const CleanRouteControl = ({ iconColor }: { iconColor: string }): React.ReactElement => {
    const { data: currentRoute, isPending: routePending } = useCleanRouteQuery();
    const { mutate: setRoute, isPending: mutating } = useCleanRouteMutation();
    const { data: properties, isPending: propsPending } = useCleanRouteControlPropertiesQuery();
    const pending = routePending || mutating || propsPending;

    const sortedRoutes = React.useMemo(() =>
        (properties?.supportedRoutes ?? [])
            .slice()
            .sort((a, b) => (CLEAN_ROUTE_ORDER[a] ?? 99) - (CLEAN_ROUTE_ORDER[b] ?? 99)),
    [properties]
    );

    return (
        <Grid2>
            <Box sx={{display: "flex", alignItems: "center", gap: "4px", px: 0.5, pt: 0, pb: 1}}>
                <CleanRouteIcon style={{height: "14px", width: "auto", color: iconColor}} />
                <Typography variant="subtitle2">Route</Typography>
                <LoadingFade in={pending} transitionDelay={pending ? "500ms" : "0ms"} size={16}/>
                {!pending && currentRoute && (
                    <Typography variant="caption" color="text.secondary" sx={{ml: "auto", fontWeight: 600}}>
                        {CLEAN_ROUTE_LABELS[currentRoute]}
                    </Typography>
                )}
            </Box>
            <Box sx={{px: 0.5, pb: 0.5}}>
                <ToggleButtonGroup exclusive fullWidth size="small" value={currentRoute ?? null}
                    onChange={(_e, value) => {
                        if (value !== null && value !== currentRoute) {
                            setRoute(value as CleanRoute);
                        }
                    }}
                >
                    {sortedRoutes.map((r) => {
                        const RouteIcon = CLEAN_ROUTE_ICON_COMPONENTS[r];
                        return (
                            <Tooltip key={r} title={CLEAN_ROUTE_LABELS[r]} arrow>
                                <ToggleButton value={r} disabled={pending} sx={{py: 1}}>
                                    <RouteIcon style={{...CLEAN_ROUTE_ICON_STYLE, color: r === currentRoute ? iconColor : undefined}}/>
                                </ToggleButton>
                            </Tooltip>
                        );
                    })}
                </ToggleButtonGroup>
            </Box>
        </Grid2>
    );
};

interface PresetsSubmenuProps {
    operationMode: boolean;
    fanSpeed: boolean;
    waterControl: boolean;
    cleanRoute: boolean;
}

const PresetsSubmenu = ({ operationMode, fanSpeed, waterControl, cleanRoute }: PresetsSubmenuProps): React.ReactElement => {
    const palette = useValetudoColorsInverse();
    const [expanded, setExpanded] = React.useState(false);

    const {data: operationModePreset} = useRobotAttributeQuery(
        RobotAttributeClass.PresetSelectionState,
        (attrs) => attrs.find(a => a.type === "operation_mode")
    );
    const {data: fanSpeedPreset} = useRobotAttributeQuery(
        RobotAttributeClass.PresetSelectionState,
        (attrs) => attrs.find(a => a.type === "fan_speed")
    );
    const {data: waterPreset} = useRobotAttributeQuery(
        RobotAttributeClass.PresetSelectionState,
        (attrs) => attrs.find(a => a.type === "water_grade")
    );
    const [suctionBoostSupported] = useCapabilitiesSupported(Capability.SuctionBoostControl);
    const {data: suctionBoostState} = useSuctionBoostControlQuery();
    const {mutate: setSuctionBoost} = useSuctionBoostControlMutation();
    const {data: fanSpeedPresets} = usePresetSelectionsQuery(Capability.FanSpeedControl);

    const boostActive = suctionBoostState?.enabled ?? false;
    const maxFanPreset = React.useMemo(() => {
        if (!fanSpeedPresets?.length) {
            return "max";
        }
        const sorted = sortPresets(fanSpeedPresets);
        return sorted[sorted.length - 1] ?? "max";
    }, [fanSpeedPresets]);

    const modeIconStyle = React.useMemo(() => ({...ICON_STYLE, color: palette.teal}), [palette.teal]);
    const fanIconStyle = React.useMemo(() => ({...ICON_STYLE, color: palette.green}), [palette.green]);
    const waterIconStyle = React.useMemo(() => ({...ICON_STYLE, color: palette.lightBlue}), [palette.lightBlue]);

    const summaryParts = React.useMemo(() => {
        const parts: React.ReactElement[] = [];

        if (fanSpeed && fanSpeedPreset?.value) {
            parts.push(
                <Box key="fan" sx={{display: "inline-flex", alignItems: "center", gap: "3px"}}>
                    {getPresetIconOrLabel(Capability.FanSpeedControl, fanSpeedPreset.value, fanIconStyle)}
                    {presetFriendlyNames[fanSpeedPreset.value]}
                </Box>
            );
        }
        if (waterControl && waterPreset?.value) {
            parts.push(
                <Box key="water" sx={{display: "inline-flex", alignItems: "center", gap: "3px"}}>
                    {getPresetIconOrLabel(Capability.WaterUsageControl, waterPreset.value, waterIconStyle)}
                    {presetFriendlyNames[waterPreset.value]}
                </Box>
            );
        }
        return parts;
    }, [fanSpeed, fanSpeedPreset, fanIconStyle, waterControl, waterPreset, waterIconStyle]);

    return (
        <Paper variant="outlined" sx={{mt: 1, p: 1, backgroundColor: "transparent"}}>
            <Grid2
                container
                alignItems="center"
                onClick={() => setExpanded(!expanded)}
                sx={{cursor: "pointer"}}
            >
                <Grid2 sx={{flexGrow: 1}}>
                    {operationMode && operationModePreset?.value ? (
                        <Box sx={{display: "inline-flex", alignItems: "center", gap: "4px", ml: 0.5}}>
                            {getPresetIconOrLabel(Capability.OperationModeControl, operationModePreset.value, modeIconStyle)}
                            <Typography variant="subtitle2">
                                {presetFriendlyNames[operationModePreset.value]}
                            </Typography>
                        </Box>
                    ) : (
                        <Typography variant="subtitle2" sx={{ml: 0.5}}>Settings</Typography>
                    )}
                </Grid2>
                <Grid2 sx={{display: "flex", alignItems: "center"}}>
                    {!expanded && summaryParts.length > 0 && (
                        <Box sx={{display: "inline-flex", alignItems: "center", gap: "6px", mr: 1}}>
                            {summaryParts.map((part, i) => (
                                <React.Fragment key={i}>
                                    {i > 0 && (
                                        <Typography variant="caption" color="text.disabled">&middot;</Typography>
                                    )}
                                    <Typography variant="caption" color="text.secondary" component="span" sx={{display: "inline-flex", alignItems: "center", gap: "2px"}}>
                                        {part}
                                    </Typography>
                                </React.Fragment>
                            ))}
                        </Box>
                    )}
                    <Icon component={expanded ? CloseIcon : OpenIcon} />
                </Grid2>
            </Grid2>
            <Box sx={{display: expanded ? "block" : "none", pt: 1}}>
                {operationMode && (
                    <PresetSelectionControl
                        noPaper
                        noHeader
                        capability={Capability.OperationModeControl}
                        label="Mode"
                        icon={<OperationModeIcon fontSize="small" sx={{color: palette.teal}} />}
                        iconColor={palette.teal}
                    />
                )}
                {operationMode && fanSpeed && <Divider sx={{my: 1}} />}
                {fanSpeed && (
                    <PresetSelectionControl
                        noPaper
                        capability={Capability.FanSpeedControl}
                        label="Fan"
                        icon={<FanSpeedMediumIcon style={{height: "14px", width: "auto", color: palette.green}} />}
                        iconColor={palette.green}
                        onPresetReselect={suctionBoostSupported ? (value) => {
                            if (value === maxFanPreset) {
                                setSuctionBoost(!boostActive);
                            }
                        } : undefined}
                        onPresetChange={suctionBoostSupported && boostActive ? (value) => {
                            if (value !== maxFanPreset) {
                                setSuctionBoost(false);
                            }
                        } : undefined}
                        valueBadge={boostActive ? {value: maxFanPreset, color: palette.yellow} : undefined}
                    />
                )}
                {fanSpeed && waterControl && <Divider sx={{my: 1}} />}
                {waterControl && (
                    <PresetSelectionControl
                        noPaper
                        capability={Capability.WaterUsageControl}
                        label="Water"
                        icon={<WaterGradeLowIcon style={{height: "14px", width: "auto", color: palette.lightBlue}} />}
                        iconColor={palette.lightBlue}
                    />
                )}
                {(waterControl || fanSpeed || operationMode) && cleanRoute && <Divider sx={{my: 1}} />}
                {cleanRoute && (
                    <CleanRouteControl iconColor={palette.purple} />
                )}
            </Box>
        </Paper>
    );
};

const ConsumableRow = ({consumable, state, label, color}: {
    consumable: ConsumableMeta;
    state: ConsumableState | undefined;
    label: string;
    color: string;
}): React.ReactElement => {
    const {mutate: resetConsumable, isPending: resetting} = useConsumableResetMutation();
    const [confirming, setConfirming] = React.useState(false);

    const handleClick = () => {
        if (confirming) {
            resetConsumable(consumable);
            setConfirming(false);
        } else {
            setConfirming(true);
        }
    };

    React.useEffect(() => {
        if (!confirming) {
            return;
        }
        const timer = setTimeout(() => setConfirming(false), 3000);
        return () => clearTimeout(timer);
    }, [confirming]);

    const percentRemaining = React.useMemo(() => {
        if (!state || state.remaining.value <= 0) {
            return 0;
        }
        let pct: number | undefined;
        if (consumable.unit === "percent") {
            pct = state.remaining.value;
        } else if (consumable.maxValue !== undefined) {
            pct = (state.remaining.value / consumable.maxValue) * 100;
        }
        if (pct === undefined) {
            return undefined;
        }
        return Math.min(100, Math.max(0, Math.round(pct)));
    }, [consumable, state]);

    return (
        <Box sx={{display: "flex", alignItems: "center", gap: "8px", px: 0.5, py: 0.25}}>
            <Box sx={{flexGrow: 1, minWidth: 0}}>
                <Box sx={{display: "flex", alignItems: "center"}}>
                    <Typography variant="body2">
                        {getConsumableName(consumable.type, consumable.subType)}
                    </Typography>
                    <Typography variant="caption" sx={{fontWeight: "bold", color: color, ml: "auto"}}>
                        {label}
                    </Typography>
                </Box>
                {percentRemaining !== undefined && (
                    <LinearProgress
                        variant="determinate"
                        value={percentRemaining}
                        sx={{mt: 0.5, mb: 0.25}}
                    />
                )}
            </Box>
            <Button
                size="small"
                variant="outlined"
                color={confirming ? "error" : "inherit"}
                disabled={resetting || !state}
                onClick={handleClick}
                sx={{py: 0.25, minWidth: "4.5rem", fontSize: "0.7rem", flexShrink: 0}}
            >
                {confirming ? "Confirm" : "Reset"}
            </Button>
        </Box>
    );
};

const ConsumablesSubmenu = (): React.ReactElement => {
    const palette = useValetudoColorsInverse();

    const {data: consumableProperties} = useConsumablePropertiesQuery();
    const {data: consumablesData} = useConsumableStateQuery();

    const consumableRows = React.useMemo(() => {
        if (!consumableProperties || !consumablesData) {
            return [];
        }
        return consumableProperties.availableConsumables.map(consumable => ({
            consumable: consumable,
            state: consumablesData.find(e => e.type === consumable.type && e.subType === consumable.subType),
        }));
    }, [consumableProperties, consumablesData]);

    const getColor = (consumable: ConsumableMeta, state: ConsumableState | undefined): string => {
        if (!state) {
            return "text.secondary";
        }
        if (state.remaining.value <= 0) {
            return palette.red;
        }
        let pct: number | undefined;
        if (consumable.unit === "percent") {
            pct = state.remaining.value;
        } else if (consumable.maxValue !== undefined) {
            pct = (state.remaining.value / consumable.maxValue) * 100;
        }
        if (pct !== undefined && pct < 20) {
            return palette.yellow;
        }
        return palette.green;
    };

    const getLabel = (_consumable: ConsumableMeta, state: ConsumableState | undefined): string => {
        if (!state) {
            return "—";
        }
        if (state.remaining.value <= 0) {
            return "Depleted";
        }
        return state.remaining.unit === "minutes" ?
            `${Math.round(state.remaining.value / 60)}h` :
            `${state.remaining.value}%`;
    };

    const statusColor = React.useMemo(() => {
        let color = palette.green;
        for (const {consumable, state} of consumableRows) {
            const c = getColor(consumable, state);
            if (c === palette.red) {
                return palette.red;
            }
            if (c === palette.yellow) {
                color = palette.yellow;
            }
        }
        return color;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [consumableRows, palette]);

    const isOk = statusColor === palette.green;
    const [expanded, setExpanded] = React.useState<boolean>(!isOk);

    React.useEffect(() => {
        if (!isOk) {
            setExpanded(true);
        }
    }, [isOk]);

    return (
        <Paper variant="outlined" sx={{mt: 1, p: 1, backgroundColor: "transparent"}}>
            <Grid2
                container
                alignItems="center"
                onClick={() => setExpanded(!expanded)}
                sx={{cursor: "pointer"}}
            >
                <Grid2 sx={{flexGrow: 1}}>
                    <Typography variant="subtitle2" sx={{ml: 0.5}}>Consumables</Typography>
                </Grid2>
                <Grid2 sx={{display: "flex", alignItems: "center"}}>
                    {isOk ?
                        <StatusOkIcon sx={{color: statusColor, mr: 1, fontSize: "1rem"}} /> :
                        <StatusErrorIcon sx={{color: statusColor, mr: 1, fontSize: "1rem"}} />
                    }
                    <Icon component={expanded ? CloseIcon : OpenIcon} />
                </Grid2>
            </Grid2>
            <Box sx={{display: expanded ? "block" : "none", pt: 1}}>
                {consumableRows.map(({consumable, state}) => (
                    <ConsumableRow
                        key={`${consumable.type}_${consumable.subType}`}
                        consumable={consumable}
                        state={state}
                        label={getLabel(consumable, state)}
                        color={getColor(consumable, state)}
                    />
                ))}
            </Box>
        </Paper>
    );
};

export const RobotStatusCard = ({children, trailing}: {children?: React.ReactNode; trailing?: React.ReactNode}): React.ReactElement => {
    const palette = useValetudoColorsInverse();
    const {
        data: status,
        isPending: isStatusPending,
        isError: isStatusError,
    } = useRobotStatusQuery();
    const {
        data: batteries,
        isPending: isBatteryPending,
        isError: isBatteryError,
    } = useRobotAttributeQuery(RobotAttributeClass.BatteryState);
    const isPending = isStatusPending || isBatteryPending;

    const [basicControlSupported] = useCapabilitiesSupported(Capability.BasicControl);
    const [startConfirmationDialogOpen, setStartConfirmationDialogOpen] = React.useState(false);
    const {
        mutate: executeBasicControlCommand,
        isPending: basicControlIsExecuting,
    } = useBasicControlMutation();
    const {hasPendingMapAction} = usePendingMapAction();
    const {isMapEditorOpen} = useMapEditorOpen();
    const {setMode} = useLiveMapMode();

    const getBatteryColor = (level: number) => {
        if (level > 75) {
            return palette.green;
        }
        if (level > 25) {
            return palette.yellow;
        }
        return palette.red;
    };

    const sendCommand = (command: BasicControlCommand) => {
        if (command === "start" && hasPendingMapAction) {
            setStartConfirmationDialogOpen(true);
        } else if (command === "start") {
            if (setMode) {
                setMode("all");
            }
            executeBasicControlCommand(command);
        } else {
            executeBasicControlCommand(command);
        }
    };

    const headerExtra = React.useMemo(() => {
        const hasBattery = !isBatteryError && batteries && batteries.length > 0;

        if (!hasBattery) {
            return null;
        }

        return (
            <Box sx={{display: "flex", alignItems: "center", gap: "8px"}}>
                {batteries!.map((battery, index) => {
                    const color = getBatteryColor(battery.level);
                    const BatteryIcon = battery.flag === "charging" ? BatteryChargingFull : getBatteryIcon(battery.level);
                    return (
                        <Box key={index} sx={{display: "inline-flex", alignItems: "center", gap: "2px", lineHeight: 1}}>
                            <Typography component="span" variant="caption" sx={{color: color, fontWeight: 600, lineHeight: 1}}>
                                {batteries!.length > 1 ? `${index + 1}: ` : ""}{Math.round(battery.level)}%
                            </Typography>
                            <BatteryIcon sx={{color: color, fontSize: "1.25rem"}} />
                        </Box>
                    );
                })}
                {trailing}
            </Box>
        );
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [batteries, isBatteryError, palette, trailing]);

    const subtitle = React.useMemo(() => {
        if (isStatusError || !status) {
            return undefined;
        }
        return status.flag !== "none" ? `${status.value} \u2013 ${status.flag}` : status.value;
    }, [isStatusError, status]);

    const buttons: CommandButton[] = React.useMemo(() => {
        if (!status) {
            return [];
        }

        if (ActiveStates.includes(status.value)) {
            // Robot is actively doing something: Pause + Stop
            return [
                {command: "pause", enabled: true, Icon: PauseIcon, label: "Pause", color: palette.yellow},
                {command: "stop", enabled: true, Icon: StopIcon, label: "Stop", color: palette.crimson},
            ];
        }

        if (status.value === "paused") {
            // Robot is paused: Resume/Start + Stop
            return [
                {command: "start", enabled: !hasPendingMapAction, label: status.flag === "resumable" ? "Resume" : "Start", Icon: StartIcon, color: palette.green},
                {command: "stop", enabled: true, Icon: StopIcon, label: "Stop", color: palette.crimson},
            ];
        }

        // idle, docked, error, or any other state: Start + Dock
        return [
            {command: "start", enabled: !hasPendingMapAction, label: "Start", Icon: StartIcon, color: palette.green},
            {command: "home", enabled: status.value !== "docked", Icon: HomeIcon, label: "Dock", color: palette.teal},
        ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status, palette, hasPendingMapAction]);

    return (
        <>
            <ControlsCard
                icon={RobotMonochromeIcon}
                title="Robot"
                subtitle={subtitle}
                isLoading={isPending}
                pending={basicControlIsExecuting}
                headerExtra={headerExtra}
            >
                <Grid2 size="grow" container direction="column">
                    {basicControlSupported && status !== undefined && (
                        <Grid2 container direction="row" alignItems="center" sx={{flex: 1}} spacing={1} pt={1} pb={1} wrap="wrap">
                            {buttons.map(({ command, enabled, Icon, label, color }) => (
                                <Grid2 key={command} sx={{flex: 1, minWidth: "min-content"}}>
                                    <Button
                                        variant="outlined"
                                        size="medium"
                                        disabled={!enabled || basicControlIsExecuting || isMapEditorOpen}
                                        onClick={() => sendCommand(command)}
                                        sx={{
                                            width: "100%",
                                            color: enabled && !isMapEditorOpen ? color : undefined,
                                            borderColor: enabled && !isMapEditorOpen ? color : undefined,
                                            "&:hover": {
                                                borderColor: enabled && !isMapEditorOpen ? color : undefined,
                                                backgroundColor: enabled && !isMapEditorOpen ? `${color}18` : undefined,
                                            },
                                        }}
                                    >
                                        <Icon sx={{mr: 1, ml: -1, fontSize: "1.25rem"}} />{label}
                                    </Button>
                                </Grid2>
                            ))}
                        </Grid2>
                    )}
                    {children}
                </Grid2>
            </ControlsCard>

            <ConfirmationDialog
                title="Are you sure you want to start a full cleanup?"
                open={startConfirmationDialogOpen}
                onClose={() => {
                    setStartConfirmationDialogOpen(false);
                }}
                onAccept={() => {
                    if (setMode) {
                        setMode("all");
                    }
                    executeBasicControlCommand("start");
                }}>
                <DialogContentText>
                    You currently have a pending MapAction.
                    <br/>
                    <br/>
                    <strong>Hint:</strong>
                    <br/>
                    You might instead be looking for the button on the bottom right of the map.
                </DialogContentText>
            </ConfirmationDialog>
        </>
    );
};

const RobotStatus = (): React.ReactElement => {
    const [settingsDialogOpen, setSettingsDialogOpen] = React.useState(false);

    const {
        data: attachments,
    } = useRobotAttributeQuery(RobotAttributeClass.AttachmentState);

    const [
        operationMode,
        fanSpeed,
        waterControl,
        consumableMonitoringSupported,
        cleanRouteControlSupported,
    ] = useCapabilitiesSupported(
        Capability.OperationModeControl,
        Capability.FanSpeedControl,
        Capability.WaterUsageControl,
        Capability.ConsumableMonitoring,
        Capability.CleanRouteControl,
    );

    const mop = attachments?.find(a => a.type === "mop");
    const hasPresets = operationMode || fanSpeed || waterControl || cleanRouteControlSupported;

    return (
        <>
            <RobotStatusCard trailing={
                <IconButton
                    size="small"
                    onClick={() => setSettingsDialogOpen(true)}
                    sx={{color: "inherit"}}
                >
                    <SettingsIcon fontSize="small"/>
                </IconButton>
            }>
                <MapModeControls />
                {hasPresets && (
                    <PresetsSubmenu
                        operationMode={operationMode}
                        fanSpeed={fanSpeed}
                        waterControl={waterControl}
                        cleanRoute={cleanRouteControlSupported}
                    />
                )}
                {mop !== undefined && (
                    <AttachmentsSubmenu mop={mop} />
                )}
                {consumableMonitoringSupported && (
                    <ConsumablesSubmenu />
                )}
            </RobotStatusCard>
            <RobotSettings open={settingsDialogOpen} onClose={() => setSettingsDialogOpen(false)} />
        </>
    );
};

export default RobotStatus;
