import {Box, Button, Grid2, IconButton, Paper, Popover, Typography} from "@mui/material";
import {
    AutoMode as AutomaticModeIcon,
    ArrowForward as RoomProgressIcon,
    BatteryChargingFull,
    CropSquare as ZoneModeIcon,
    Dashboard as SegmentModeIcon,
    Home as HomeIcon,
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
    RobotAttributeClass,
    useAutomaticControlAttributeQuery,
    useAutomaticSubModeControlAttributeQuery,
    useBasicControlMutation,
    useCleanRouteQuery,
    useCurrentStatisticsQuery,
    useRobotAttributeQuery,
    useRobotStatusQuery,
} from "../api";
import {useCapabilitiesSupported} from "../CapabilitiesProvider";
import {DeepRouteIcon, IntensiveRouteIcon, NormalRouteIcon, QuickRouteIcon} from "./CustomIcons";
import {useValetudoColorsInverse} from "../hooks/useValetudoColors";
import {useMapEditorOpen, usePendingMapAction} from "../map/BaseMap";
import {useLiveMapMode} from "../map/LiveMap";
import {getPresetIconOrLabel, presetFriendlyNames} from "../presetUtils";
import {getStatusColor, STATUS_FLAG_LABELS, STATUS_LABELS} from "../utils";
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
    const palette = useValetudoColorsInverse();
    const {data: status} = useRobotStatusQuery();
    const {data: battery} = useRobotAttributeQuery(RobotAttributeClass.BatteryState, attrs => attrs[0]);
    const {data: task} = useRobotAttributeQuery(RobotAttributeClass.ActiveCleaningTaskState, attrs => attrs[0]);
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
    const [basicControlSupported, cleanRouteSupported, currentStatisticsSupported] = useCapabilitiesSupported(
        Capability.BasicControl,
        Capability.CleanRouteControl,
        Capability.CurrentStatistics
    );
    const {data: cleanRoute} = useCleanRouteQuery(cleanRouteSupported);
    const {data: currentStatistics, refetch: refetchCurrentStatistics} = useCurrentStatisticsQuery(
        currentStatisticsSupported
    );
    const {mutate: sendCommand, isPending} = useBasicControlMutation();
    const {hasPendingMapAction} = usePendingMapAction();
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
    const remainingSeconds = task?.progress.estimatedRemainingSeconds;
    const taskFinished = task !== undefined && ["completed", "cancelled", "stopped", "failed"].includes(task.state);
    const firmwareTotalSeconds = currentStatistics?.find(statistic => statistic.type === "time")?.value;
    const automaticActive = automaticPreset?.value !== undefined && automaticPreset.value !== "off";
    const selectedLiveMapMode = liveMapMode === "none" || liveMapMode === "goto" ? "all" : liveMapMode;
    const targetMode = task ? (automaticActive ? "automatic" : task.target.type) :
        selectedLiveMapMode;
    const targetModeLabel = targetMode.charAt(0).toUpperCase() + targetMode.slice(1);
    const completedRooms = task?.progress.completedRooms ?? 0;
    const totalRooms = task?.progress.totalRooms ?? 0;
    const currentRoomNumber = totalRooms > 0 ?
        Math.min(totalRooms, completedRooms + (task?.target.currentSegmentId ? 1 : 0)) : 0;
    const progressText = totalRooms > 0 ? `${Math.max(1, currentRoomNumber)} of ${totalRooms} Rooms` : null;
    const RouteIcon = cleanRoute ? ROUTE_ICONS[cleanRoute] : undefined;
    const TargetModeIcon = TARGET_MODE_ICONS[targetMode] ?? AllModeIcon;
    const cleaningMode = automaticActive ? automaticSubMode?.value : operationModePreset?.value;
    const hasAdditionalSettings = Boolean(fanPreset?.value || waterPreset?.value || (cleanRoute && RouteIcon));

    React.useEffect(() => {
        if (!taskFinished || !currentStatisticsSupported) {
            return;
        }
        const refreshTimer = setTimeout(() => {
            refetchCurrentStatistics().catch(() => {});
        }, 1_000);
        return () => clearTimeout(refreshTimer);
    }, [currentStatisticsSupported, refetchCurrentStatistics, task?.id, taskFinished]);

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
                {command: "start", label: status.flag === "resumable" ? "Resume" : "Start", enabled: !hasPendingMapAction && !isMapEditorOpen, Icon: StartIcon, color: palette.green},
                {command: "stop", label: "Stop", enabled: !isMapEditorOpen, Icon: StopIcon, color: palette.crimson},
            ];
        }
        return [
            {command: "start", label: "Start", enabled: !hasPendingMapAction && !isMapEditorOpen, Icon: StartIcon, color: palette.green},
            {command: "home", label: "Dock", enabled: status.value !== "docked" && !isMapEditorOpen, Icon: HomeIcon, color: palette.teal},
        ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status, palette, hasPendingMapAction, isMapEditorOpen]);

    return (
        <>
            <Paper sx={{height: `${GLOBAL_CONTROLS_BAR_HEIGHT}px`, flexShrink: 0}}>
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
                            {progressText && <InlineStat icon={<RoomProgressIcon sx={CHIP_ICON_SX}/>} label={progressText}/>}
                            {task && (
                                <InlineStat
                                    icon={<TimeRemainingIcon sx={CHIP_ICON_SX}/>}
                                    label={taskFinished ?
                                        (typeof firmwareTotalSeconds === "number" ?
                                            formatRemainingTime(firmwareTotalSeconds) : "Updating") :
                                        (typeof remainingSeconds === "number" ? formatRemainingTime(remainingSeconds) : "Calculating")}
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
                                    disabled={!enabled || isPending}
                                    onClick={event => {
                                        event.stopPropagation();
                                        sendCommand(command);
                                    }}
                                    sx={{
                                        minWidth: 0,
                                        width: "44px",
                                        height: "44px",
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
                </Grid2>
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
