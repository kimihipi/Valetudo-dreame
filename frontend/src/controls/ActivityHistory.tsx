import React from "react";
import {Box, Button, Divider, Grid2, Typography} from "@mui/material";
import {
    BatteryChargingFull,
    Download as DownloadIcon,
    History as HistoryIcon,
    DeleteOutline as ResetIcon,
} from "@mui/icons-material";
import ControlsCard from "./ControlsCard";
import {
    ActivityHistoryEntry,
    Capability,
    CleaningHistoryRecord,
    useActivityHistoryQuery,
    useCleaningHistoryQuery,
    useCleaningHistoryResetMutation,
    useTotalStatisticsQuery,
} from "../api";
import {useValetudoColorsInverse} from "../hooks/useValetudoColors";

type ValetudoColors = ReturnType<typeof useValetudoColorsInverse>;
import {getFriendlyStatName, getHumanReadableStatValue, getStatusColor, STATUS_FLAG_LABELS, STATUS_LABELS} from "../utils";
import {getPresetIconOrLabel, presetFriendlyNames} from "../presetUtils";
import ConfirmationDialog from "../components/ConfirmationDialog";
import {DeepRouteIcon, IntensiveRouteIcon, NormalRouteIcon, QuickRouteIcon} from "../components/CustomIcons";

const DOCK_LABELS: Record<string, string> = {
    emptying: "Emptying dustbin",
    cleaning: "Cleaning mop",
    drying: "Drying mop",
    pause: "Paused",
    error: "Error",
};

const toDateString = (ts: string): string =>
    new Date(ts).toDateString();

const DateSeparator = ({timestamp}: {timestamp: string}): React.ReactElement => {
    const label = new Date(timestamp).toLocaleDateString([], {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
    return (
        <Box pt={1} pb={0.25}>
            <Typography variant="caption" color="text.secondary">
                {label}
            </Typography>
            <Divider/>
        </Box>
    );
};

const formatDuration = (ms: number): string => {
    const totalMinutes = Math.round(ms / 60000);
    if (totalMinutes < 1) {
        return "< 1m";
    }
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
};

const formatSeconds = (seconds: number): string => formatDuration(seconds * 1000);

const formatHistoryDate = (timestamp: string): string => new Date(timestamp).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
});

const formatHistoryTime = (timestamp: string): string => new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
});

const PROFILE_ICON_STYLE: React.CSSProperties = {height: "0.875rem", width: "auto"};
const ROUTE_ICONS: Record<string, React.ComponentType<{style?: React.CSSProperties}>> = {
    quick: QuickRouteIcon,
    routine: NormalRouteIcon,
    intensive: IntensiveRouteIcon,
    deep: DeepRouteIcon,
};

const SectionHeader = ({children}: {children: React.ReactNode}): React.ReactElement => (
    <Typography variant="subtitle2" color="text.secondary">
        {children}
    </Typography>
);

const ProfileDetail = ({icon, color, children}: {icon: React.ReactNode; color?: string; children: React.ReactNode}): React.ReactElement => (
    <Box sx={{display: "inline-flex", alignItems: "center", gap: 0.5, minWidth: 0}}>
        <Box sx={{display: "flex", alignItems: "center", flexShrink: 0}}>{icon}</Box>
        <Typography variant="caption" noWrap sx={{color: color ?? "text.secondary"}}>{children}</Typography>
    </Box>
);

const CleaningProfileDetails = ({record, palette}: {record: CleaningHistoryRecord; palette: ValetudoColors}): React.ReactElement => {
    const profile = record.profile;
    const RouteIcon = profile.cleanRoute ? ROUTE_ICONS[profile.cleanRoute] : undefined;

    // Order and colours mirror the rest of Valetudo (see GlobalControlsBar): mode, fan, water, route.
    return (
        <Box sx={{display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: 1.5, rowGap: 0.5, mt: 0.5}}>
            {profile.operationMode && (
                <ProfileDetail color={palette.teal} icon={getPresetIconOrLabel(
                    Capability.OperationModeControl, profile.operationMode, {...PROFILE_ICON_STYLE, color: palette.teal}
                )}>
                    {presetFriendlyNames[profile.operationMode] ?? profile.operationMode}
                </ProfileDetail>
            )}
            {profile.fanPreset && (
                <ProfileDetail color={palette.green} icon={getPresetIconOrLabel(
                    Capability.FanSpeedControl, profile.fanPreset, {...PROFILE_ICON_STYLE, color: palette.green}
                )}>
                    {presetFriendlyNames[profile.fanPreset] ?? profile.fanPreset}
                </ProfileDetail>
            )}
            {profile.waterPreset && (
                <ProfileDetail color={palette.lightBlue} icon={getPresetIconOrLabel(
                    Capability.WaterUsageControl, profile.waterPreset, {...PROFILE_ICON_STYLE, color: palette.lightBlue}
                )}>
                    {presetFriendlyNames[profile.waterPreset] ?? profile.waterPreset}
                </ProfileDetail>
            )}
            {profile.cleanRoute && RouteIcon && (
                <ProfileDetail color={palette.purple} icon={<RouteIcon style={{...PROFILE_ICON_STYLE, color: palette.purple}}/> }>
                    {presetFriendlyNames[profile.cleanRoute] ?? profile.cleanRoute}
                </ProfileDetail>
            )}
        </Box>
    );
};

const OUTCOME_LABELS: Record<string, string> = {
    completed: "Completed",
    cancelled: "Cancelled",
    failed: "Failed",
};

const getOutcomeColor = (outcome: string, palette: ValetudoColors): string | undefined => {
    switch (outcome) {
        case "completed":
            return palette.green;
        case "failed":
            return palette.crimson;
        case "cancelled":
            return palette.yellow;
        default:
            return undefined;
    }
};

const ActivityEntryRow = ({entry, duration}: {entry: ActivityHistoryEntry; duration?: number}): React.ReactElement => {
    const palette = useValetudoColorsInverse();

    const statusColor = getStatusColor(entry.robotStatus, palette);

    const flagSuffix = entry.robotFlag && entry.robotFlag !== "none" && STATUS_FLAG_LABELS[entry.robotFlag] ?
        ` — ${STATUS_FLAG_LABELS[entry.robotFlag]}` :
        "";

    const timeStr = new Date(entry.timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });

    const dockOps = entry.dockActivities
        ?.map(sub => (sub.dockStatus && DOCK_LABELS[sub.dockStatus]) || "")
        .filter(Boolean)
        .join(" · ");

    return (
        <Box py={0.75}>
            <Box display="flex" alignItems="baseline" gap={1}>
                <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", flexShrink: 0}}
                >
                    {timeStr}
                </Typography>
                <Typography
                    variant="body2"
                    sx={{fontWeight: 500, color: statusColor, flexGrow: 1}}
                >
                    {STATUS_LABELS[entry.robotStatus] ?? entry.robotStatus}
                    {flagSuffix && (
                        <Typography component="span" variant="caption" color="text.secondary">
                            {flagSuffix}
                        </Typography>
                    )}
                    {duration !== undefined && (
                        <Typography component="span" variant="caption" color="text.disabled">
                            {" · "}{formatDuration(duration)}
                        </Typography>
                    )}
                    {!dockOps && entry.dockStatus && DOCK_LABELS[entry.dockStatus] && (
                        <Typography component="span" variant="caption" color="text.secondary">
                            {" · "}{DOCK_LABELS[entry.dockStatus]}
                        </Typography>
                    )}
                </Typography>
                {entry.batteryLevel !== null && (
                    <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{whiteSpace: "nowrap", flexShrink: 0, display: "flex", alignItems: "center", gap: 0.25}}
                    >
                        {entry.batteryLevel}%
                        <Box sx={{width: "0.875rem", display: "flex", alignItems: "center"}}>
                            {entry.batteryFlag === "charging" && entry.robotStatus !== "cleaning" && (
                                <BatteryChargingFull sx={{fontSize: "0.875rem"}}/>
                            )}
                        </Box>
                    </Typography>
                )}
            </Box>
            {dockOps && (
                <Box display="flex" gap={1}>
                    <Typography
                        variant="caption"
                        sx={{fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", flexShrink: 0, visibility: "hidden"}}
                    >
                        {timeStr}
                    </Typography>
                    <Typography variant="caption" color="text.disabled">
                        {dockOps}
                    </Typography>
                </Box>
            )}
        </Box>
    );
};

const ActivityHistory = (): React.ReactElement => {
    const palette = useValetudoColorsInverse();
    const {data: entries = []} = useActivityHistoryQuery();
    const {data: cleaningHistory = []} = useCleaningHistoryQuery();
    const {data: totals = []} = useTotalStatisticsQuery();
    const {mutate: resetHistory, isPending: resetting} = useCleaningHistoryResetMutation();
    const [resetDialogOpen, setResetDialogOpen] = React.useState(false);

    const exportHistory = React.useCallback(() => {
        const blob = new Blob([JSON.stringify(cleaningHistory, null, 2)], {type: "application/json"});
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `valetudo-cleaning-history-${new Date().toISOString().slice(0, 10)}.json`;
        anchor.click();
        URL.revokeObjectURL(url);
    }, [cleaningHistory]);

    return (
        <>
            <ControlsCard icon={HistoryIcon} title="Statistics & Activity History">
                <Box sx={{mb: 0.5}}><SectionHeader>Recent Activity</SectionHeader></Box>
                {entries.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                        No activity recorded yet.
                    </Typography>
                ) : (
                    <Box sx={{maxHeight: "20rem", overflowY: "auto", mx: -0.5, px: 0.5}}>
                        {entries.map((entry, i) => {
                            const dateChanged = i > 0 &&
                                toDateString(entry.timestamp) !== toDateString(entries[i - 1].timestamp);
                            const showDate = i === 0 || dateChanged;
                            const duration = entry.robotStatus === "cleaning" && i > 0 ?
                                new Date(entries[i - 1].timestamp).getTime() - new Date(entry.timestamp).getTime() :
                                undefined;
                            return (
                                <React.Fragment key={entry.timestamp}>
                                    {showDate ?
                                        <DateSeparator timestamp={entry.timestamp}/> :
                                        i > 0 && <Divider/>
                                    }
                                    <ActivityEntryRow entry={entry} duration={duration}/>
                                </React.Fragment>
                            );
                        })}
                    </Box>
                )}
                {totals.length > 0 && (
                    <Box sx={{mt: 1.5}}>
                        <Divider sx={{mb: 1.25}}/>
                        <Box sx={{mb: 0.75}}><SectionHeader>Total Statistics</SectionHeader></Box>
                        <Grid2 container direction="row" spacing={1.5}>
                            {totals.map(total => (
                                <Grid2 size="grow" container direction="column" key={total.type} sx={{minWidth: "7rem"}}>
                                    <Typography variant="subtitle2">
                                        {getFriendlyStatName(total)}
                                    </Typography>
                                    <Typography variant="body2">
                                        {getHumanReadableStatValue(total)}
                                    </Typography>
                                </Grid2>
                            ))}
                        </Grid2>
                    </Box>
                )}
                {cleaningHistory.length > 0 && (
                    <Box sx={{mt: 1.5}}>
                        <Divider sx={{mb: 1.25}}/>
                        <Box display="flex" alignItems="center" justifyContent="space-between" gap={1} sx={{mb: 0.5}}>
                            <SectionHeader>Cleaning History</SectionHeader>
                            <Box display="flex" gap={0.5}>
                                <Button size="small" variant="outlined" startIcon={<DownloadIcon/>} onClick={exportHistory}>
                                Export
                                </Button>
                                <Button size="small" color="error" variant="outlined" startIcon={<ResetIcon/>} disabled={resetting}
                                    onClick={() => setResetDialogOpen(true)}>
                                Reset
                                </Button>
                            </Box>
                        </Box>
                        {cleaningHistory.slice(0, 20).map((record, index) => (
                            <React.Fragment key={record.id}>
                                {index > 0 && <Divider/>}
                                <Box py={0.75}>
                                    <Box display="flex" justifyContent="space-between" alignItems="baseline" gap={1}>
                                        <Typography variant="body2" noWrap sx={{fontWeight: 500, minWidth: 0}}>
                                            {record.target.segmentNames.join(" → ") || "All"}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary" sx={{whiteSpace: "nowrap", flexShrink: 0}}>
                                            {formatSeconds(record.totalDurationSeconds)}
                                            {typeof record.estimatedDurationSeconds === "number" && (
                                                <Box component="span" sx={{color: "text.disabled"}}>
                                                    {` / est ${formatSeconds(record.estimatedDurationSeconds)}`}
                                                </Box>
                                            )}
                                        </Typography>
                                    </Box>
                                    <Box sx={{display: "flex", alignItems: "baseline", flexWrap: "wrap", columnGap: 0.75}}>
                                        <Typography
                                            variant="caption"
                                            color="text.secondary"
                                            sx={{fontVariantNumeric: "tabular-nums"}}
                                        >
                                            {formatHistoryDate(record.startedAt)} · {formatHistoryTime(record.startedAt)}
                                        </Typography>
                                        <Typography
                                            variant="caption"
                                            sx={{color: getOutcomeColor(record.outcome, palette) ?? "text.secondary"}}
                                        >
                                            {OUTCOME_LABELS[record.outcome] ??
                                                record.outcome.charAt(0).toUpperCase() + record.outcome.slice(1)}
                                        </Typography>
                                    </Box>
                                    <CleaningProfileDetails record={record} palette={palette}/>
                                    {record.rooms.length > 0 && (
                                        <Box sx={{display: "flex", flexWrap: "wrap", columnGap: 1, rowGap: 0}}>
                                            {record.rooms.map(room => (
                                                <Typography key={room.segmentId} variant="caption" color="text.disabled">
                                                    {room.name} {formatSeconds(room.durationSeconds)}
                                                    {typeof room.estimatedDurationSeconds === "number" &&
                                                    ` (Estimated ${formatSeconds(room.estimatedDurationSeconds)})`}
                                                </Typography>
                                            ))}
                                        </Box>
                                    )}
                                </Box>
                            </React.Fragment>
                        ))}
                    </Box>
                )}
            </ControlsCard>
            <ConfirmationDialog
                title="Reset Cleaning History?"
                text="This clears the saved cleaning history and all learned room estimates."
                open={resetDialogOpen}
                onClose={() => setResetDialogOpen(false)}
                onAccept={() => resetHistory()}
            />
        </>
    );
};

export default ActivityHistory;
