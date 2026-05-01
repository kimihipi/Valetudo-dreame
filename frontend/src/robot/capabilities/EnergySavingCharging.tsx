import React, {FunctionComponent} from "react";
import {Button, Checkbox, FormControlLabel, Stack, TextField, Typography} from "@mui/material";
import {
    Capability,
    DoNotDisturbConfiguration,
    DoNotDisturbTime,
    useEnergySavingChargingConfigurationQuery,
    useEnergySavingChargingConfigurationMutation
} from "../../api";
import {useCapabilitiesSupported} from "../../CapabilitiesProvider";
import {deepCopy} from "../../utils";
import {CapabilityItem} from "./CapabilityLayout";

const formatTime = (value: DoNotDisturbTime | undefined): string => {
    if (!value) {
        return "??:??";
    }
    return `${value.hour.toString().padStart(2, "0")}:${value.minute.toString().padStart(2, "0")}`;
};

const EnergySavingChargingControl: FunctionComponent = () => {
    const {
        data: configuration,
        isFetching: configurationFetching,
        isError: configurationError,
    } = useEnergySavingChargingConfigurationQuery();

    const [editConfig, setEditConfig] = React.useState<null | DoNotDisturbConfiguration>(null);
    React.useEffect(() => {
        if (configuration) {
            setEditConfig(deepCopy(configuration));
        }
    }, [configuration]);

    const {
        mutate: updateConfiguration,
        isPending: configurationUpdating
    } = useEnergySavingChargingConfigurationMutation();

    const startTimeValue = React.useMemo(() => {
        const date = new Date();
        date.setUTCHours(editConfig?.start.hour ?? 0, editConfig?.start.minute ?? 0, 0, 0);
        return date;
    }, [editConfig]);

    const endTimeValue = React.useMemo(() => {
        const date = new Date();
        date.setUTCHours(editConfig?.end.hour ?? 0, editConfig?.end.minute ?? 0, 0, 0);
        return date;
    }, [editConfig]);

    const content = React.useMemo(() => {
        if (configurationError) {
            return (
                <Typography color="error">
                    Error loading energy saving charging configuration.
                </Typography>
            );
        }

        return (
            <>
                <FormControlLabel control={<Checkbox checked={editConfig?.enabled || false} onChange={(e) => {
                    if (editConfig) {
                        const newConfig = deepCopy(editConfig);
                        newConfig.enabled = e.target.checked;
                        setEditConfig(newConfig);
                    }
                }}/>} label="Enabled"/>
                <Stack direction="row" spacing={1} sx={{mt: 1, mb: 1}}>
                    <TextField
                        label="Start time"
                        type="time"
                        value={`${startTimeValue.getHours().toString().padStart(2, "0")}:${startTimeValue.getMinutes().toString().padStart(2, "0")}`}
                        InputLabelProps={{ shrink: true }}
                        disabled={!editConfig?.enabled || false}
                        onChange={(e) => {
                            if (editConfig && e.target.value) {
                                const [hours, minutes] = e.target.value.split(":").map(Number);
                                const date = new Date();
                                date.setHours(hours, minutes, 0, 0);
                                const newConfig = deepCopy(editConfig);
                                newConfig.start.hour = date.getUTCHours();
                                newConfig.start.minute = date.getUTCMinutes();
                                setEditConfig(newConfig);
                            }
                        }}
                    />
                    <TextField
                        label="End time"
                        type="time"
                        value={`${endTimeValue.getHours().toString().padStart(2, "0")}:${endTimeValue.getMinutes().toString().padStart(2, "0")}`}
                        InputLabelProps={{ shrink: true }}
                        disabled={!editConfig?.enabled || false}
                        onChange={(e) => {
                            if (editConfig && e.target.value) {
                                const [hours, minutes] = e.target.value.split(":").map(Number);
                                const date = new Date();
                                date.setHours(hours, minutes, 0, 0);
                                const newConfig = deepCopy(editConfig);
                                newConfig.end.hour = date.getUTCHours();
                                newConfig.end.minute = date.getUTCMinutes();
                                setEditConfig(newConfig);
                            }
                        }}
                    />
                </Stack>
                <Typography variant="subtitle2" color="textSecondary" sx={{mb: 2}}>
                    UTC: {formatTime(editConfig?.start)} &mdash; {formatTime(editConfig?.end)}
                </Typography>
                <Button loading={configurationUpdating} variant="outlined" color="success" onClick={() => {
                    if (editConfig) {
                        updateConfiguration(editConfig);
                    }
                }}>Apply</Button>
            </>
        );
    }, [editConfig, startTimeValue, endTimeValue, configurationError, configurationUpdating, updateConfiguration]);

    const loading = configurationUpdating || configurationFetching || !configuration;
    return (
        <CapabilityItem
            title={"Energy Saving Charging"}
            loading={loading}
        >
            {content}
        </CapabilityItem>
    );
};

const EnergySavingCharging: FunctionComponent = () => {
    const [energySavingCharging] = useCapabilitiesSupported(Capability.EnergySavingCharging);
    if (!energySavingCharging) {
        return null;
    }

    return <EnergySavingChargingControl/>;
};

export default EnergySavingCharging;
