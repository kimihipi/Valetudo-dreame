import { Map, Settings as SettingsIcon } from "@mui/icons-material";
import { IconButton } from "@mui/material";
import React from "react";
import { Capability, useMultipleMapMapsQuery, useMultipleMapSwitchMutation } from "../api";
import { useCapabilitiesSupported } from "../CapabilitiesProvider";
import { SelectItem } from "../components/SelectItem";
import ControlsCard from "./ControlsCard";
import MapSettings from "./MapSettings";

type SelectItemOption = {
    value: string,
    label: string
}

const MultipleMap = (): React.ReactElement => {
    const [multipleMapSupported] = useCapabilitiesSupported(Capability.MultipleMap);

    const {
        data: maps,
        isPending: mapsIsPending,
        isError: mapsIsError
    } = useMultipleMapMapsQuery();

    const [settingsDialogOpen, setSettingsDialogOpen] = React.useState(false);

    const options: Array<SelectItemOption> = (
        maps ?? []
    ).map((entry) => {
        return {
            value: entry.id,
            label: entry.name
        };
    });

    const {mutate: mutate, isPending: isSwitching} = useMultipleMapSwitchMutation();

    const noneOption = {value: "-1", label: "None"};

    const activeMapId = (maps ?? []).find(entry => entry.active)?.id;
    const currentValue = options.find(mode => {
        return mode.value === activeMapId;
    }) ?? noneOption;

    if (currentValue === noneOption || options.length === 0) {
        options.unshift(noneOption);
    }

    return (
        <>
            <ControlsCard
                icon={Map}
                title="Map"
                inline
                headerExtra={
                    <IconButton
                        size="small"
                        onClick={() => setSettingsDialogOpen(true)}
                        sx={{color: "inherit"}}
                    >
                        <SettingsIcon fontSize="small"/>
                    </IconButton>
                }
            >
                {multipleMapSupported && (
                    <SelectItem
                        size="small"
                        options={options}
                        currentValue={currentValue}
                        setValue={(e) => {
                            mutate(e.value);
                        }}
                        disabled={isSwitching}
                        loadingOptions={mapsIsPending}
                        loadError={mapsIsError}
                    />
                )}
            </ControlsCard>
            <MapSettings
                open={settingsDialogOpen}
                onClose={() => setSettingsDialogOpen(false)}
            />
        </>
    );
};

export default MultipleMap;
