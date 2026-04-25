import {
    Box,
    Grid2,
    Icon,
    Paper,
    Skeleton,
    ToggleButton,
    ToggleButtonGroup,
    Tooltip,
    Typography,
} from "@mui/material";
import React from "react";
import {
    Capability,
    capabilityToPresetType,
    RobotAttributeClass,
    usePresetSelectionMutation,
    usePresetSelectionsQuery,
    useRobotAttributeQuery,
} from "../api";
import {ExpandLess as CloseIcon, ExpandMore as OpenIcon} from "@mui/icons-material";
import LoadingFade from "../components/LoadingFade";
import {getPresetIconOrLabel, presetFriendlyNames, sortPresets} from "../presetUtils";

const StyledIcon = Icon;

export interface PresetSelectionProps {
    capability: Capability.FanSpeedControl | Capability.WaterUsageControl | Capability.OperationModeControl | Capability.MopDockMopCleaningFrequencyControl | Capability.MopDockDetergentControl | Capability.MopDockMopWashIntensityControl | Capability.AutomaticControl | Capability.AutomaticSubModeControl;
    label: string;
    icon: React.ReactElement;
    noPaper?: boolean;
    iconColor?: string;
    onPresetReselect?: (value: string) => void;
    onPresetChange?: (value: string) => void;
    valueBadge?: { value: string; color: string };
    noHeader?: boolean;
}

const PresetSelectionControl = (props: PresetSelectionProps): React.ReactElement => {
    const [presetSelectionOpen, setPresetSelectionOpen] = React.useState(false);

    const { capability, label, icon, noPaper = false, iconColor, onPresetReselect, onPresetChange, valueBadge, noHeader = false } = props;
    const { data: preset } = useRobotAttributeQuery(
        RobotAttributeClass.PresetSelectionState,
        (attributes) => {
            return attributes.filter((attribute) => {
                return attribute.type === capabilityToPresetType[capability];
            })[0];
        }
    );
    const {
        isPending: presetsPending,
        isError: presetLoadError,
        data: presets,
    } = usePresetSelectionsQuery(capability);

    const {
        mutate: selectPreset,
        isPending: selectPresetIsPending,
    } = usePresetSelectionMutation(capability);

    const filteredPresets = React.useMemo(() => {
        const filtered = presets?.filter(
            (x) => x !== "custom" && !(capability === Capability.MopDockDetergentControl && x === "missing_cartridge")
        ) ?? [];
        return sortPresets(filtered);
    }, [presets, capability]);

    const pending = selectPresetIsPending;

    const body = React.useMemo(() => {
        if (presetsPending) {
            return <Skeleton height="2.5rem" />;
        }

        if (presetLoadError || preset === undefined) {
            return <Typography color="error">Error loading {capability}</Typography>;
        }

        return (
            <ToggleButtonGroup
                exclusive
                fullWidth
                size="small"
                value={preset.value}
                onChange={(_e, value) => {
                    if (value !== null && value !== preset.value) {
                        selectPreset(value);
                        onPresetChange?.(value);
                    } else if (value === null && onPresetReselect) {
                        onPresetReselect(preset.value);
                    }
                }}
            >
                {filteredPresets.map((p) => (
                    <Tooltip key={p} title={presetFriendlyNames[p]} arrow>
                        <ToggleButton value={p} disabled={pending} sx={{py: 1}}>
                            <Box sx={{position: "relative", display: "inline-flex"}}>
                                {getPresetIconOrLabel(capability, p, {height: "14px", width: "auto", color: p === preset.value ? iconColor : undefined})}
                                {valueBadge?.value === p && (
                                    <Typography component="span" sx={{position: "absolute", left: "100%", top: "50%", transform: "translateY(-50%)", ml: "1px", color: valueBadge.color, fontSize: "14px", fontWeight: "bold", lineHeight: 1}}>+</Typography>
                                )}
                            </Box>
                        </ToggleButton>
                    </Tooltip>
                ))}
            </ToggleButtonGroup>
        );
    }, [
        capability,
        filteredPresets,
        iconColor,
        onPresetChange,
        onPresetReselect,
        pending,
        preset,
        presetLoadError,
        presetsPending,
        selectPreset,
        valueBadge,
    ]);

    if (noPaper) {
        return (
            <Grid2>
                {!noHeader && (
                    <Box sx={{display: "flex", alignItems: "center", gap: "4px", px: 0.5, pt: 0, pb: 1}}>
                        {icon}
                        <Typography variant="subtitle2" id={`${capability}-slider-label`}>
                            {label}
                        </Typography>
                        <LoadingFade in={pending} transitionDelay={pending ? "500ms" : "0ms"} size={16}/>
                        {!pending && (
                            <Typography variant="caption" color="text.secondary" sx={{ml: "auto", fontWeight: 600}}>
                                {preset?.value ? presetFriendlyNames[preset.value] : ""}
                            </Typography>
                        )}
                    </Box>
                )}
                <Box sx={{px: 0.5, pb: 0.5}}>
                    {body}
                </Box>
            </Grid2>
        );
    }

    return (
        <Grid2>
            <Paper sx={{minHeight: "2.5em"}}>
                <Grid2 container direction="column">
                    <Box px={1.5} pt={1}>
                        <Grid2
                            container
                            alignItems="center"
                            spacing={1}
                            onClick={() => setPresetSelectionOpen(!presetSelectionOpen)}
                            style={{cursor: "pointer"}}
                        >
                            <Grid2>{icon}</Grid2>
                            <Grid2 sx={{marginTop: "-8px" /* ugh */}}>
                                <Typography variant="subtitle1" id={`${capability}-slider-label`}>
                                    {label}
                                </Typography>
                            </Grid2>
                            <Grid2>
                                <LoadingFade in={pending} transitionDelay={pending ? "500ms" : "0ms"} size={20}/>
                            </Grid2>
                            <Grid2 sx={{marginLeft: "auto"}}>
                                <Grid2 container>
                                    {!pending && (
                                        <Grid2 sx={{marginTop: "-2px" /* ugh */}}>
                                            <Typography variant="subtitle1" sx={{paddingRight: "8px"}}>
                                                {preset?.value ? presetFriendlyNames[preset.value] : ""}
                                            </Typography>
                                        </Grid2>
                                    )}
                                    <Grid2 sx={{marginLeft: "auto"}}>
                                        <StyledIcon component={presetSelectionOpen ? CloseIcon : OpenIcon}/>
                                    </Grid2>
                                </Grid2>
                            </Grid2>
                        </Grid2>
                        <Box sx={{display: presetSelectionOpen ? "block" : "none", pb: 1.5, pt: 0.5}}>
                            {body}
                        </Box>
                    </Box>
                </Grid2>
            </Paper>
        </Grid2>
    );
};

export default PresetSelectionControl;
