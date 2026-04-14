import {Capability, PresetSelectionState} from "./api";
import React, {ReactElement} from "react";
import {
    FanSpeedHighIcon,
    FanSpeedLowIcon,
    FanSpeedMaxIcon,
    FanSpeedMediumIcon,
    FanSpeedMinIcon,
    FanSpeedOffIcon,
    FanSpeedTurboIcon,
    OperationModeMop,
    OperationModeVacuum,
    OperationModeVacuumAndMop,
    OperationModeVacuumThenMop,
    WaterGradeHighIcon,
    WaterGradeLowIcon,
    WaterGradeMaxIcon,
    WaterGradeMediumIcon,
    WaterGradeMinIcon,
    WaterGradeOffIcon
} from "./components/CustomIcons";

const order = ["off", "min", "low", "medium", "high", "max", "turbo", "vacuum", "vacuum_and_mop", "vacuum_then_mop", "mop", "every_segment", "every_5_m2", "every_10_m2", "every_15_m2", "every_20_m2", "every_25_m2", "on", "missing_cartridge"];
export const sortPresets = (presets: PresetSelectionState["value"][]) => {
    return [...presets].sort((a, b) => {
        const ai = order.indexOf(a);
        const bi = order.indexOf(b);
        return (ai === -1 ? order.length : ai) - (bi === -1 ? order.length : bi);
    });
};
export const presetFriendlyNames: Record<string, string> = Object.freeze({
    "off": "Off",
    "min": "Min",
    "low": "Low",
    "medium": "Medium",
    "high": "High",
    "max": "Max",
    "turbo": "Turbo",

    "custom": "Custom",

    "vacuum_and_mop": "Vacuum & Mop",
    "vacuum_then_mop": "Vacuum then Mop",
    "vacuum": "Vacuum",
    "mop": "Mop",

    "every_segment": "Every Segment",
    "every_5_m2": "Every 5 m²",
    "every_10_m2": "Every 10 m²",
    "every_15_m2": "Every 15 m²",
    "every_20_m2": "Every 20 m²",
    "every_25_m2": "Every 25 m²",

    "on": "On",
    "missing_cartridge": "Missing Cartridge"
});

export function getPresetIconOrLabel(capability: Capability, preset: string, style?: React.CSSProperties): ReactElement | string {
    switch (capability) {
        case Capability.FanSpeedControl:
            switch (preset) {
                case "off":
                    return <FanSpeedOffIcon style={style}/>;
                case "min":
                    return <FanSpeedMinIcon style={style}/>;
                case "low":
                    return <FanSpeedLowIcon style={style}/>;
                case "medium":
                    return <FanSpeedMediumIcon style={style}/>;
                case "high":
                    return <FanSpeedHighIcon style={style}/>;
                case "max":
                    return <FanSpeedMaxIcon style={style}/>;
                case "turbo":
                    return <FanSpeedTurboIcon style={style}/>;
                default:
                    return presetFriendlyNames[preset];

            }
        case Capability.WaterUsageControl:
            switch (preset) {
                case "off":
                    return <WaterGradeOffIcon style={style}/>;
                case "min":
                    return <WaterGradeMinIcon style={style}/>;
                case "low":
                    return <WaterGradeLowIcon style={style}/>;
                case "medium":
                    return <WaterGradeMediumIcon style={style}/>;
                case "high":
                    return <WaterGradeHighIcon style={style}/>;
                case "max":
                    return <WaterGradeMaxIcon style={style}/>;
                default:
                    return presetFriendlyNames[preset];
            }
        case Capability.OperationModeControl:
            switch (preset) {
                case "vacuum":
                    return <OperationModeVacuum style={style}/>;
                case "mop":
                    return <OperationModeMop style={style}/>;
                case "vacuum_and_mop":
                    return <OperationModeVacuumAndMop style={style}/>;
                case "vacuum_then_mop":
                    return <OperationModeVacuumThenMop style={style}/>;
                default:
                    return presetFriendlyNames[preset];
            }
        default:
            return presetFriendlyNames[preset] ?? preset;
    }
}
