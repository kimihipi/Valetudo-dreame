import React from "react";
import {Grid2, ToggleButton, ToggleButtonGroup, Tooltip} from "@mui/material";
import {
    CropSquare as ZoneModeIcon,
    Dashboard as SegmentModeIcon,
    Room as GoToModeIcon,
    QuestionMark as NoneModeIcon,
    SelectAll as AllModeIcon,
    AutoMode as AutomaticModeIcon,
} from "@mui/icons-material";
import {LiveMapMode, useLiveMapMode} from "../map/LiveMap";
import {Capability, StatusState, useAutomaticControlAttributeQuery, useRobotStatusQuery, useSetAutomaticControlMutation} from "../api";
import {useCapabilitiesSupported} from "../CapabilitiesProvider";

const ActiveStates: StatusState["value"][] = ["cleaning", "returning", "moving", "paused"];

const modeToIcon: Record<LiveMapMode, React.ReactElement> = {
    "all": <AllModeIcon/>,
    "segments": <SegmentModeIcon/>,
    "zones": <ZoneModeIcon/>,
    "goto": <GoToModeIcon/>,
    "none": <NoneModeIcon/>,
    "automatic": <AutomaticModeIcon/>,
};

const modeToLabel: Record<LiveMapMode, string> = {
    "all": "All",
    "segments": "Segments",
    "zones": "Zones",
    "goto": "Go To",
    "none": "None",
    "automatic": "Automatic",
};

const MapModeControls = (): React.ReactElement | null => {
    const {mode, supportedModes, setMode} = useLiveMapMode();
    const {data: status} = useRobotStatusQuery();
    const [automaticControlSupported] = useCapabilitiesSupported(Capability.AutomaticControl);
    const {data: automaticAttribute} = useAutomaticControlAttributeQuery();
    const {mutate: setAutomaticControl} = useSetAutomaticControlMutation();

    if (supportedModes.length === 0) {
        return null;
    }

    const robotActive = status !== undefined && ActiveStates.includes(status.value);
    const disabled = !setMode || robotActive;

    const handleModeChange = (newMode: LiveMapMode) => {
        if (!setMode) {
            return;
        }
        setMode(newMode);
        if (!automaticControlSupported) {
            return;
        }
        if (newMode === "automatic") {
            const level = automaticAttribute?.value && automaticAttribute.value !== "off" ?
                automaticAttribute.value :
                "routine";
            setAutomaticControl(level);
        } else if (mode === "automatic") {
            setAutomaticControl("off");
        }
    };

    return (
        <Grid2 pt={0.5} pb={0.5}>
            <ToggleButtonGroup
                exclusive
                fullWidth
                size="small"
                value={mode}
                onChange={(_e, value) => {
                    if (value !== null) {
                        handleModeChange(value as LiveMapMode);
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
