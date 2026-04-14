import React from "react";
import {Grid2, ToggleButton, ToggleButtonGroup, Tooltip} from "@mui/material";
import {
    CropSquare as ZoneModeIcon,
    Dashboard as SegmentModeIcon,
    Room as GoToModeIcon,
    QuestionMark as NoneModeIcon,
    SelectAll as AllModeIcon,
} from "@mui/icons-material";
import {LiveMapMode, useLiveMapMode} from "../map/LiveMap";
import {StatusState, useRobotStatusQuery} from "../api";

const ActiveStates: StatusState["value"][] = ["cleaning", "returning", "moving", "paused"];

const modeToIcon: Record<LiveMapMode, React.ReactElement> = {
    "all": <AllModeIcon/>,
    "segments": <SegmentModeIcon/>,
    "zones": <ZoneModeIcon/>,
    "goto": <GoToModeIcon/>,
    "none": <NoneModeIcon/>,
};

const modeToLabel: Record<LiveMapMode, string> = {
    "all": "All",
    "segments": "Segments",
    "zones": "Zones",
    "goto": "Go To",
    "none": "None",
};

const MapModeControls = (): React.ReactElement | null => {
    const {mode, supportedModes, setMode} = useLiveMapMode();
    const {data: status} = useRobotStatusQuery();

    if (supportedModes.length === 0) {
        return null;
    }

    const robotActive = status !== undefined && ActiveStates.includes(status.value);
    const disabled = !setMode || robotActive;

    return (
        <Grid2 pt={0.5} pb={0.5}>
            <ToggleButtonGroup
                exclusive
                fullWidth
                size="small"
                value={mode}
                onChange={(_e, value) => {
                    if (value !== null && setMode) {
                        setMode(value as LiveMapMode);
                    }
                }}
            >
                {supportedModes.map((m) => (
                    <Tooltip key={m} title={modeToLabel[m]} arrow>
                        <ToggleButton value={m} disabled={disabled} sx={{py: 0.75}}>
                            {modeToIcon[m]}
                        </ToggleButton>
                    </Tooltip>
                ))}
            </ToggleButtonGroup>
        </Grid2>
    );
};

export default MapModeControls;
