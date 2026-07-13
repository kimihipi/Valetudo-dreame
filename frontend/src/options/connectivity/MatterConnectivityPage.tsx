import {
    Box,
    Button,
    Card,
    CardContent,
    Divider,
    FormHelperText,
    FormControlLabel,
    FormControl,
    Grid2,
    InputLabel,
    List,
    ListItem,
    ListItemText,
    MenuItem,
    Select,
    Skeleton,
    Switch,
    Typography,
    useTheme,
} from "@mui/material";
import {
    CheckCircle as ReadyIcon,
    Sync as StartingIcon,
    PowerSettingsNew as DisabledIcon,
    Warning as ErrorIcon,
    RestartAlt as ResetIcon,
    Hub as ConnectivityIcon,
} from "@mui/icons-material";
import {QRCodeSVG} from "qrcode.react";
import React from "react";
import {
    MatterConfiguration,
    MatterStatus,
    useMatterConfigurationMutation,
    useMatterConfigurationQuery,
    useMatterPairingInfoQuery,
    useMatterResetMutation,
    useMatterStatusQuery,
} from "../../api";
import {deepCopy} from "../../utils";
import InfoBox from "../../components/InfoBox";
import PaperContainer from "../../components/PaperContainer";
import DetailPageHeaderRow from "../../components/DetailPageHeaderRow";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import {presetFriendlyNames, sortPresets} from "../../presetUtils";

const MatterStatusComponent: React.FunctionComponent<{
    status: MatterStatus | undefined,
    statusLoading: boolean,
    statusError: boolean
}> = ({
    status,
    statusLoading,
    statusError
}) => {
    if (statusError) {
        return <Typography color="error">Error loading Matter status</Typography>;
    }

    if (statusLoading || !status) {
        return <Skeleton height={"4rem"}/>;
    }

    const getIconForState = (): React.ReactElement => {
        switch (status.state) {
            case "disabled":
                return <DisabledIcon sx={{fontSize: "4rem"}}/>;
            case "starting":
                return <StartingIcon sx={{fontSize: "4rem"}}/>;
            case "ready":
                return <ReadyIcon sx={{fontSize: "4rem"}}/>;
            case "error":
                return <ErrorIcon sx={{fontSize: "4rem"}}/>;
        }
    };

    const getContentForState = (): React.ReactElement => {
        switch (status.state) {
            case "disabled":
                return <Typography variant="h5">Disabled</Typography>;
            case "starting":
                return <Typography variant="h5">Starting</Typography>;
            case "ready":
                return (
                    <Typography variant="h5">
                        {status.commissioned ? "Ready (commissioned)" : "Ready (awaiting commissioner)"}
                    </Typography>
                );
            case "error":
                return (
                    <Typography variant="h5" color="error">
                        {status.lastError ?? "Error"}
                    </Typography>
                );
        }
    };

    return (
        <Grid2 container alignItems="center" direction="column" style={{paddingBottom: "1rem"}}>
            <Grid2 style={{marginTop: "1rem"}}>
                {getIconForState()}
            </Grid2>
            <Grid2
                sx={{
                    maxWidth: "100% !important",
                    wordWrap: "break-word",
                    textAlign: "center",
                    userSelect: "none"
                }}
            >
                {getContentForState()}
            </Grid2>
        </Grid2>
    );
};

const MatterPairingCard: React.FunctionComponent<{
    matterEnabled: boolean,
    commissioned: boolean,
}> = ({matterEnabled, commissioned}) => {
    const theme = useTheme();

    const {
        data: pairing,
        isPending: pairingPending,
        isError: pairingError,
    } = useMatterPairingInfoQuery(matterEnabled && !commissioned);

    if (!matterEnabled) {
        return null;
    }

    if (commissioned) {
        return null;
    }

    if (pairingPending) {
        return <Skeleton height={"18rem"}/>;
    }

    if (pairingError || !pairing) {
        return (
            <Card sx={{boxShadow: 3, marginBottom: "1rem"}}>
                <CardContent>
                    <Typography variant="h6" gutterBottom>Pairing</Typography>
                    <Typography color="error">Pairing information is not available yet.</Typography>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card sx={{boxShadow: 3, marginBottom: "1rem"}}>
            <CardContent>
                <Typography variant="h6" gutterBottom>Pairing</Typography>
                <Divider sx={{mb: 2}}/>

                <Grid2 container spacing={2} alignItems="center">
                    <Grid2 sx={{display: "flex", justifyContent: "center"}}>
                        <Box
                            sx={{
                                background: "#ffffff",
                                padding: "1rem",
                                borderRadius: 1,
                            }}
                        >
                            <QRCodeSVG
                                value={pairing.qrPairingCode}
                                size={220}
                                level="M"
                                bgColor="#ffffff"
                                fgColor="#000000"
                            />
                        </Box>
                    </Grid2>
                    <Grid2 sx={{flexGrow: 1, minWidth: "16rem"}}>
                        <Typography variant="body2" sx={{userSelect: "none", mb: 1}}>
                            Scan this QR code with a Matter-compatible app (Apple Home, Google Home, Alexa,
                            Home Assistant) to add the robot to your smart-home platform.
                        </Typography>
                        <Typography variant="body2" sx={{userSelect: "none", mb: 1}}>
                            Alternatively, enter the manual pairing code:
                        </Typography>
                        <Typography
                            variant="h5"
                            sx={{
                                fontFamily: "monospace",
                                letterSpacing: "0.1em",
                                marginBottom: "0.5rem",
                            }}
                        >
                            {pairing.manualPairingCode.replace(/(\d{4})(\d{4})(\d{3})/, "$1-$2-$3")}
                        </Typography>
                        <Typography variant="caption" color={theme.palette.text.secondary} sx={{display: "block"}}>
                            Setup code: {pairing.qrPairingCode}
                        </Typography>
                    </Grid2>
                </Grid2>
            </CardContent>
        </Card>
    );
};

const MatterFabricsCard: React.FunctionComponent<{
    status: MatterStatus | undefined,
    onReset: () => void,
    resetting: boolean,
}> = ({status, onReset, resetting}) => {
    if (!status || !status.commissioned) {
        return null;
    }

    return (
        <Card sx={{boxShadow: 3, marginBottom: "1rem"}}>
            <CardContent>
                <Typography variant="h6" gutterBottom>Paired fabrics</Typography>
                <Divider sx={{mb: 1}}/>
                {status.fabrics.length === 0 ? (
                    <Typography variant="body2">No fabrics reported.</Typography>
                ) : (
                    <List dense>
                        {status.fabrics.map((f) => (
                            <ListItem key={f.fabricIndex} disableGutters>
                                <ListItemText
                                    primary={f.label || `Fabric ${f.fabricIndex}`}
                                    secondary={`vendor 0x${f.vendorId.toString(16).padStart(4, "0")} · node ${f.nodeId} · fabric ${f.fabricId}`}
                                />
                            </ListItem>
                        ))}
                    </List>
                )}
                <Divider sx={{my: 1}}/>
                <Button
                    color="error"
                    variant="outlined"
                    startIcon={<ResetIcon/>}
                    loading={resetting}
                    onClick={onReset}
                >
                    Reset commissioning
                </Button>
            </CardContent>
        </Card>
    );
};

const MatterConnectivity = (): React.ReactElement => {
    const {
        data: storedMatterConfiguration,
        isPending: matterConfigurationPending,
        isError: matterConfigurationError,
    } = useMatterConfigurationQuery();

    const {
        data: matterStatus,
        isPending: matterStatusPending,
        isError: matterStatusError,
    } = useMatterStatusQuery();

    const {
        mutate: updateMatterConfiguration,
        isPending: matterConfigurationUpdating
    } = useMatterConfigurationMutation();

    const {
        mutate: resetMatter,
        isPending: matterResetting
    } = useMatterResetMutation();

    const [matterConfiguration, setMatterConfiguration] = React.useState<MatterConfiguration | null>(null);
    const [configurationModified, setConfigurationModified] = React.useState<boolean>(false);
    const [resetConfirmOpen, setResetConfirmOpen] = React.useState<boolean>(false);

    React.useEffect(() => {
        if (storedMatterConfiguration && !configurationModified && !matterConfigurationUpdating) {
            setMatterConfiguration(deepCopy(storedMatterConfiguration));
            setConfigurationModified(false);
        }
    }, [storedMatterConfiguration, configurationModified, matterConfigurationUpdating]);

    if (matterConfigurationPending || !matterConfiguration) {
        return (
            <>
                <Skeleton height={"12rem"}/>
                <Divider sx={{mt: 1}} style={{marginBottom: "1rem"}}/>
                <Skeleton height={"8rem"}/>
            </>
        );
    }

    if (matterConfigurationError || !storedMatterConfiguration) {
        return <Typography color="error">Error loading Matter configuration</Typography>;
    }

    const running = matterStatus?.state === "ready";
    const commissioned = matterStatus?.commissioned === true;
    const enabledCleanModeProfileCount = Object.values(matterConfiguration.cleanModeProfiles)
        .filter(profile => profile.enabled).length;

    return (
        <>
            <MatterStatusComponent
                status={matterStatus}
                statusLoading={matterStatusPending}
                statusError={matterStatusError}
            />
            <Divider sx={{mt: 1}} style={{marginBottom: "1rem"}}/>

            <FormControlLabel
                control={
                    <Switch
                        checked={matterConfiguration.enabled}
                        onChange={(e) => {
                            setMatterConfiguration({
                                ...matterConfiguration,
                                enabled: e.target.checked
                            });
                            setConfigurationModified(true);
                        }}
                    />
                }
                label="Matter enabled"
                sx={{userSelect: "none", mb: 1}}
            />

            {running && (
                <MatterPairingCard
                    matterEnabled={matterConfiguration.enabled}
                    commissioned={commissioned}
                />
            )}

            <MatterFabricsCard
                status={matterStatus}
                onReset={() => setResetConfirmOpen(true)}
                resetting={matterResetting}
            />

            <Card sx={{boxShadow: 3, mb: 2}}>
                <CardContent>
                    <Typography variant="h6" gutterBottom>Configuration</Typography>
                    <Divider sx={{mb: 2}}/>

                    {matterStatus?.cleanModeMappingOptions.includes("vacuum_and_mop") &&
                matterStatus.cleanModeMappingOptions.includes("vacuum_then_mop") && (
                        <FormControl fullWidth sx={{mb: 2}}>
                            <InputLabel id="matter-combined-clean-mode-label">Combined clean mode</InputLabel>
                            <Select
                                labelId="matter-combined-clean-mode-label"
                                label="Combined clean mode"
                                value={matterConfiguration.cleanModeMapping}
                                onChange={(e) => {
                                    setMatterConfiguration({
                                        ...matterConfiguration,
                                        cleanModeMapping: e.target.value as MatterConfiguration["cleanModeMapping"]
                                    });
                                    setConfigurationModified(true);
                                }}
                            >
                                <MenuItem value="vacuum_and_mop">
                                    {presetFriendlyNames.vacuum_and_mop}
                                </MenuItem>
                                <MenuItem value="vacuum_then_mop">
                                    {presetFriendlyNames.vacuum_then_mop}
                                </MenuItem>
                            </Select>
                            <FormHelperText sx={{userSelect: "none"}}>
                                Matter exposes one combined vacuum and mop mode. Choose the Valetudo operation it uses.
                            </FormHelperText>
                        </FormControl>
                    )}

                    {matterStatus && (
                        matterStatus.cleanModeStrengthOptions.fan.length > 0 ||
                matterStatus.cleanModeStrengthOptions.water.length > 0 ||
                matterStatus.cleanModeStrengthOptions.route.length > 0
                    ) && (
                        <Box sx={{mt: 1, mb: 2}}>
                            <Typography variant="h6" gutterBottom>Cleaning profiles</Typography>
                            <Typography variant="body2" color="text.secondary" sx={{mb: 2}}>
                            Map Matter&apos;s Minimum, Quiet, Standard, Maximum, and Deep Clean modes to this
                            robot&apos;s Valetudo presets.
                            </Typography>
                            {(["minimum", "quiet", "standard", "maximum", "deepClean"] as const).map(profile => {
                                const profileLabel = profile === "deepClean" ? "Deep Clean" :
                                    profile.charAt(0).toUpperCase() + profile.slice(1);
                                const profileEnabled = matterConfiguration.cleanModeProfiles[profile].enabled;
                                return (
                                    <Box key={profile} sx={{mb: profile === "deepClean" ? 0 : 2}}>
                                        <FormControlLabel
                                            control={
                                                <Switch
                                                    size="small"
                                                    checked={profileEnabled}
                                                    disabled={profileEnabled && enabledCleanModeProfileCount === 1}
                                                    onChange={(e) => {
                                                        setMatterConfiguration({
                                                            ...matterConfiguration,
                                                            cleanModeProfiles: {
                                                                ...matterConfiguration.cleanModeProfiles,
                                                                [profile]: {
                                                                    ...matterConfiguration.cleanModeProfiles[profile],
                                                                    enabled: e.target.checked
                                                                }
                                                            }
                                                        });
                                                        setConfigurationModified(true);
                                                    }}
                                                />
                                            }
                                            label={profileLabel}
                                            sx={{mb: 1, userSelect: "none"}}
                                        />
                                        <Grid2 container spacing={2}>
                                            {matterStatus.cleanModeStrengthOptions.fan.length > 0 && (
                                                <Grid2 sx={{flex: 1, minWidth: "12rem"}}>
                                                    <FormControl fullWidth>
                                                        <InputLabel>{profileLabel} fan speed</InputLabel>
                                                        <Select
                                                            label={`${profileLabel} fan speed`}
                                                            disabled={!profileEnabled}
                                                            value={matterConfiguration.cleanModeProfiles[profile].fan}
                                                            onChange={(e) => {
                                                                setMatterConfiguration({
                                                                    ...matterConfiguration,
                                                                    cleanModeProfiles: {
                                                                        ...matterConfiguration.cleanModeProfiles,
                                                                        [profile]: {
                                                                            ...matterConfiguration.cleanModeProfiles[profile],
                                                                            fan: e.target.value
                                                                        }
                                                                    }
                                                                });
                                                                setConfigurationModified(true);
                                                            }}
                                                        >
                                                            {sortPresets(matterStatus.cleanModeStrengthOptions.fan).map(preset => (
                                                                <MenuItem key={preset} value={preset}>
                                                                    {presetFriendlyNames[preset] ?? preset}
                                                                </MenuItem>
                                                            ))}
                                                        </Select>
                                                    </FormControl>
                                                </Grid2>
                                            )}
                                            {matterStatus.cleanModeStrengthOptions.water.length > 0 && (
                                                <Grid2 sx={{flex: 1, minWidth: "12rem"}}>
                                                    <FormControl fullWidth>
                                                        <InputLabel>{profileLabel} water usage</InputLabel>
                                                        <Select
                                                            label={`${profileLabel} water usage`}
                                                            disabled={!profileEnabled}
                                                            value={matterConfiguration.cleanModeProfiles[profile].water}
                                                            onChange={(e) => {
                                                                setMatterConfiguration({
                                                                    ...matterConfiguration,
                                                                    cleanModeProfiles: {
                                                                        ...matterConfiguration.cleanModeProfiles,
                                                                        [profile]: {
                                                                            ...matterConfiguration.cleanModeProfiles[profile],
                                                                            water: e.target.value
                                                                        }
                                                                    }
                                                                });
                                                                setConfigurationModified(true);
                                                            }}
                                                        >
                                                            {sortPresets(matterStatus.cleanModeStrengthOptions.water).map(preset => (
                                                                <MenuItem key={preset} value={preset}>
                                                                    {presetFriendlyNames[preset] ?? preset}
                                                                </MenuItem>
                                                            ))}
                                                        </Select>
                                                    </FormControl>
                                                </Grid2>
                                            )}
                                            {matterStatus.cleanModeStrengthOptions.route.length > 0 && (
                                                <Grid2 sx={{flex: 1, minWidth: "12rem"}}>
                                                    <FormControl fullWidth>
                                                        <InputLabel>{profileLabel} clean route</InputLabel>
                                                        <Select
                                                            label={`${profileLabel} clean route`}
                                                            disabled={!profileEnabled}
                                                            value={matterConfiguration.cleanModeProfiles[profile].route}
                                                            onChange={(e) => {
                                                                setMatterConfiguration({
                                                                    ...matterConfiguration,
                                                                    cleanModeProfiles: {
                                                                        ...matterConfiguration.cleanModeProfiles,
                                                                        [profile]: {
                                                                            ...matterConfiguration.cleanModeProfiles[profile],
                                                                            route: e.target.value
                                                                        }
                                                                    }
                                                                });
                                                                setConfigurationModified(true);
                                                            }}
                                                        >
                                                            {sortPresets(matterStatus.cleanModeStrengthOptions.route).map(route => (
                                                                <MenuItem key={route} value={route}>
                                                                    {presetFriendlyNames[route] ?? route}
                                                                </MenuItem>
                                                            ))}
                                                        </Select>
                                                    </FormControl>
                                                </Grid2>
                                            )}
                                        </Grid2>
                                    </Box>
                                );
                            })}
                        </Box>
                    )}

                    <Grid2 container>
                        <Grid2 style={{marginLeft: "auto"}}>
                            <Button
                                disabled={!configurationModified}
                                loading={matterConfigurationUpdating}
                                color="primary"
                                variant="outlined"
                                onClick={() => {
                                    updateMatterConfiguration(matterConfiguration);
                                    setConfigurationModified(false);
                                }}
                            >
                                Save configuration
                            </Button>
                        </Grid2>
                    </Grid2>
                </CardContent>
            </Card>

            <InfoBox
                boxShadow={5}
                style={{
                    marginTop: "1rem",
                    marginBottom: "2rem"
                }}
            >
                <Typography color="info">
                    Matter integration is in preview. This build exposes the robot as a Robot Vacuum Cleaner
                    device with live operational and battery state, Locate support, configurable cleaning modes,
                    and start, stop, pause, resume, and return-to-dock controls.
                    <br/><br/>
                    The device is advertised with a test Vendor ID (0xFFF1). Commissioners will show an
                    &quot;uncertified accessory&quot; prompt; accept it to continue pairing.
                </Typography>
            </InfoBox>

            <ConfirmationDialog
                title="Reset Matter commissioning"
                text={
                    "This wipes all paired fabrics, deletes local Matter storage, and generates a fresh " +
                    "commissioning code. You'll need to re-pair the robot in every smart-home app that had it."
                }
                open={resetConfirmOpen}
                onClose={() => setResetConfirmOpen(false)}
                onAccept={() => {
                    resetMatter();
                    setResetConfirmOpen(false);
                }}
            />
        </>
    );
};

const MatterConnectivityPage = (): React.ReactElement => {
    const {
        isFetching: matterStatusFetching,
        refetch: refetchMatterStatus,
    } = useMatterStatusQuery();

    return (
        <PaperContainer>
            <Grid2 container direction="row">
                <Box style={{width: "100%"}}>
                    <DetailPageHeaderRow
                        title="Matter Connectivity"
                        icon={<ConnectivityIcon/>}
                        onRefreshClick={() => {
                            refetchMatterStatus().catch(() => {
                                /* intentional */
                            });
                        }}
                        isRefreshing={matterStatusFetching}
                    />
                    <MatterConnectivity/>
                </Box>
            </Grid2>
        </PaperContainer>
    );
};

export default MatterConnectivityPage;
