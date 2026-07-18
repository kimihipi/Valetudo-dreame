import {Box, Button, Grid2, IconButton, LinearProgress, Paper, Popover, Typography} from "@mui/material";
import {
    AutoMode as AutomaticModeIcon,
    ArrowForward as RoomProgressIcon,
    BatteryChargingFull,
    CropSquare as ZoneModeIcon,
    Dashboard as SegmentModeIcon,
    Home as HomeIcon,
    LocationOn as GoToModeIcon,
    MoreHoriz as MoreSettingsIcon,
    Pause as PauseIcon,
    PlayArrow as StartIcon,
    Schedule as TimeRemainingIcon,
    SelectAll as AllModeIcon,
    Stop as StopIcon,
    SvgIconComponent,
} from "@mui/icons-material";
import React from "react";
import {
    BasicControlCommand,
    Capability,
    RawMapLayerType,
    RobotAttributeClass,
    useAutomaticControlAttributeQuery,
    useAutomaticSubModeControlAttributeQuery,
    useBasicControlMutation,
    useCleanRouteQuery,
    useGoToMutation,
    useRobotAttributeQuery,
    useRobotMapQuery,
    useRobotStatusQuery,
    useStartCleaningTargetMutation,
} from "../api";
import {useCapabilitiesSupported} from "../CapabilitiesProvider";
import {DeepRouteIcon, IntensiveRouteIcon, NormalRouteIcon, QuickRouteIcon} from "./CustomIcons";
import {useIsMobileView} from "../hooks";
import {useValetudoColorsInverse} from "../hooks/useValetudoColors";
import {useMapEditorOpen, usePendingMapAction} from "../map/BaseMap";
import {useLiveMapMode} from "../map/LiveMap";
import {getPresetIconOrLabel, presetFriendlyNames} from "../presetUtils";
import {getStatusColor, isNewCleaningStartBlocked, STATUS_FLAG_LABELS, STATUS_LABELS} from "../utils";
import {getBatteryColor, getBatteryIcon} from "../controls/RobotStatus";

export const GLOBAL_CONTROLS_BAR_HEIGHT = 96;

const ActiveStates = ["cleaning", "returning", "moving"];
const TARGET_STATUS_FLAGS = new Set(["zone", "segment", "spot", "target"]);
const CHIP_ICON_STYLE: React.CSSProperties = {height: "0.95rem", width: "auto"};
const CHIP_ICON_SX = {fontSize: "0.95rem"} as const;
const BAR_ROW_HEIGHT = 28;
const ROUTE_ICONS: Record<string, React.ComponentType<{style?: React.CSSProperties}>> = {
    quick: QuickRouteIcon,
    routine: NormalRouteIcon,
    intensive: IntensiveRouteIcon,
    deep: DeepRouteIcon,
};
const TARGET_MODE_ICONS: Record<string, SvgIconComponent> = {
    all: AllModeIcon,
    segments: SegmentModeIcon,
    zones: ZoneModeIcon,
    automatic: AutomaticModeIcon,
    goto: GoToModeIcon,
};
const formatRemainingTime = (seconds: number): string => {
    const minutes = Math.ceil(seconds / 60);
    if (minutes < 1) {
        return "< 1 min";
    }
    if (minutes < 60) {
        return `${minutes} min`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ?
        `${hours}h ${remainingMinutes}m` : `${hours}h`;
};

interface CompactButton {
    command: BasicControlCommand;
    enabled: boolean;
    Icon: SvgIconComponent;
    color: string;
    label: string;
}

interface GlobalControlsBarProps {
    onDrawerToggle?: () => void;
}

const SettingChip = ({icon, label, color}: {icon: React.ReactNode; label: string; color?: string}): React.ReactElement => (
    <Box
        sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 0.375,
            minWidth: 0,
            maxWidth: 150,
            color: color,
        }}
    >
        <Box sx={{display: "flex", alignItems: "center", flexShrink: 0}}>{icon}</Box>
        <Typography
            variant="caption"
            noWrap
            sx={{color: color ?? "text.secondary", fontWeight: 600, lineHeight: 1.4, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis"}}
        >
            {label}
        </Typography>
    </Box>
);

const InlineStat = ({icon, label}: {icon?: React.ReactNode; label: string}): React.ReactElement => (
    <Box sx={{display: "inline-flex", alignItems: "center", gap: 0.25, minWidth: 0, color: "text.secondary"}}>
        {icon && <Box sx={{display: "flex", alignItems: "center", flexShrink: 0}}>{icon}</Box>}
        <Typography variant="caption" color="text.secondary" noWrap sx={{lineHeight: 1.4, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis"}}>{label}</Typography>
    </Box>
);

const GlobalControlsBar = ({onDrawerToggle}: GlobalControlsBarProps): React.ReactElement => {
    const [settingsAnchor, setSettingsAnchor] = React.useState<HTMLElement | null>(null);
    const mobileView = useIsMobileView();
    const palette = useValetudoColorsInverse();
    const {data: status} = useRobotStatusQuery();
    const {data: map} = useRobotMapQuery();
    const {data: battery} = useRobotAttributeQuery(RobotAttributeClass.BatteryState, attrs => attrs[0]);
    const {data: dockStatus} = useRobotAttributeQuery(RobotAttributeClass.DockStatusState, attrs => attrs[0]);
    const {data: task} = useRobotAttributeQuery(RobotAttributeClass.ActiveCleaningTaskState, attrs => attrs[0]);
    const {data: cleaningTarget} = useRobotAttributeQuery(
        RobotAttributeClass.CleaningTargetState, attrs => attrs[0]
    );
    const {data: cleaningCommand} = useRobotAttributeQuery(
        RobotAttributeClass.CleaningCommandState, attrs => attrs[0]
    );
    const {data: fanPreset} = useRobotAttributeQuery(
        RobotAttributeClass.PresetSelectionState,
        attrs => attrs.find(attr => attr.type === "fan_speed")
    );
    const {data: waterPreset} = useRobotAttributeQuery(
        RobotAttributeClass.PresetSelectionState,
        attrs => attrs.find(attr => attr.type === "water_grade")
    );
    const {data: operationModePreset} = useRobotAttributeQuery(
        RobotAttributeClass.PresetSelectionState,
        attrs => attrs.find(attr => attr.type === "operation_mode")
    );
    const {data: automaticPreset} = useAutomaticControlAttributeQuery();
    const {data: automaticSubMode} = useAutomaticSubModeControlAttributeQuery();
    const [basicControlSupported, cleanRouteSupported] = useCapabilitiesSupported(
        Capability.BasicControl,
        Capability.CleanRouteControl
    );
    const {data: cleanRoute} = useCleanRouteQuery(cleanRouteSupported);
    const {mutate: sendCommand, isPending} = useBasicControlMutation();
    const {mutate: startCleaningTarget, isPending: startTargetPending} = useStartCleaningTargetMutation();
    const pendingMapAction = usePendingMapAction();
    const {mutate: sendGoTo, isPending: goToPending} = useGoToMutation({
        onSuccess: () => pendingMapAction.clearAction?.()
    });
    const {isMapEditorOpen} = useMapEditorOpen();
    const {mode: liveMapMode} = useLiveMapMode();

    const activity = status?.value ?? (task?.state === "running" ? "cleaning" : task?.state);
    const activityLabel = activity ? STATUS_LABELS[activity] ?? activity.replaceAll("_", " ") : "—";
    const statusFlag = status?.flag && status.flag !== "none" && !TARGET_STATUS_FLAGS.has(status.flag) ?
        STATUS_FLAG_LABELS[status.flag] ?? status.flag.replaceAll("_", " ") : null;
    const activityColor = getStatusColor(activity, palette);
    const BatteryIcon = battery?.flag === "charging" ? BatteryChargingFull :
        battery ? getBatteryIcon(battery.level) : null;
    const batteryColor = battery ? getBatteryColor(battery.level, palette) : undefined;
    const taskFinished = task !== undefined && ["completed", "cancelled", "stopped", "failed"].includes(task.state);
    const taskActive = task !== undefined && !taskFinished;
    const taskRunning = task?.state === "running";
    const completedPercent = taskActive ? task.progress.completedPercent : undefined;
    const hasProgress = typeof completedPercent === "number";
    const remainingSeconds = taskActive ? task.progress.estimatedRemainingSeconds : undefined;
    const automaticActive = automaticPreset?.value !== undefined && automaticPreset.value !== "off";
    const selectedLiveMapMode = liveMapMode === "none" ? null : liveMapMode;
    const backendTargetMode = cleaningTarget?.value && cleaningTarget.value !== "none" ?
        cleaningTarget.value : null;
    const targetMode = taskActive ? (automaticActive ? "automatic" : task.target.type) :
        selectedLiveMapMode ?? backendTargetMode ?? "all";
    const targetModeLabel = targetMode === "goto" ? "Go To" :
        targetMode.charAt(0).toUpperCase() + targetMode.slice(1);
    const mapSegmentCount = map?.layers.filter(layer =>
        layer.type === RawMapLayerType.Segment && !layer.metaData.hidden
    ).length;
    const totalRooms = taskActive ? task.progress.totalRooms ?? 0 :
        targetMode === "segments" ? pendingMapAction.selectionCount || cleaningTarget?.segmentIds.length || 0 :
            0;
    const selectedCount = targetMode === "segments" ?
        pendingMapAction.selectionCount || cleaningTarget?.segmentIds.length || 0 :
        targetMode === "zones" ?
            pendingMapAction.selectionCount || cleaningTarget?.zones.length || 0 :
            targetMode === "goto" ? pendingMapAction.selectionCount : 0;
    const currentRoomNumber = taskActive ? task.progress.currentRoomNumber : null;
    const automaticLevelValue = automaticPreset?.value !== undefined && automaticPreset.value !== "off" ?
        automaticPreset.value : "routine";
    const automaticLevel = presetFriendlyNames[automaticLevelValue] ?? automaticLevelValue;
    const goToActive = targetMode === "goto" && status?.value === "moving";
    let targetDetailText: string;
    if (goToActive) {
        targetDetailText = "In Progress";
    } else if (taskActive) {
        if (targetMode === "automatic") {
            targetDetailText = automaticLevel;
        } else if (targetMode === "zones" && selectedCount > 0) {
            targetDetailText = `${selectedCount} Selected`;
        } else if (["all", "segments"].includes(targetMode) && totalRooms > 0 &&
            typeof currentRoomNumber === "number") {
            targetDetailText = `Cleaning ${currentRoomNumber} of ${totalRooms}`;
        } else if (typeof completedPercent === "number") {
            targetDetailText = `${Math.round(completedPercent)}% Complete`;
        } else {
            targetDetailText = "In Progress";
        }
    } else if (targetMode === "all") {
        targetDetailText = mapSegmentCount === undefined ? "— Segments" :
            `${mapSegmentCount} ${mapSegmentCount === 1 ? "Segment" : "Segments"}`;
    } else if (targetMode === "automatic") {
        targetDetailText = automaticLevel;
    } else {
        targetDetailText = `${selectedCount} Selected`;
    }
    const RouteIcon = cleanRoute ? ROUTE_ICONS[cleanRoute] : undefined;
    const TargetModeIcon = TARGET_MODE_ICONS[targetMode] ?? AllModeIcon;
    const cleaningMode = automaticActive ? automaticSubMode?.value : operationModePreset?.value;
    const hasAdditionalSettings = Boolean(fanPreset?.value || waterPreset?.value || (cleanRoute && RouteIcon));
    const commandInFlight = cleaningCommand?.state === "pending" || cleaningCommand?.state === "accepted";
    const stagedTargetReady = cleaningTarget?.value === targetMode &&
        cleaningTarget.revision === pendingMapAction.targetRevision && pendingMapAction.draftReady;
    const draftReady = targetMode === "segments" || targetMode === "zones" ?
        selectedCount > 0 && stagedTargetReady : targetMode === "goto" ?
            pendingMapAction.goToTarget !== null : stagedTargetReady;
    const newCleaningStartBlocked = isNewCleaningStartBlocked(status, dockStatus, task);

    const buttons: CompactButton[] = React.useMemo(() => {
        if (!status) {
            return [];
        }
        if (ActiveStates.includes(status.value)) {
            return [
                {command: "pause", label: "Pause", enabled: !isMapEditorOpen, Icon: PauseIcon, color: palette.yellow},
                {command: "stop", label: "Stop", enabled: !isMapEditorOpen, Icon: StopIcon, color: palette.crimson},
            ];
        }
        if (status.value === "paused") {
            return [
                {command: "start", label: status.flag === "resumable" && !pendingMapAction.hasPendingMapAction ?
                    "Resume" : "Start", enabled: draftReady && !newCleaningStartBlocked && !isMapEditorOpen,
                Icon: StartIcon, color: palette.green},
                {command: "stop", label: "Stop", enabled: !isMapEditorOpen, Icon: StopIcon, color: palette.crimson},
            ];
        }
        return [
            {command: "start", label: "Start", enabled: draftReady && !newCleaningStartBlocked && !isMapEditorOpen,
                Icon: StartIcon, color: palette.green},
            {command: "home", label: "Dock", enabled: status.value !== "docked" && !isMapEditorOpen, Icon: HomeIcon, color: palette.teal},
        ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status, palette, pendingMapAction.hasPendingMapAction, draftReady, newCleaningStartBlocked, isMapEditorOpen]);

    return (
        <>
            <Paper sx={{height: `${GLOBAL_CONTROLS_BAR_HEIGHT}px`, flexShrink: 0, position: "relative"}}>
                <Grid2
                    container
                    direction="row"
                    wrap="nowrap"
                    alignItems="center"
                    onClick={onDrawerToggle}
                    sx={{height: "100%", pr: 2, cursor: onDrawerToggle ? "pointer" : "default"}}
                >
                    <Grid2
                        sx={{
                            flexGrow: 1,
                            minWidth: 0,
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "center",
                            alignItems: "flex-start",
                            gap: 0,
                            px: 2,
                            textAlign: "left",
                        }}
                    >
                        <Box sx={{display: "flex", justifyContent: "flex-start", alignItems: "center", height: BAR_ROW_HEIGHT, minWidth: 0, maxWidth: "100%"}}>
                            <Typography variant="body2" noWrap sx={{fontWeight: 600, lineHeight: 1.4, color: activityColor, textTransform: "capitalize", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis"}}>
                                {activityLabel}
                                {statusFlag && (
                                    <Typography component="span" variant="caption" color="text.secondary" sx={{lineHeight: "inherit", textTransform: "none"}}>
                                        {` — ${statusFlag}`}
                                    </Typography>
                                )}
                            </Typography>
                        </Box>
                        <Box sx={{display: "flex", justifyContent: "flex-start", alignItems: "center", gap: 1, height: BAR_ROW_HEIGHT, minWidth: 0, maxWidth: "100%", overflow: "hidden"}}>
                            <InlineStat icon={<TargetModeIcon sx={CHIP_ICON_SX}/>} label={targetModeLabel}/>
                            <InlineStat icon={<RoomProgressIcon sx={CHIP_ICON_SX}/>} label={targetDetailText}/>
                            {targetMode !== "goto" && (
                                <InlineStat
                                    icon={<TimeRemainingIcon sx={CHIP_ICON_SX}/>}
                                    label={taskActive && typeof remainingSeconds === "number" ?
                                        formatRemainingTime(remainingSeconds) : "—"}
                                />
                            )}
                        </Box>
                        <Box sx={{display: "flex", justifyContent: "flex-start", alignItems: "center", gap: 1.25, height: BAR_ROW_HEIGHT, minWidth: 0, maxWidth: "100%", overflow: "hidden"}}>
                            {battery && BatteryIcon && (
                                <Box sx={{flexShrink: 0, minWidth: 0}}>
                                    <SettingChip icon={<BatteryIcon sx={CHIP_ICON_SX}/>} label={`${Math.round(battery.level)}%`} color={batteryColor}/>
                                </Box>
                            )}
                            {cleaningMode && (
                                <Box sx={{flexShrink: 1, minWidth: 0}}>
                                    <SettingChip
                                        icon={getPresetIconOrLabel(Capability.OperationModeControl, cleaningMode, {...CHIP_ICON_STYLE, color: palette.teal})}
                                        label={presetFriendlyNames[cleaningMode] ?? cleaningMode}
                                        color={palette.teal}
                                    />
                                </Box>
                            )}
                            {hasAdditionalSettings && (
                                <IconButton
                                    size="small"
                                    aria-label="More Cleaning Settings"
                                    onClick={event => {
                                        event.stopPropagation();
                                        setSettingsAnchor(event.currentTarget);
                                    }}
                                    sx={{width: BAR_ROW_HEIGHT, height: BAR_ROW_HEIGHT, color: "text.secondary"}}
                                >
                                    <MoreSettingsIcon fontSize="small"/>
                                </IconButton>
                            )}
                        </Box>
                    </Grid2>
                    {basicControlSupported && status && (
                        <Grid2 sx={{display: "flex", alignItems: "center", gap: 0.5, flexShrink: 0}}>
                            {buttons.map(({command, enabled, Icon, color, label}) => (
                                <Button
                                    key={command}
                                    variant="outlined"
                                    aria-label={label}
                                    disabled={!enabled || isPending || startTargetPending || goToPending || commandInFlight}
                                    onClick={event => {
                                        event.stopPropagation();
                                        if (command === "start" && targetMode === "goto" &&
                                            pendingMapAction.goToTarget) {
                                            sendGoTo(pendingMapAction.goToTarget);
                                        } else if (command === "start" && status.value !== "paused" &&
                                            pendingMapAction.targetRevision !== null) {
                                            startCleaningTarget(pendingMapAction.targetRevision);
                                        } else {
                                            sendCommand(command);
                                        }
                                    }}
                                    sx={{
                                        minWidth: mobileView ? 0 : "104px",
                                        width: mobileView ? "44px" : "104px",
                                        height: "44px",
                                        px: mobileView ? 0 : 1.5,
                                        py: 0,
                                        color: enabled ? color : undefined,
                                        borderColor: enabled ? color : undefined,
                                        "&:hover": {
                                            borderColor: enabled ? color : undefined,
                                            backgroundColor: enabled ? `${color}18` : undefined,
                                        },
                                    }}
                                >
                                    <Icon sx={{fontSize: "1.25rem", ml: mobileView ? 0 : -1, mr: mobileView ? 0 : 0.75}}/>
                                    {!mobileView && label}
                                </Button>
                            ))}
                        </Grid2>
                    )}
                </Grid2>
                <LinearProgress
                    variant="determinate"
                    value={hasProgress ? completedPercent : 0}
                    sx={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        bottom: 0,
                        height: 3,
                        opacity: hasProgress ? 1 : 0,
                        backgroundColor: `${palette.teal}55`,
                        transition: "opacity 0.3s ease",
                        "@keyframes shimmer": {
                            "0%": {transform: "translateX(-100%)"},
                            "100%": {transform: "translateX(100%)"},
                        },
                        "& .MuiLinearProgress-bar": {
                            backgroundColor: palette.green,
                            transition: "transform 0.6s linear",
                            // Preserve MUI's absolute positioning: determinate progress is rendered by
                            // translating this full-width bar. It also provides the positioning context
                            // for the clipped shimmer pseudo-element.
                            position: "absolute",
                            overflow: "hidden",
                            "&::after": {
                                content: "\"\"",
                                position: "absolute",
                                inset: 0,
                                background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)",
                                animation: taskRunning ? "shimmer 1.8s linear infinite" : "none",
                                "@media (prefers-reduced-motion: reduce)": {
                                    animation: "none",
                                },
                            },
                        },
                    }}
                />
            </Paper>
            <Popover
                open={settingsAnchor !== null}
                anchorEl={settingsAnchor}
                onClose={() => setSettingsAnchor(null)}
                anchorOrigin={{vertical: "top", horizontal: "center"}}
                transformOrigin={{vertical: "bottom", horizontal: "center"}}
            >
                <Box sx={{display: "flex", flexDirection: "column", gap: 1, p: 1.5, minWidth: 150}}>
                    {fanPreset?.value && (
                        <SettingChip
                            icon={getPresetIconOrLabel(Capability.FanSpeedControl, fanPreset.value, {...CHIP_ICON_STYLE, color: palette.green})}
                            label={presetFriendlyNames[fanPreset.value] ?? fanPreset.value}
                            color={palette.green}
                        />
                    )}
                    {waterPreset?.value && (
                        <SettingChip
                            icon={getPresetIconOrLabel(Capability.WaterUsageControl, waterPreset.value, {...CHIP_ICON_STYLE, color: palette.lightBlue})}
                            label={presetFriendlyNames[waterPreset.value] ?? waterPreset.value}
                            color={palette.lightBlue}
                        />
                    )}
                    {cleanRoute && RouteIcon && (
                        <SettingChip
                            icon={<RouteIcon style={{...CHIP_ICON_STYLE, color: palette.purple}}/>}
                            label={presetFriendlyNames[cleanRoute] ?? cleanRoute}
                            color={palette.purple}
                        />
                    )}
                </Box>
            </Popover>
        </>
    );
};

export default GlobalControlsBar;
