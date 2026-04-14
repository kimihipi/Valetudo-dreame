import React from "react";
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    styled,
    Box,
    List
} from "@mui/material";
import {useCapabilitiesSupported} from "../CapabilitiesProvider";
import {
    AutoEmptyDockAutoEmptyDuration,
    AutoEmptyDockAutoEmptyInterval,
    Capability,
    MopDockMopDryingDuration,
    MopDockMopWashTemperature,
    useAutoEmptyDockAutoEmptyDurationControlPropertiesQuery,
    useAutoEmptyDockAutoEmptyDurationMutation,
    useAutoEmptyDockAutoEmptyDurationQuery,
    useAutoEmptyDockAutoEmptyIntervalMutation,
    useAutoEmptyDockAutoEmptyIntervalPropertiesQuery,
    useAutoEmptyDockAutoEmptyIntervalQuery,
    useMopDockMopAutoDryingControlMutation,
    useMopDockMopAutoDryingControlQuery,
    useMopDockMopDryingTimeControlPropertiesQuery,
    useMopDockMopDryingTimeMutation,
    useMopDockMopDryingTimeQuery,
    useMopDockMopWashTemperatureMutation,
    useMopDockMopWashTemperaturePropertiesQuery,
    useMopDockMopWashTemperatureQuery,
    usePresetSelectionsQuery,
    usePresetSelectionMutation,
    useRobotAttributeQuery,
    RobotAttributeClass,
    capabilityToPresetType,
    useMaintenancePropertiesQuery,
    useMaintenanceMutation,
} from "../api";
import {SelectListMenuItem, SelectListMenuItemOption} from "../components/list_menu/SelectListMenuItem";
import {ToggleSwitchListMenuItem} from "../components/list_menu/ToggleSwitchListMenuItem";
import {SpacerListMenuItem} from "../components/list_menu/SpacerListMenuItem";
import {SubHeaderListMenuItem} from "../components/list_menu/SubHeaderListMenuItem";
import {ButtonListMenuItem} from "../components/list_menu/ButtonListMenuItem";
import {
    Air as MopDockMopAutoDryingControlIcon,
    AvTimer as MopDockMopDryingTimeControlIcon,
    AvTimer as AutoEmptyDockAutoEmptyDurationControlIcon,
    AutoDelete as AutoEmptyIntervalControlIcon,
    DeviceThermostat as MopDockMopWashTemperatureControlIcon,
    Loop as MopDockMopCleaningFrequencyControlIcon,
    Science as MopDockDetergentControlIcon,
    WaterDrop as MopDockMopWashIntensityControlIcon,
    Build as BuildIcon,
    Plumbing as PlumbingIcon,
    Opacity as OpacityIcon,
    CleaningServices as CleaningServicesIcon,
    Settings as SettingsIcon,
    Construction as ConstructionIcon,
} from "@mui/icons-material";
import {presetFriendlyNames, sortPresets} from "../presetUtils";

const StyledDialog = styled(Dialog)(({ theme }) => {
    return {
        "& .MuiDialogContent-root": {
            padding: theme.spacing(2),
        },
        "& .MuiDialogActions-root": {
            padding: theme.spacing(1),
        },
    };
});

// Auto-Empty Interval Setting
const AutoEmptyIntervalSetting = () => {
    const SORT_ORDER: Record<AutoEmptyDockAutoEmptyInterval, number> = {
        "off": 0,
        "infrequent": 1,
        "normal": 2,
        "frequent": 3,
    };

    const {
        data: autoEmptyDockAutoEmptyIntervalProperties,
        isPending: autoEmptyDockAutoEmptyIntervalPropertiesPending,
        isError: autoEmptyDockAutoEmptyIntervalPropertiesError
    } = useAutoEmptyDockAutoEmptyIntervalPropertiesQuery();

    const options: Array<SelectListMenuItemOption> = (
        autoEmptyDockAutoEmptyIntervalProperties?.supportedIntervals ?? []
    ).sort((a, b) => {
        const aMapped = SORT_ORDER[a] ?? 10;
        const bMapped = SORT_ORDER[b] ?? 10;

        if (aMapped !== bMapped) {
            return aMapped - bMapped;
        } else {
            return 0;
        }
    }).map((val: AutoEmptyDockAutoEmptyInterval) => {
        let label;

        switch (val) {
            case "off":
                label = "Off";
                break;
            case "infrequent":
                label = "Infrequent";
                break;
            case "normal":
                label = "Normal";
                break;
            case "frequent":
                label = "Frequent";
                break;
            default:
                label = val;
                break;
        }

        return {label: label, value: val};
    });

    const {
        data: currentValue,
        isPending: isPending,
        isFetching: isFetching,
        isError: isError,
    } = useAutoEmptyDockAutoEmptyIntervalQuery();

    const {mutate: mutate, isPending: isChanging} = useAutoEmptyDockAutoEmptyIntervalMutation();
    const loading = isFetching || isChanging;
    const disabled = loading || isChanging || isError;

    const selectedOption = currentValue ?
        options.find(opt => opt.value === currentValue) || options[0] :
        options[0];

    return (
        <SelectListMenuItem
            primaryLabel="Dock Auto-Empty"
            secondaryLabel="Select if and/or how often the dock should auto-empty the robot."
            icon={<AutoEmptyIntervalControlIcon/>}
            options={options}
            currentValue={selectedOption || {label: "", value: ""}}
            setValue={(e) => {
                mutate(e.value as AutoEmptyDockAutoEmptyInterval);
            }}
            disabled={disabled}
            loadingOptions={autoEmptyDockAutoEmptyIntervalPropertiesPending || isPending}
            loadError={autoEmptyDockAutoEmptyIntervalPropertiesError}
        />
    );
};

// Auto-Empty Duration Setting
const AutoEmptyDurationSetting = () => {
    const SORT_ORDER: Record<AutoEmptyDockAutoEmptyDuration, number> = {
        "auto": 0,
        "short": 1,
        "medium": 2,
        "long": 3,
    };

    const {
        data: autoEmptyDockAutoEmptyDurationProperties,
        isPending: autoEmptyDockAutoEmptyDurationPropertiesPending,
        isError: autoEmptyDockAutoEmptyDurationPropertiesError
    } = useAutoEmptyDockAutoEmptyDurationControlPropertiesQuery();

    const options: Array<SelectListMenuItemOption> = (
        autoEmptyDockAutoEmptyDurationProperties?.supportedDurations ?? []
    ).sort((a, b) => {
        const aMapped = SORT_ORDER[a] ?? 10;
        const bMapped = SORT_ORDER[b] ?? 10;

        return aMapped - bMapped;
    }).map((val: AutoEmptyDockAutoEmptyDuration) => {
        let label;

        switch (val) {
            case "auto":
                label = "Auto";
                break;
            case "short":
                label = "Short";
                break;
            case "medium":
                label = "Medium";
                break;
            case "long":
                label = "Long";
                break;
            default:
                label = val;
                break;
        }

        return {label: label, value: val};
    });

    const {
        data: currentValue,
        isPending: isPending,
        isFetching: isFetching,
        isError: isError,
    } = useAutoEmptyDockAutoEmptyDurationQuery();

    const {mutate: mutate, isPending: isChanging} = useAutoEmptyDockAutoEmptyDurationMutation();
    const loading = isFetching || isChanging;
    const disabled = loading || isChanging || isError;

    const selectedOption = currentValue ?
        options.find(opt => opt.value === currentValue) || options[0] :
        options[0];

    return (
        <SelectListMenuItem
            primaryLabel="Auto-Empty Duration"
            secondaryLabel="How long the dock should run the auto-empty process."
            icon={<AutoEmptyDockAutoEmptyDurationControlIcon/>}
            options={options}
            currentValue={selectedOption || {label: "", value: ""}}
            setValue={(e) => {
                mutate(e.value as AutoEmptyDockAutoEmptyDuration);
            }}
            disabled={disabled}
            loadingOptions={autoEmptyDockAutoEmptyDurationPropertiesPending || isPending}
            loadError={autoEmptyDockAutoEmptyDurationPropertiesError}
        />
    );
};

// Mop Wash Temperature Setting
const MopWashTemperatureSetting = () => {
    const SORT_ORDER: Record<MopDockMopWashTemperature, number> = {
        "cold": 1,
        "warm": 2,
        "hot": 3,
        "scalding": 4,
        "boiling": 5,
    };

    const {
        data: mopDockMopWashTemperatureProperties,
        isPending: mopDockMopWashTemperaturePropertiesPending,
        isError: mopDockMopWashTemperaturePropertiesError
    } = useMopDockMopWashTemperaturePropertiesQuery();

    const options: Array<SelectListMenuItemOption> = (
        mopDockMopWashTemperatureProperties?.supportedTemperatures ?? []
    ).sort((a, b) => {
        const aMapped = SORT_ORDER[a] ?? 10;
        const bMapped = SORT_ORDER[b] ?? 10;

        return aMapped - bMapped;
    }).map((val: MopDockMopWashTemperature) => {
        let label;

        switch (val) {
            case "cold":
                label = "Cold";
                break;
            case "warm":
                label = "Warm";
                break;
            case "hot":
                label = "Hot";
                break;
            case "scalding":
                label = "Scalding";
                break;
            case "boiling":
                label = "Boiling";
                break;
            default:
                label = val;
                break;
        }

        return {label: label, value: val};
    });

    const {
        data: currentValue,
        isPending: isPending,
        isFetching: isFetching,
        isError: isError,
    } = useMopDockMopWashTemperatureQuery();

    const {mutate: mutate, isPending: isChanging} = useMopDockMopWashTemperatureMutation();
    const loading = isFetching || isChanging;
    const disabled = loading || isChanging || isError;

    const selectedOption = currentValue ?
        options.find(opt => opt.value === currentValue) || options[0] :
        options[0];

    return (
        <SelectListMenuItem
            primaryLabel="Mop Wash Temperature"
            secondaryLabel="Select if and/or how much the dock should heat the water used to rinse the mop pads."
            icon={<MopDockMopWashTemperatureControlIcon/>}
            options={options}
            currentValue={selectedOption || {label: "", value: ""}}
            setValue={(e) => {
                mutate(e.value as MopDockMopWashTemperature);
            }}
            disabled={disabled}
            loadingOptions={mopDockMopWashTemperaturePropertiesPending || isPending}
            loadError={mopDockMopWashTemperaturePropertiesError}
        />
    );
};

// Mop Auto-Drying Control Setting
const MopAutoDryingSetting = () => {
    const {
        data: data,
        isFetching: isFetching,
        isError: isError,
    } = useMopDockMopAutoDryingControlQuery();

    const {mutate: mutate, isPending: isChanging} = useMopDockMopAutoDryingControlMutation();
    const loading = isFetching || isChanging;
    const disabled = loading || isChanging || isError;

    const isChecked = typeof data === "boolean" ? data : (data?.enabled ?? false);

    return (
        <ToggleSwitchListMenuItem
            disabled={disabled}
            loadError={isError}
            primaryLabel={"Mop Auto-Drying"}
            secondaryLabel={"Automatically dry the mop pads after a cleanup."}
            icon={<MopDockMopAutoDryingControlIcon/>}
            value={isChecked}
            setValue={(newValue: boolean) => {
                mutate(newValue);
            }}
        />
    );
};

// Mop Drying Time Setting
const MopDryingTimeSetting = () => {
    const SORT_ORDER: Record<MopDockMopDryingDuration, number> = {
        "cold": 1,
        "2h": 2,
        "3h": 3,
        "4h": 4,
    };

    const {
        data: mopDockMopDryingTimeProperties,
        isPending: mopDockMopDryingTimePropertiesPending,
        isError: mopDockMopDryingTimePropertiesError
    } = useMopDockMopDryingTimeControlPropertiesQuery();

    const options: Array<SelectListMenuItemOption> = (
        mopDockMopDryingTimeProperties?.supportedDurations ?? []
    ).sort((a, b) => {
        const aMapped = SORT_ORDER[a] ?? 10;
        const bMapped = SORT_ORDER[b] ?? 10;

        return aMapped - bMapped;
    }).map((val: MopDockMopDryingDuration) => {
        let label;

        switch (val) {
            case "cold":
                label = "Cold";
                break;
            case "2h":
                label = "2 Hours";
                break;
            case "3h":
                label = "3 Hours";
                break;
            case "4h":
                label = "4 Hours";
                break;
            default:
                label = val;
                break;
        }

        return {label: label, value: val};
    });

    const {
        data: currentValue,
        isPending: isPending,
        isFetching: isFetching,
        isError: isError,
    } = useMopDockMopDryingTimeQuery();

    const {mutate: mutate, isPending: isChanging} = useMopDockMopDryingTimeMutation();
    const loading = isFetching || isChanging;
    const disabled = loading || isChanging || isError;

    const selectedOption = currentValue ?
        options.find(opt => opt.value === currentValue) || options[0] :
        options[0];

    return (
        <SelectListMenuItem
            primaryLabel="Mop Drying Time"
            secondaryLabel="How long the dock should dry the mop pads."
            icon={<MopDockMopDryingTimeControlIcon/>}
            options={options}
            currentValue={selectedOption || {label: "", value: ""}}
            setValue={(e) => {
                mutate(e.value as MopDockMopDryingDuration);
            }}
            disabled={disabled}
            loadingOptions={mopDockMopDryingTimePropertiesPending || isPending}
            loadError={mopDockMopDryingTimePropertiesError}
        />
    );
};

// Mop Cleaning Frequency Setting
const MopCleaningFrequencySetting = () => {
    const {
        isPending: presetsPending,
        isError: presetsError,
        data: presets,
    } = usePresetSelectionsQuery(Capability.MopDockMopCleaningFrequencyControl);

    const {
        data: current,
        isFetching: currentFetching,
    } = useRobotAttributeQuery(
        RobotAttributeClass.PresetSelectionState,
        (attributes) => attributes.find(a => a.type === capabilityToPresetType[Capability.MopDockMopCleaningFrequencyControl])
    );

    const {mutate, isPending: isChanging} = usePresetSelectionMutation(Capability.MopDockMopCleaningFrequencyControl);

    const loading = currentFetching || isChanging;
    const disabled = loading || presetsError;

    const options: SelectListMenuItemOption[] = React.useMemo(() => {
        return sortPresets(presets ?? []).map(p => ({value: p, label: presetFriendlyNames[p] || p}));
    }, [presets]);

    const currentValue = options.find(o => o.value === current?.value) ?? {value: "", label: ""};

    return (
        <SelectListMenuItem
            primaryLabel="Mop Cleaning Frequency"
            secondaryLabel="How often the mop pad is washed during a cleanup."
            icon={<MopDockMopCleaningFrequencyControlIcon/>}
            options={options}
            currentValue={currentValue}
            setValue={(e) => {
                mutate(e.value);
            }}
            disabled={disabled}
            loadingOptions={presetsPending || currentFetching}
            loadError={presetsError}
        />
    );
};

// Detergent Control Setting
const DetergentSetting = () => {
    const {
        isPending: presetsPending,
        isError: presetsError,
        data: presets,
    } = usePresetSelectionsQuery(Capability.MopDockDetergentControl);

    const {
        data: current,
        isFetching: currentFetching,
    } = useRobotAttributeQuery(
        RobotAttributeClass.PresetSelectionState,
        (attributes) => attributes.find(a => a.type === capabilityToPresetType[Capability.MopDockDetergentControl])
    );

    const {mutate, isPending: isChanging} = usePresetSelectionMutation(Capability.MopDockDetergentControl);

    const isMissingCartridge = current?.value === "missing_cartridge";
    const loading = currentFetching || isChanging;
    const disabled = loading || presetsError;

    const options: SelectListMenuItemOption[] = React.useMemo(() => {
        return sortPresets(presets ?? []).map(p => ({value: p, label: presetFriendlyNames[p] || p}));
    }, [presets]);

    const currentValue = options.find(o => o.value === current?.value) ?? {value: "", label: ""};

    return (
        <SelectListMenuItem
            primaryLabel="Detergent"
            secondaryLabel={isMissingCartridge ? "Insert a detergent cartridge to enable this feature." : "Enable or disable the detergent dispenser."}
            icon={<MopDockDetergentControlIcon/>}
            options={options}
            currentValue={currentValue}
            setValue={(e) => {
                mutate(e.value);
            }}
            disabled={disabled}
            loadingOptions={presetsPending || currentFetching}
            loadError={presetsError}
        />
    );
};

// Mop Wash Intensity Setting
const MopWashIntensitySetting = () => {
    const {
        isPending: presetsPending,
        isError: presetsError,
        data: presets,
    } = usePresetSelectionsQuery(Capability.MopDockMopWashIntensityControl);

    const {
        data: current,
        isFetching: currentFetching,
    } = useRobotAttributeQuery(
        RobotAttributeClass.PresetSelectionState,
        (attributes) => attributes.find(a => a.type === capabilityToPresetType[Capability.MopDockMopWashIntensityControl])
    );

    const {mutate, isPending: isChanging} = usePresetSelectionMutation(Capability.MopDockMopWashIntensityControl);

    const loading = currentFetching || isChanging;
    const disabled = loading || presetsError;

    const options: SelectListMenuItemOption[] = React.useMemo(() => {
        return sortPresets(presets ?? []).map(p => ({value: p, label: presetFriendlyNames[p] || p}));
    }, [presets]);

    const currentValue = options.find(o => o.value === current?.value) ?? {value: "", label: ""};

    return (
        <SelectListMenuItem
            primaryLabel="Mop Wash Intensity"
            secondaryLabel="How intense the mop pad wash should be."
            icon={<MopDockMopWashIntensityControlIcon/>}
            options={options}
            currentValue={currentValue}
            setValue={(e) => {
                mutate(e.value);
            }}
            disabled={disabled}
            loadingOptions={presetsPending || currentFetching}
            loadError={presetsError}
        />
    );
};

// Maintenance Actions Setting
const MaintenanceSetting = () => {
    const {
        data: maintenanceProperties,
    } = useMaintenancePropertiesQuery();

    const {mutate, isPending: isPerformingAction} = useMaintenanceMutation();

    const actionDefinitions: Record<string, { primary: string; secondary: string; icon: React.ReactElement }> = {
        "mop_dock_auto_repair": {
            primary: "Dock Auto Repair",
            secondary: "Manuallt purge air from the dock and robot which would prevent the water tank in the robot from being filled. Trigger until the issue is resolved.",
            icon: <BuildIcon/>
        },
        "mop_dock_water_hookup_test": {
            primary: "Dock Water Hookup Test",
            secondary: "Test or initialize the permanent water hookup installation. Listen to the robot voice prompts. If errors occur, they will be raised as Events.",
            icon: <PlumbingIcon/>
        },
        "robot_drain_internal_water_tank": {
            primary: "Drain Robot Water Tank",
            secondary: "Drain the internal water tank of the robot into the dock. This can be useful if the robot is to be transported or stored for a while. May take up to 3 minutes.",
            icon: <OpacityIcon/>
        },
        "mop_dock_self_cleaning": {
            primary: "Dock Self Cleaning",
            secondary: "Trigger a manual base self-cleaning. Robot must be docked with and mop pads present or attached.",
            icon: <CleaningServicesIcon/>
        },
    };

    if (!maintenanceProperties?.supportedActions || maintenanceProperties.supportedActions.length === 0) {
        return null;
    }

    return (
        <>
            <SpacerListMenuItem halfHeight={true} />
            {maintenanceProperties.supportedActions.map(action => {
                const def = actionDefinitions[action];
                if (!def) {
                    return null;
                }

                return (
                    <ButtonListMenuItem
                        key={action}
                        primaryLabel={def.primary}
                        secondaryLabel={def.secondary}
                        icon={def.icon}
                        buttonLabel="Go"
                        actionLoading={isPerformingAction}
                        action={() => mutate(action)}
                    />
                );
            })}
        </>
    );
};

const DockSettings: React.FC<{
    open: boolean;
    onClose: () => void;
}> = ({ open, onClose }) => {
    const [
        autoEmptyIntervalSupported,
        autoEmptyDurationSupported,
        mopWashTemperatureSupported,
        mopAutoDryingSupported,
        mopDryingTimeSupported,
        mopCleaningFrequencySupported,
        detergentSupported,
        mopWashIntensitySupported,
        maintenanceSupported,
    ] = useCapabilitiesSupported(
        Capability.AutoEmptyDockAutoEmptyIntervalControl,
        Capability.AutoEmptyDockAutoEmptyDurationControl,
        Capability.MopDockMopWashTemperatureControl,
        Capability.MopDockMopAutoDryingControl,
        Capability.MopDockMopDryingTimeControl,
        Capability.MopDockMopCleaningFrequencyControl,
        Capability.MopDockDetergentControl,
        Capability.MopDockMopWashIntensityControl,
        Capability.Maintenance,
    );

    const dockListItems = React.useMemo(() => {
        const items = [];

        const hasGeneralSettings = autoEmptyIntervalSupported || autoEmptyDurationSupported ||
            mopWashTemperatureSupported || mopAutoDryingSupported || mopDryingTimeSupported ||
            mopCleaningFrequencySupported || detergentSupported || mopWashIntensitySupported;

        if (hasGeneralSettings) {
            items.push(<SubHeaderListMenuItem key="general-header" primaryLabel="General" icon={<SettingsIcon/>}/>);
        }

        if (autoEmptyIntervalSupported) {
            items.push(<AutoEmptyIntervalSetting key="autoEmptyInterval" />);
        }

        if (autoEmptyDurationSupported) {
            items.push(<AutoEmptyDurationSetting key="autoEmptyDuration" />);
        }

        if (autoEmptyIntervalSupported || autoEmptyDurationSupported) {
            items.push(<SpacerListMenuItem key="spacer-auto-empty" halfHeight={true} />);
        }

        if (mopWashTemperatureSupported) {
            items.push(<MopWashTemperatureSetting key="mopWashTemperature" />);
        }

        if (mopAutoDryingSupported) {
            items.push(<MopAutoDryingSetting key="mopAutoDrying" />);
        }

        if (mopDryingTimeSupported) {
            items.push(<MopDryingTimeSetting key="mopDryingTime" />);
        }

        if (mopCleaningFrequencySupported) {
            items.push(<MopCleaningFrequencySetting key="mopCleaningFrequency" />);
        }

        if (detergentSupported) {
            items.push(<DetergentSetting key="detergent" />);
        }

        if (mopWashIntensitySupported) {
            items.push(<MopWashIntensitySetting key="mopWashIntensity" />);
        }

        if (maintenanceSupported) {
            items.push(<SubHeaderListMenuItem key="maintenance-header" primaryLabel="Maintenance" icon={<ConstructionIcon/>}/>);
            items.push(<MaintenanceSetting key="maintenance" />);
        }

        return items;
    }, [
        autoEmptyIntervalSupported,
        autoEmptyDurationSupported,
        mopWashTemperatureSupported,
        mopAutoDryingSupported,
        mopDryingTimeSupported,
        mopCleaningFrequencySupported,
        detergentSupported,
        mopWashIntensitySupported,
        maintenanceSupported,
    ]);

    return (
        <StyledDialog
            onClose={onClose}
            open={open}
            maxWidth="sm"
            fullWidth
            slotProps={{
                backdrop: {
                    sx: {
                        backgroundColor: 'rgba(0, 0, 0, 0.2)',
                    }
                }
            }}
        >
            <DialogTitle>Dock Settings</DialogTitle>
            <DialogContent>
                <Box sx={{ pt: 1 }}>
                    {dockListItems.length > 0 ? (
                        <List sx={{ width: "100%", p: 0 }}>
                            {dockListItems}
                        </List>
                    ) : (
                        <div>No dock settings available</div>
                    )}
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Close</Button>
            </DialogActions>
        </StyledDialog>
    );
};

export default DockSettings;
