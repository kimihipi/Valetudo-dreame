import React from "react";
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    styled,
    Box,
    List,
    Typography,
    Slider,
    TextField,
    Stack,
    Avatar,
    ListItem,
    ListItemAvatar,
    ListItemText,
    Collapse,
    Icon,
    Switch,
    Select,
    MenuItem,
} from "@mui/material";
import {useCapabilitiesSupported} from "../CapabilitiesProvider";
import {
    Capability,
    CarpetSensorMode,
    Quirk,
    useCameraLightControlMutation,
    useCameraLightControlQuery,
    useCarpetModeStateMutation,
    useCarpetModeStateQuery,
    useCarpetSensorModeMutation,
    useCarpetSensorModePropertiesQuery,
    useCarpetSensorModeQuery,
    useCollisionAvoidantNavigationControlMutation,
    useCollisionAvoidantNavigationControlQuery,
    useFloorMaterialDirectionAwareNavigationControlMutation,
    useFloorMaterialDirectionAwareNavigationControlQuery,
    useKeyLockStateMutation,
    useKeyLockStateQuery,
    useLocateMutation,
    useMopExtensionControlMutation,
    useMopExtensionControlQuery,
    useMopExtensionFurnitureLegHandlingControlMutation,
    useMopExtensionFurnitureLegHandlingControlQuery,
    useMopTwistControlMutation,
    useMopTwistControlQuery,
    useObstacleAvoidanceControlMutation,
    useObstacleAvoidanceControlQuery,
    useObstacleImagesMutation,
    useObstacleImagesQuery,
    usePetObstacleAvoidanceControlMutation,
    usePetObstacleAvoidanceControlQuery,
    useSuctionBoostControlMutation,
    useSuctionBoostControlQuery,
    useQuirksQuery,
    useSetQuirkValueMutation,
    useSpeakerVolumeStateQuery,
    useSpeakerVolumeMutation,
    useSpeakerTestTriggerTriggerMutation,
    useSpeakerPlayAudioListQuery,
    useSpeakerPlayAudioTriggerMutation,
    useDoNotDisturbConfigurationQuery,
    useDoNotDisturbConfigurationMutation,
    DoNotDisturbConfiguration,
    useEnergySavingChargingConfigurationQuery,
    useEnergySavingChargingConfigurationMutation,
    useVoicePackManagementStateQuery,
    useVoicePackManagementMutation,
    VoicePackManagementCommand,
} from "../api";
import {SelectListMenuItem, SelectListMenuItemOption} from "../components/list_menu/SelectListMenuItem";
import {ToggleSwitchListMenuItem} from "../components/list_menu/ToggleSwitchListMenuItem";
import {SpacerListMenuItem} from "../components/list_menu/SpacerListMenuItem";
import {SubHeaderListMenuItem} from "../components/list_menu/SubHeaderListMenuItem";
import {ButtonListMenuItem} from "../components/list_menu/ButtonListMenuItem";
import {
    Cable as ObstacleAvoidanceControlIcon,
    Explore as FloorMaterialDirectionAwareNavigationControlIcon,
    FlashlightOn as CameraLightControlIcon,
    KeyboardDoubleArrowUp as CarpetModeIcon,
    Lock as KeyLockIcon,
    MiscellaneousServices as SystemIcon,
    NotListedLocation as LocateIcon,
    Pets as PetObstacleAvoidanceControlIcon,
    Photo as ObstacleImagesIcon,
    RoundaboutRight as CollisionAvoidantNavigationControlIcon,
    SatelliteAlt as PerceptionIcon,
    Schema as BehaviourIcon,
    Settings as GeneralIcon,
    Star as QuirksIcon,
    TableBar as MopExtensionFurnitureLegHandlingControlIcon,
    TrendingUp as SuctionBoostControlIcon,
    Troubleshoot as CarpetSensorModeIcon,
    VolumeUp as SpeakerIcon,
    VolumeDown as VolumeDownIcon,
    VolumeUp as VolumeUpIcon,
    BatteryChargingFull as EnergySavingChargingIcon,
    Notifications as DoNotDisturbIcon,
    ExpandLess as CollapseIcon,
    ExpandMore as ExpandIcon,
    AudioFile as VoicePackIcon,
} from "@mui/icons-material";
import {
    MopExtensionControlCapability as MopExtensionControlCapabilityIcon,
    MopTwistControlCapability as MopTwistControlCapabilityIcon,
    MopTwistControlCapabilityExtended as MopTwistControlCapabilityExtendedIcon,
} from "../components/CustomIcons";

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

// ── General ──────────────────────────────────────────────────────────────────

const LocateSetting = () => {
    const {mutate: locate, isPending: locateIsExecuting} = useLocateMutation();

    return (
        <ButtonListMenuItem
            primaryLabel="Locate Robot"
            secondaryLabel="The robot will play a sound to announce its location"
            icon={<LocateIcon/>}
            buttonLabel="Go"
            action={() => locate()}
            actionLoading={locateIsExecuting}
        />
    );
};

const KeyLockSetting = () => {
    const {data, isFetching, isError} = useKeyLockStateQuery();
    const {mutate, isPending: isChanging} = useKeyLockStateMutation();
    const disabled = isFetching || isChanging || isError;

    return (
        <ToggleSwitchListMenuItem
            value={data?.enabled ?? false}
            setValue={(value) => mutate(value)}
            disabled={disabled}
            loadError={isError}
            primaryLabel="Lock Keys"
            secondaryLabel="Prevents the robot from being operated using its physical buttons."
            icon={<KeyLockIcon/>}
        />
    );
};

// ── Behaviour ─────────────────────────────────────────────────────────────────

const CollisionAvoidantNavigationSetting = () => {
    const {data, isFetching, isError} = useCollisionAvoidantNavigationControlQuery();
    const {mutate, isPending: isChanging} = useCollisionAvoidantNavigationControlMutation();
    const disabled = isFetching || isChanging || isError;

    return (
        <ToggleSwitchListMenuItem
            value={data?.enabled ?? false}
            setValue={(value) => mutate(value)}
            disabled={disabled}
            loadError={isError}
            primaryLabel="Collision-avoidant Navigation"
            secondaryLabel="Drive a more conservative route to reduce collisions. May cause missed spots."
            icon={<CollisionAvoidantNavigationControlIcon/>}
        />
    );
};

const FloorMaterialDirectionAwareNavigationSetting = () => {
    const {data, isFetching, isError} = useFloorMaterialDirectionAwareNavigationControlQuery();
    const {mutate, isPending: isChanging} = useFloorMaterialDirectionAwareNavigationControlMutation();
    const disabled = isFetching || isChanging || isError;

    return (
        <ToggleSwitchListMenuItem
            value={data?.enabled ?? false}
            setValue={(value) => mutate(value)}
            disabled={disabled}
            loadError={isError}
            primaryLabel="Material-aligned Navigation"
            secondaryLabel="Clean along the direction of the configured/detected floor material (if applicable)."
            icon={<FloorMaterialDirectionAwareNavigationControlIcon/>}
        />
    );
};

const CarpetModeSetting = () => {
    const {data, isFetching, isError} = useCarpetModeStateQuery();
    const {mutate, isPending: isChanging} = useCarpetModeStateMutation();
    const disabled = isFetching || isChanging || isError;

    return (
        <ToggleSwitchListMenuItem
            value={data?.enabled ?? false}
            setValue={(value) => mutate(value)}
            disabled={disabled}
            loadError={isError}
            primaryLabel="Carpet Mode"
            secondaryLabel="When enabled, the vacuum will recognize carpets automatically and increase the suction."
            icon={<CarpetModeIcon/>}
        />
    );
};

const CarpetSensorModeSetting = () => {
    const SORT_ORDER: Record<CarpetSensorMode, number> = {
        "lift": 1,
        "avoid": 2,
        "detach": 3,
        "off": 4,
    };

    const {
        data: properties,
        isPending: propertiesPending,
        isError: propertiesError,
    } = useCarpetSensorModePropertiesQuery();

    const options: SelectListMenuItemOption[] = (properties?.supportedModes ?? [])
        .sort((a, b) => (SORT_ORDER[a] ?? 10) - (SORT_ORDER[b] ?? 10))
        .map((val: CarpetSensorMode) => {
            let label: string;
            switch (val) {
                case "off": label = "None"; break;
                case "avoid": label = "Avoid Carpet"; break;
                case "lift": label = "Lift Mop"; break;
                case "detach": label = "Detach Mop"; break;
                default: label = val; break;
            }
            return {value: val, label: label};
        });

    const {data, isPending, isFetching, isError} = useCarpetSensorModeQuery();
    const {mutate, isPending: isChanging} = useCarpetSensorModeMutation();
    const disabled = isFetching || isChanging || isError;
    const currentValue = options.find(o => o.value === data) ?? {value: "", label: ""};

    return (
        <SelectListMenuItem
            primaryLabel="Carpet Sensor"
            secondaryLabel="Select what action the robot should take if it detects carpet while mopping."
            icon={<CarpetSensorModeIcon/>}
            options={options}
            currentValue={currentValue}
            setValue={(e) => mutate(e.value as CarpetSensorMode)}
            disabled={disabled}
            loadingOptions={propertiesPending || isPending}
            loadError={propertiesError}
        />
    );
};

const MopExtensionSetting = () => {
    const {data, isFetching, isError} = useMopExtensionControlQuery();
    const {mutate, isPending: isChanging} = useMopExtensionControlMutation();
    const disabled = isFetching || isChanging || isError;

    return (
        <ToggleSwitchListMenuItem
            value={data?.enabled ?? false}
            setValue={(value) => mutate(value)}
            disabled={disabled}
            loadError={isError}
            primaryLabel="Mop Extension"
            secondaryLabel="Extend the mop outwards to reach closer to walls and furniture."
            icon={<MopExtensionControlCapabilityIcon/>}
        />
    );
};

const MopTwistSetting = () => {
    const [mopExtensionSupported] = useCapabilitiesSupported(Capability.MopExtensionControl);
    const {data, isFetching, isError} = useMopTwistControlQuery();
    const {mutate, isPending: isChanging} = useMopTwistControlMutation();
    const disabled = isFetching || isChanging || isError;

    const secondaryLabel = mopExtensionSupported ?
        "With the mop extended, twist the robot to further reach below furniture and other overhangs." :
        "Twist the robot to mop closer to walls and furniture. Will increase the cleanup duration.";
    const icon = mopExtensionSupported ?
        <MopTwistControlCapabilityExtendedIcon/> :
        <MopTwistControlCapabilityIcon/>;

    return (
        <ToggleSwitchListMenuItem
            value={data?.enabled ?? false}
            setValue={(value) => mutate(value)}
            disabled={disabled}
            loadError={isError}
            primaryLabel="Mop Twist"
            secondaryLabel={secondaryLabel}
            icon={icon}
        />
    );
};

const MopExtensionFurnitureLegHandlingSetting = () => {
    const {data, isFetching, isError} = useMopExtensionFurnitureLegHandlingControlQuery();
    const {mutate, isPending: isChanging} = useMopExtensionFurnitureLegHandlingControlMutation();
    const disabled = isFetching || isChanging || isError;

    return (
        <ToggleSwitchListMenuItem
            value={data?.enabled ?? false}
            setValue={(value) => mutate(value)}
            disabled={disabled}
            loadError={isError}
            primaryLabel="Mop Extension for Furniture Legs"
            secondaryLabel="Use the extending mop to mop up close to legs of chairs and tables."
            icon={<MopExtensionFurnitureLegHandlingControlIcon/>}
        />
    );
};

const SuctionBoostSetting = () => {
    const {data, isFetching, isError} = useSuctionBoostControlQuery();
    const {mutate, isPending: isChanging} = useSuctionBoostControlMutation();
    const disabled = isFetching || isChanging || isError;

    return (
        <ToggleSwitchListMenuItem
            value={data?.enabled ?? false}
            setValue={(value) => mutate(value)}
            disabled={disabled}
            loadError={isError}
            primaryLabel="Suction Boost"
            secondaryLabel="Boost suction for the next operation. Reverts after each cleaning."
            icon={<SuctionBoostControlIcon/>}
        />
    );
};

// ── Perception ────────────────────────────────────────────────────────────────

const ObstacleAvoidanceSetting = () => {
    const {data, isFetching, isError} = useObstacleAvoidanceControlQuery();
    const {mutate, isPending: isChanging} = useObstacleAvoidanceControlMutation();
    const disabled = isFetching || isChanging || isError;

    return (
        <ToggleSwitchListMenuItem
            value={data?.enabled ?? false}
            setValue={(value) => mutate(value)}
            disabled={disabled}
            loadError={isError}
            primaryLabel="Obstacle Avoidance"
            secondaryLabel="Avoid obstacles using sensors such as lasers or cameras. May suffer from false positives."
            icon={<ObstacleAvoidanceControlIcon/>}
        />
    );
};

const PetObstacleAvoidanceSetting = () => {
    const {data, isFetching, isError} = usePetObstacleAvoidanceControlQuery();
    const {mutate, isPending: isChanging} = usePetObstacleAvoidanceControlMutation();
    const disabled = isFetching || isChanging || isError;

    return (
        <ToggleSwitchListMenuItem
            value={data?.enabled ?? false}
            setValue={(value) => mutate(value)}
            disabled={disabled}
            loadError={isError}
            primaryLabel="Pet Obstacle Avoidance"
            secondaryLabel="Fine-tune obstacle avoidance to avoid obstacles left by pets. Will increase the general false positive rate."
            icon={<PetObstacleAvoidanceControlIcon/>}
        />
    );
};

const ObstacleImagesSetting = () => {
    const {data, isFetching, isError} = useObstacleImagesQuery();
    const {mutate, isPending: isChanging} = useObstacleImagesMutation();
    const disabled = isFetching || isChanging || isError;

    return (
        <ToggleSwitchListMenuItem
            value={data?.enabled ?? false}
            setValue={(value) => mutate(value)}
            disabled={disabled}
            loadError={isError}
            primaryLabel="Obstacle Images"
            secondaryLabel="Take pictures of all encountered obstacles."
            icon={<ObstacleImagesIcon/>}
        />
    );
};

const CameraLightSetting = () => {
    const {data, isFetching, isError} = useCameraLightControlQuery();
    const {mutate, isPending: isChanging} = useCameraLightControlMutation();
    const disabled = isFetching || isChanging || isError;

    return (
        <ToggleSwitchListMenuItem
            value={data?.enabled ?? false}
            setValue={(value) => mutate(value)}
            disabled={disabled}
            loadError={isError}
            primaryLabel="Camera Light"
            secondaryLabel="Illuminate the dark to improve the AI image recognition obstacle avoidance."
            icon={<CameraLightControlIcon/>}
        />
    );
};

// ── Quirks ────────────────────────────────────────────────────────────────────

const QuirkSetting: React.FC<{quirk: Quirk}> = ({quirk}) => {
    const {mutate, isPending: isChanging} = useSetQuirkValueMutation();

    const options: SelectListMenuItemOption[] = quirk.options.map((option) => ({
        value: option,
        label: option,
    }));

    const currentValue = options.find(o => o.value === quirk.value) ?? {value: "", label: ""};

    return (
        <SelectListMenuItem
            primaryLabel={quirk.title}
            secondaryLabel={quirk.description}
            icon={<QuirksIcon/>}
            options={options}
            currentValue={currentValue}
            setValue={(e) => {
                mutate({
                    id: quirk.id,
                    value: e.value,
                });
            }}
            disabled={isChanging}
            loadingOptions={false}
            loadError={false}
        />
    );
};

// ── System Options ────────────────────────────────────────────────────────────

const SpeakerVolumeSetting = () => {
    const {data: speakerVolume, isFetching} = useSpeakerVolumeStateQuery();
    const {mutate: changeSpeakerVolume, isPending: isChanging} = useSpeakerVolumeMutation();
    const {mutate: testSpeaker, isPending: speakerTesting} = useSpeakerTestTriggerTriggerMutation();

    const currentVolume = speakerVolume?.volume ?? 0;
    const [sliderValue, setSliderValue] = React.useState(currentVolume);

    React.useEffect(() => {
        setSliderValue(currentVolume);
    }, [currentVolume]);

    const handleCommit = (_: Event | React.SyntheticEvent, value: number | number[]) => {
        changeSpeakerVolume(value as number);
    };

    return (
        <ListItem style={{userSelect: "none"}}>
            <ListItemAvatar>
                <Avatar>
                    <SpeakerIcon/>
                </Avatar>
            </ListItemAvatar>
            <ListItemText
                primary="Robot Speaker"
                secondary="Change the robot speaker volume level."
                style={{marginRight: "2rem"}}
            />
            <Stack spacing={2} direction="row" sx={{alignItems: "center", minWidth: "200px"}}>
                <VolumeDownIcon sx={{fontSize: "1.25rem"}}/>
                <Slider
                    min={0}
                    max={100}
                    value={sliderValue}
                    onChange={(_, value) => setSliderValue(value as number)}
                    onChangeCommitted={handleCommit}
                    disabled={isFetching || isChanging}
                    valueLabelDisplay="auto"
                    valueLabelFormat={(value) => `${value}%`}
                    sx={{flex: 1}}
                />
                <VolumeUpIcon sx={{fontSize: "1.25rem"}}/>
            </Stack>
            <Button
                variant="outlined"
                disabled={speakerTesting}
                onClick={() => testSpeaker()}
                sx={{ml: 1, whiteSpace: "nowrap"}}
            >
                Test
            </Button>
        </ListItem>
    );
};

const PlayAudioSetting = () => {
    const {data: audioList} = useSpeakerPlayAudioListQuery();
    const {mutate: trigger, isPending: isTriggering} = useSpeakerPlayAudioTriggerMutation();

    const [currentValue, setCurrentValue] = React.useState<string>("");

    React.useEffect(() => {
        if (audioList && audioList.length > 0 && currentValue === "") {
            setCurrentValue(audioList[0].id);
        }
    }, [audioList, currentValue]);

    return (
        <ListItem>
            <ListItemAvatar>
                <Avatar>
                    <SpeakerIcon/>
                </Avatar>
            </ListItemAvatar>
            <ListItemText
                primary="Play Audio"
                secondary="Select and play a sound"
                style={{marginRight: "2rem"}}
            />
            <Stack direction="row" spacing={1} alignItems="center">
                <Select
                    value={currentValue}
                    onChange={(e) => setCurrentValue(e.target.value)}
                    disabled={isTriggering || !audioList || audioList.length === 0}
                    size="small"
                    sx={{width: 150}}
                >
                    {(audioList ?? []).map((entry) => (
                        <MenuItem key={entry.id} value={entry.id}>
                            {entry.name}
                        </MenuItem>
                    ))}
                </Select>
                <Button
                    variant="outlined"
                    color="success"
                    loading={isTriggering}
                    disabled={currentValue === "" || !audioList || audioList.length === 0}
                    onClick={() => trigger(currentValue)}
                    sx={{whiteSpace: "nowrap"}}
                >
                    Play
                </Button>
            </Stack>
        </ListItem>
    );
};

const DoNotDisturbSetting = () => {
    const {data: dndConfig} = useDoNotDisturbConfigurationQuery();
    const {mutate: updateDndConfiguration, isPending: isUpdating} = useDoNotDisturbConfigurationMutation();

    const [expanded, setExpanded] = React.useState(false);
    const [editConfig, setEditConfig] = React.useState<DoNotDisturbConfiguration | null>(null);

    React.useEffect(() => {
        if (dndConfig) {
            setEditConfig(dndConfig);
        }
    }, [dndConfig]);

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

    const handleTimeChange = (type: "start" | "end", hours: number, minutes: number) => {
        if (editConfig) {
            const date = new Date();
            date.setHours(hours, minutes, 0, 0);
            const newConfig: DoNotDisturbConfiguration = {
                ...editConfig,
                [type]: {hour: date.getUTCHours(), minute: date.getUTCMinutes()},
            };
            setEditConfig(newConfig);
        }
    };

    const handleApply = () => {
        if (editConfig) {
            updateDndConfiguration(editConfig);
        }
    };

    const formatTimeDisplay = () => {
        if (!dndConfig?.enabled) {
            return "Disabled";
        }
        const startDate = new Date();
        startDate.setUTCHours(dndConfig.start.hour, dndConfig.start.minute, 0, 0);
        const endDate = new Date();
        endDate.setUTCHours(dndConfig.end.hour, dndConfig.end.minute, 0, 0);
        const start = `${startDate.getHours().toString().padStart(2, "0")}:${startDate.getMinutes().toString().padStart(2, "0")}`;
        const end = `${endDate.getHours().toString().padStart(2, "0")}:${endDate.getMinutes().toString().padStart(2, "0")}`;
        return `${start} - ${end}`;
    };

    return (
        <>
            <ListItem
                onClick={() => setExpanded(!expanded)}
                sx={{cursor: "pointer"}}
            >
                <ListItemAvatar>
                    <Avatar>
                        <DoNotDisturbIcon/>
                    </Avatar>
                </ListItemAvatar>
                <ListItemText
                    primary="Do Not Disturb"
                    secondary={formatTimeDisplay()}
                />
                <Icon component={expanded ? CollapseIcon : ExpandIcon}/>
            </ListItem>
            {expanded && (
                <Box sx={{px: 2, py: 1}}>
                    <Stack spacing={1}>
                        <Box sx={{display: "flex", alignItems: "center", justifyContent: "space-between", px: 0.5}}>
                            <Typography variant="body2">Enable</Typography>
                            <Switch
                                checked={dndConfig?.enabled ?? false}
                                onChange={(e) => {
                                    if (dndConfig) {
                                        const newConfig: DoNotDisturbConfiguration = {
                                            ...dndConfig,
                                            enabled: e.target.checked,
                                        };
                                        updateDndConfiguration(newConfig);
                                    }
                                }}
                                disabled={isUpdating}
                                size="small"
                            />
                        </Box>
                        {editConfig?.enabled && (
                            <>
                                <Box sx={{display: "flex", gap: 1, alignItems: "center"}}>
                                    <TextField
                                        type="time"
                                        label="Start Time"
                                        value={`${startTimeValue.getHours().toString().padStart(2, "0")}:${startTimeValue.getMinutes().toString().padStart(2, "0")}`}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                            const [hour, minute] = e.target.value.split(":").map(Number);
                                            handleTimeChange("start", hour, minute);
                                        }}
                                        disabled={isUpdating}
                                        size="small"
                                        slotProps={{htmlInput: {sx: {fontSize: "0.875rem"}}}}
                                        sx={{flex: 1}}
                                    />
                                    <TextField
                                        type="time"
                                        label="End Time"
                                        value={`${endTimeValue.getHours().toString().padStart(2, "0")}:${endTimeValue.getMinutes().toString().padStart(2, "0")}`}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                            const [hour, minute] = e.target.value.split(":").map(Number);
                                            handleTimeChange("end", hour, minute);
                                        }}
                                        disabled={isUpdating}
                                        size="small"
                                        slotProps={{htmlInput: {sx: {fontSize: "0.875rem"}}}}
                                        sx={{flex: 1}}
                                    />
                                    <Button
                                        variant="outlined"
                                        onClick={handleApply}
                                        disabled={isUpdating}
                                        sx={{whiteSpace: "nowrap"}}
                                    >
                                        Apply
                                    </Button>
                                </Box>
                                <Typography variant="caption" color="textSecondary">
                                    UTC: {String(editConfig.start.hour).padStart(2, "0")}:{String(editConfig.start.minute).padStart(2, "0")} — {String(editConfig.end.hour).padStart(2, "0")}:{String(editConfig.end.minute).padStart(2, "0")}
                                </Typography>
                            </>
                        )}
                    </Stack>
                </Box>
            )}
        </>
    );
};

const EnergySavingChargingSetting = () => {
    const {data: config} = useEnergySavingChargingConfigurationQuery();
    const {mutate: updateConfiguration, isPending: isUpdating} = useEnergySavingChargingConfigurationMutation();

    const [expanded, setExpanded] = React.useState(false);
    const [editConfig, setEditConfig] = React.useState<DoNotDisturbConfiguration | null>(null);

    React.useEffect(() => {
        if (config) {
            setEditConfig(config);
        }
    }, [config]);

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

    const handleTimeChange = (type: "start" | "end", hours: number, minutes: number) => {
        if (editConfig) {
            const date = new Date();
            date.setHours(hours, minutes, 0, 0);
            const newConfig: DoNotDisturbConfiguration = {
                ...editConfig,
                [type]: {hour: date.getUTCHours(), minute: date.getUTCMinutes()},
            };
            setEditConfig(newConfig);
        }
    };

    const handleApply = () => {
        if (editConfig) {
            updateConfiguration(editConfig);
        }
    };

    const formatTimeDisplay = () => {
        if (!config?.enabled) {
            return "Disabled";
        }
        const startDate = new Date();
        startDate.setUTCHours(config.start.hour, config.start.minute, 0, 0);
        const endDate = new Date();
        endDate.setUTCHours(config.end.hour, config.end.minute, 0, 0);
        const start = `${startDate.getHours().toString().padStart(2, "0")}:${startDate.getMinutes().toString().padStart(2, "0")}`;
        const end = `${endDate.getHours().toString().padStart(2, "0")}:${endDate.getMinutes().toString().padStart(2, "0")}`;
        return `${start} - ${end}`;
    };

    return (
        <>
            <ListItem
                onClick={() => setExpanded(!expanded)}
                sx={{cursor: "pointer"}}
            >
                <ListItemAvatar>
                    <Avatar>
                        <EnergySavingChargingIcon/>
                    </Avatar>
                </ListItemAvatar>
                <ListItemText
                    primary="Energy Saving Charging"
                    secondary={formatTimeDisplay()}
                />
                <Icon component={expanded ? CollapseIcon : ExpandIcon}/>
            </ListItem>
            {expanded && (
                <Box sx={{px: 2, py: 1}}>
                    <Stack spacing={1}>
                        <Box sx={{display: "flex", alignItems: "center", justifyContent: "space-between", px: 0.5}}>
                            <Typography variant="body2">Enable</Typography>
                            <Switch
                                checked={config?.enabled ?? false}
                                onChange={(e) => {
                                    if (config) {
                                        const newConfig: DoNotDisturbConfiguration = {
                                            ...config,
                                            enabled: e.target.checked,
                                        };
                                        updateConfiguration(newConfig);
                                    }
                                }}
                                disabled={isUpdating}
                                size="small"
                            />
                        </Box>
                        {editConfig?.enabled && (
                            <>
                                <Box sx={{display: "flex", gap: 1, alignItems: "center"}}>
                                    <TextField
                                        type="time"
                                        label="Start Time"
                                        value={`${startTimeValue.getHours().toString().padStart(2, "0")}:${startTimeValue.getMinutes().toString().padStart(2, "0")}`}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                            const [hour, minute] = e.target.value.split(":").map(Number);
                                            handleTimeChange("start", hour, minute);
                                        }}
                                        disabled={isUpdating}
                                        size="small"
                                        slotProps={{htmlInput: {sx: {fontSize: "0.875rem"}}}}
                                        sx={{flex: 1}}
                                    />
                                    <TextField
                                        type="time"
                                        label="End Time"
                                        value={`${endTimeValue.getHours().toString().padStart(2, "0")}:${endTimeValue.getMinutes().toString().padStart(2, "0")}`}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                            const [hour, minute] = e.target.value.split(":").map(Number);
                                            handleTimeChange("end", hour, minute);
                                        }}
                                        disabled={isUpdating}
                                        size="small"
                                        slotProps={{htmlInput: {sx: {fontSize: "0.875rem"}}}}
                                        sx={{flex: 1}}
                                    />
                                    <Button
                                        variant="outlined"
                                        onClick={handleApply}
                                        disabled={isUpdating}
                                        sx={{whiteSpace: "nowrap"}}
                                    >
                                        Apply
                                    </Button>
                                </Box>
                                <Typography variant="caption" color="textSecondary">
                                    UTC: {String(editConfig.start.hour).padStart(2, "0")}:{String(editConfig.start.minute).padStart(2, "0")} — {String(editConfig.end.hour).padStart(2, "0")}:{String(editConfig.end.minute).padStart(2, "0")}
                                </Typography>
                            </>
                        )}
                    </Stack>
                </Box>
            )}
        </>
    );
};

const VoicePackSetting = () => {
    const {data: voicePackStatus} = useVoicePackManagementStateQuery();
    const {mutate: updateVoicePack, isPending: isUpdating} = useVoicePackManagementMutation();

    const [expanded, setExpanded] = React.useState(false);
    const [url, setUrl] = React.useState("");
    const [languageCode, setLanguageCode] = React.useState("");
    const [hash, setHash] = React.useState("");

    const isOperating = voicePackStatus?.operationStatus.type === "downloading" || voicePackStatus?.operationStatus.type === "installing";
    const currentLanguage = voicePackStatus?.currentLanguage ?? "Unknown";

    const handleSetVoicePack = () => {
        const command: VoicePackManagementCommand = {
            action: "download",
            url: url,
            language: languageCode,
            hash: hash,
        };
        updateVoicePack(command);
        setUrl("");
        setLanguageCode("");
        setHash("");
    };

    return (
        <>
            <ListItem
                onClick={() => setExpanded(!expanded)}
                sx={{cursor: "pointer"}}
            >
                <ListItemAvatar>
                    <Avatar>
                        <VoicePackIcon/>
                    </Avatar>
                </ListItemAvatar>
                <ListItemText
                    primary="Voice Packs"
                    secondary={`Current: ${currentLanguage}`}
                />
                <Icon component={expanded ? CollapseIcon : ExpandIcon}/>
            </ListItem>
            {expanded && (
                <Box sx={{px: 2, py: 1}}>
                    <Stack spacing={1}>
                        {isOperating && (
                            <Typography variant="caption" color="info.main">
                                {voicePackStatus?.operationStatus.type === "downloading" ? "Downloading..." : "Installing..."}
                            </Typography>
                        )}
                        <TextField
                            label="URL"
                            value={url}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUrl(e.target.value)}
                            placeholder="https://"
                            disabled={isUpdating || isOperating}
                            size="small"
                            fullWidth
                        />
                        <TextField
                            label="Language Code"
                            value={languageCode}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLanguageCode(e.target.value)}
                            placeholder="VA"
                            disabled={isUpdating || isOperating}
                            size="small"
                            fullWidth
                        />
                        <TextField
                            label="Hash"
                            value={hash}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setHash(e.target.value)}
                            disabled={isUpdating || isOperating}
                            size="small"
                            fullWidth
                        />
                        <Button
                            variant="outlined"
                            onClick={handleSetVoicePack}
                            disabled={isUpdating || isOperating || !url || !languageCode || !hash}
                        >
                            Set Voice Pack
                        </Button>
                    </Stack>
                </Box>
            )}
        </>
    );
};

// ── Dialog ────────────────────────────────────────────────────────────────────

const RobotSettings: React.FC<{
    open: boolean;
    onClose: () => void;
}> = ({open, onClose}) => {
    const [
        locateSupported,
        keyLockSupported,
        collisionAvoidantNavigationSupported,
        floorMaterialNavigationSupported,
        carpetModeSupported,
        carpetSensorModeSupported,
        mopExtensionSupported,
        mopTwistSupported,
        mopExtensionFurnitureLegSupported,
        suctionBoostSupported,
        obstacleAvoidanceSupported,
        petObstacleAvoidanceSupported,
        obstacleImagesSupported,
        cameraLightSupported,
        quirksSupported,
        speakerVolumeSupported,
        speakerPlayAudioSupported,
        doNotDisturbSupported,
        voicePackManagementSupported,
        energySavingChargingSupported,
    ] = useCapabilitiesSupported(
        Capability.Locate,
        Capability.KeyLock,
        Capability.CollisionAvoidantNavigation,
        Capability.FloorMaterialDirectionAwareNavigationControl,
        Capability.CarpetModeControl,
        Capability.CarpetSensorModeControl,
        Capability.MopExtensionControl,
        Capability.MopTwistControl,
        Capability.MopExtensionFurnitureLegHandlingControl,
        Capability.SuctionBoostControl,
        Capability.ObstacleAvoidanceControl,
        Capability.PetObstacleAvoidanceControl,
        Capability.ObstacleImages,
        Capability.CameraLightControl,
        Capability.Quirks,
        Capability.SpeakerVolumeControl,
        Capability.SpeakerPlayAudio,
        Capability.DoNotDisturb,
        Capability.VoicePackManagement,
        Capability.EnergySavingCharging,
    );

    const {data: quirks} = useQuirksQuery();

    const [quirksExpanded, setQuirksExpanded] = React.useState(false);

    const listItems = React.useMemo(() => {
        const items: React.ReactElement[] = [];

        const addGroup = (groupItems: React.ReactElement[], title: string, icon: React.ReactElement) => {
            if (groupItems.length === 0) {
                return;
            }
            items.push(
                <SubHeaderListMenuItem key={`header-${title}`} primaryLabel={title} icon={icon}/>
            );
            items.push(...groupItems);
            items.push(<SpacerListMenuItem key={`spacer-${title}`} halfHeight={true}/>);
        };

        const generalItems: React.ReactElement[] = [];
        if (locateSupported) {
            generalItems.push(<LocateSetting key="locate"/>);
        }
        if (keyLockSupported) {
            generalItems.push(<KeyLockSetting key="keyLock"/>);
        }
        if (speakerVolumeSupported) {
            generalItems.push(<SpeakerVolumeSetting key="speakerVolume"/>);
        }

        const behaviourItems: React.ReactElement[] = [];
        if (collisionAvoidantNavigationSupported) {
            behaviourItems.push(<CollisionAvoidantNavigationSetting key="collisionAvoidant"/>);
        }
        if (floorMaterialNavigationSupported) {
            behaviourItems.push(<FloorMaterialDirectionAwareNavigationSetting key="floorMaterial"/>);
        }
        if (carpetModeSupported) {
            behaviourItems.push(<CarpetModeSetting key="carpetMode"/>);
        }
        if (carpetSensorModeSupported) {
            behaviourItems.push(<CarpetSensorModeSetting key="carpetSensorMode"/>);
        }
        if (mopExtensionSupported) {
            behaviourItems.push(<MopExtensionSetting key="mopExtension"/>);
        }
        if (mopTwistSupported) {
            behaviourItems.push(<MopTwistSetting key="mopTwist"/>);
        }
        if (mopExtensionFurnitureLegSupported) {
            behaviourItems.push(<MopExtensionFurnitureLegHandlingSetting key="mopFurnitureLeg"/>);
        }
        if (suctionBoostSupported) {
            behaviourItems.push(<SuctionBoostSetting key="suctionBoost"/>);
        }

        const perceptionItems: React.ReactElement[] = [];
        if (obstacleAvoidanceSupported) {
            perceptionItems.push(<ObstacleAvoidanceSetting key="obstacleAvoidance"/>);
        }
        if (petObstacleAvoidanceSupported) {
            perceptionItems.push(<PetObstacleAvoidanceSetting key="petObstacleAvoidance"/>);
        }
        if (obstacleImagesSupported) {
            perceptionItems.push(<ObstacleImagesSetting key="obstacleImages"/>);
        }
        if (cameraLightSupported) {
            perceptionItems.push(<CameraLightSetting key="cameraLight"/>);
        }

        addGroup(generalItems, "General", <GeneralIcon/>);
        addGroup(behaviourItems, "Behaviour", <BehaviourIcon/>);
        addGroup(perceptionItems, "Perception", <PerceptionIcon/>);

        // Remove trailing spacer
        if (items.length > 0 && items[items.length - 1].key?.toString().startsWith(".$spacer-")) {
            items.pop();
        }

        // Add System Options section
        const systemItems: React.ReactElement[] = [];
        if (speakerPlayAudioSupported) {
            systemItems.push(<PlayAudioSetting key="playAudio"/>);
        }
        if (doNotDisturbSupported) {
            systemItems.push(<DoNotDisturbSetting key="doNotDisturb"/>);
        }
        if (energySavingChargingSupported) {
            systemItems.push(<EnergySavingChargingSetting key="energySavingCharging"/>);
        }
        if (voicePackManagementSupported) {
            systemItems.push(<VoicePackSetting key="voicePacks"/>);
        }
        addGroup(systemItems, "System", <SystemIcon/>);

        // Add Quirks section with collapsible header at the bottom
        if (quirksSupported && quirks && Array.isArray(quirks) && quirks.length > 0) {
            const sortedQuirks = [...quirks].sort((a, b) => a.title.localeCompare(b.title));

            items.push(<SpacerListMenuItem key="spacer-before-quirks" halfHeight={true}/>);
            items.push(
                <ListItem
                    key="quirks-header"
                    onClick={() => setQuirksExpanded(!quirksExpanded)}
                    sx={{cursor: "pointer"}}
                >
                    <ListItemAvatar>
                        <Avatar>
                            <QuirksIcon/>
                        </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                        primary="Quirks"
                        secondary={`${sortedQuirks.length} firmware quirks`}
                    />
                    <Icon component={quirksExpanded ? CollapseIcon : ExpandIcon}/>
                </ListItem>
            );
            items.push(
                <Collapse key="quirks-collapse" in={quirksExpanded} timeout="auto" unmountOnExit>
                    <List sx={{width: "100%", p: 0}}>
                        {sortedQuirks.map(q => (
                            <QuirkSetting key={`quirk-${q.id}`} quirk={q}/>
                        ))}
                    </List>
                </Collapse>
            );
        }

        return items;
    }, [
        locateSupported,
        keyLockSupported,
        collisionAvoidantNavigationSupported,
        floorMaterialNavigationSupported,
        carpetModeSupported,
        carpetSensorModeSupported,
        mopExtensionSupported,
        mopTwistSupported,
        mopExtensionFurnitureLegSupported,
        suctionBoostSupported,
        obstacleAvoidanceSupported,
        petObstacleAvoidanceSupported,
        obstacleImagesSupported,
        cameraLightSupported,
        quirksSupported,
        speakerVolumeSupported,
        speakerPlayAudioSupported,
        doNotDisturbSupported,
        voicePackManagementSupported,
        energySavingChargingSupported,
        quirks,
        quirksExpanded,
        setQuirksExpanded,
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
                        backgroundColor: "rgba(0, 0, 0, 0.2)",
                    }
                }
            }}
        >
            <DialogTitle>Robot Settings</DialogTitle>
            <DialogContent>
                <Box sx={{pt: 1}}>
                    {listItems.length > 0 ? (
                        <List sx={{width: "100%", p: 0}}>
                            {listItems}
                        </List>
                    ) : (
                        <div>No robot settings available</div>
                    )}
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Close</Button>
            </DialogActions>
        </StyledDialog>
    );
};

export default RobotSettings;
