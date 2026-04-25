import React from "react";
import {Box, Divider, Typography} from "@mui/material";
import {BatteryChargingFull, History as HistoryIcon} from "@mui/icons-material";
import ControlsCard from "./ControlsCard";
import {ActivityHistoryEntry, useActivityHistoryQuery} from "../api";
import {useValetudoColorsInverse} from "../hooks/useValetudoColors";
import {STATUS_FLAG_LABELS} from "../utils";

const STATUS_LABELS: Record<string, string> = {
    cleaning: "Cleaning",
    returning: "Returning",
    docked: "Docked",
    idle: "Idle",
    paused: "Paused",
    manual_control: "Manual Control",
    moving: "Moving",
    error: "Error",
};

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
        weekday: "long",
        month: "short",
        day: "numeric",
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

const ActivityEntryRow = ({entry}: {entry: ActivityHistoryEntry}): React.ReactElement => {
    const palette = useValetudoColorsInverse();

    const statusColor = (() => {
        switch (entry.robotStatus) {
            case "cleaning": return palette.green;
            case "returning":
            case "docked": return palette.teal;
            case "idle":
            case "paused": return palette.yellow;
            case "manual_control":
            case "moving": return palette.purple;
            case "error": return palette.red;
            default: return undefined;
        }
    })();

    const flagSuffix = entry.robotFlag && entry.robotFlag !== "none" && STATUS_FLAG_LABELS[entry.robotFlag] ?
        ` — ${STATUS_FLAG_LABELS[entry.robotFlag]}` :
        "";

    const timeStr = new Date(entry.timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });

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
                    {entry.dockStatus && DOCK_LABELS[entry.dockStatus] && (
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
                        {entry.batteryFlag === "charging" && (
                            <BatteryChargingFull sx={{fontSize: "0.875rem"}}/>
                        )}
                    </Typography>
                )}
            </Box>
        </Box>
    );
};

const ActivityHistory = (): React.ReactElement => {
    const {data: entries = []} = useActivityHistoryQuery();

    return (
        <ControlsCard icon={HistoryIcon} title="Activity History">
            {entries.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                    No activity recorded yet.
                </Typography>
            ) : (
                <Box sx={{maxHeight: "20rem", overflowY: "auto", mx: -0.5, px: 0.5}}>
                    {entries.map((entry, i) => {
                        const dateChanged = i > 0 && toDateString(entry.timestamp) !== toDateString(entries[i - 1].timestamp);
                        return (
                            <React.Fragment key={entry.timestamp}>
                                {dateChanged ?
                                    <DateSeparator timestamp={entry.timestamp}/> :
                                    i > 0 && <Divider/>
                                }
                                <ActivityEntryRow entry={entry}/>
                            </React.Fragment>
                        );
                    })}
                </Box>
            )}
        </ControlsCard>
    );
};

export default ActivityHistory;
