import React, {useEffect, useRef, useCallback, useState} from "react";
import {
    Box,
    Button,
    Stack,
    Typography,
    styled,
    Skeleton,
    CircularProgress,
} from "@mui/material";
import {
    Capability,
    ManualControlCommand,
    useManualControlInteraction,
    useManualControlPropertiesQuery,
    useManualControlStateQuery,
    useHighResolutionManualControlStateQuery,
    useHighResolutionManualControlInteraction,
    ValetudoManualMovementVector,
} from "../api";
import { useCapabilitiesSupported } from "../CapabilitiesProvider";
import { useTheme } from "@mui/material/styles";
import {
    ArrowDownward as ArrowDownwardIcon,
    ArrowUpward as ArrowUpwardIcon,
    RotateLeft as RotateLeftIcon,
    RotateRight as RotateRightIcon,
    VideogameAsset as VideogameAssetIcon,
    VideogameAssetOff as VideogameAssetOffIcon,
} from "@mui/icons-material";
import PaperContainer from "../components/PaperContainer";
import { Joystick } from "react-joystick-component";
import { IJoystickUpdateEvent } from "react-joystick-component/build/lib/Joystick";
import CameraStream from "../controls/CameraStream";
const SideButton = styled(Button)({
    width: "30%",
    height: "100%",
});

const CenterButton = styled(Button)({
    width: "100%",
});

const KEY_COMMAND_MAP: Record<string, ManualControlCommand> = {
    "w": "forward", "W": "forward", "ArrowUp": "forward",
    "s": "backward", "S": "backward", "ArrowDown": "backward",
    "a": "rotate_counterclockwise", "A": "rotate_counterclockwise", "ArrowLeft": "rotate_counterclockwise",
    "d": "rotate_clockwise", "D": "rotate_clockwise", "ArrowRight": "rotate_clockwise",
};

const ControlEnableButton = () => {
    const {data: manualControlState, isPending} = useManualControlStateQuery();
    const {mutate: sendInteraction, isPending: interacting} = useManualControlInteraction();
    const enabled = manualControlState?.enabled || false;

    return (
        <Button
            variant="outlined"
            disabled={isPending || interacting}
            onClick={() => sendInteraction({action: enabled ? "disable" : "enable"})}
            startIcon={enabled ? <VideogameAssetOffIcon /> : <VideogameAssetIcon />}
            endIcon={interacting ? <CircularProgress color="inherit" size={18} /> : undefined}
        >
            {enabled ? "Disable Manual Control" : "Enable Manual Control"}
        </Button>
    );
};

const HighResolutionEnableButton = () => {
    const {data: manualControlState, isPending} = useHighResolutionManualControlStateQuery();
    const {mutate: sendInteraction, isPending: interacting} = useHighResolutionManualControlInteraction();
    const enabled = manualControlState?.enabled || false;

    return (
        <Button
            variant="outlined"
            disabled={isPending || interacting}
            onClick={() => sendInteraction({action: enabled ? "disable" : "enable"})}
            startIcon={enabled ? <VideogameAssetOffIcon /> : <VideogameAssetIcon />}
            endIcon={interacting ? <CircularProgress color="inherit" size={18} /> : undefined}
        >
            {enabled ? "Disable Manual Control" : "Enable Manual Control"}
        </Button>
    );
};

const MovementControls = () => {
    const {
        data: manualControlState,
        isPending: manualControlStatePending,
    } = useManualControlStateQuery();

    const {
        data: manualControlProperties,
        isPending: manualControlPropertiesPending,
    } = useManualControlPropertiesQuery();

    const {mutate: sendInteraction, isPending: moveInteracting} = useManualControlInteraction();

    const loading = manualControlStatePending || manualControlPropertiesPending;
    const controlsEnabled = !loading && manualControlState?.enabled && !moveInteracting;

    const forwardEnabled = controlsEnabled && manualControlProperties?.supportedMovementCommands.includes("forward");
    const backwardEnabled = controlsEnabled && manualControlProperties?.supportedMovementCommands.includes("backward");
    const rotateCwEnabled = controlsEnabled && manualControlProperties?.supportedMovementCommands.includes("rotate_clockwise");
    const rotateCcwEnabled = controlsEnabled && manualControlProperties?.supportedMovementCommands.includes("rotate_counterclockwise");

    const sendMoveCommand = (command: ManualControlCommand) => {
        if (!controlsEnabled) {
            return;
        }
        sendInteraction({ action: "move", movementCommand: command });
    };

    const heldKeysRef = useRef<Set<string>>(new Set());
    const [activeCommands, setActiveCommands] = useState<Set<ManualControlCommand>>(new Set());

    useEffect(() => {
        if (!controlsEnabled) {
            heldKeysRef.current.clear();
            setActiveCommands(new Set());
        }
    }, [controlsEnabled]);

    useEffect(() => {
        const updateActive = () => {
            const active = new Set<ManualControlCommand>();
            for (const key of heldKeysRef.current) {
                const cmd = KEY_COMMAND_MAP[key];
                if (cmd) {
                    active.add(cmd);
                }
            }
            setActiveCommands(active);
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (!controlsEnabled || e.repeat) {
                return;
            }
            const command = KEY_COMMAND_MAP[e.key];
            if (!command) {
                return;
            }
            if (!manualControlProperties?.supportedMovementCommands.includes(command)) {
                return;
            }
            if (heldKeysRef.current.has(e.key)) {
                return;
            }
            heldKeysRef.current.add(e.key);
            updateActive();
            sendInteraction({ action: "move", movementCommand: command });
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (!controlsEnabled || !KEY_COMMAND_MAP[e.key]) {
                return;
            }
            heldKeysRef.current.delete(e.key);
            updateActive();
        };

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
        };
    }, [controlsEnabled, sendInteraction, manualControlProperties]);

    return (
        <Stack direction="row" sx={{width: "100%", height: "30vh"}} justifyContent="center" alignItems="center">
            <SideButton
                variant={activeCommands.has("rotate_counterclockwise") ? "contained" : "outlined"}
                disabled={!rotateCcwEnabled}
                onClick={() => sendMoveCommand("rotate_counterclockwise")}
            >
                <RotateLeftIcon/>
            </SideButton>
            <Stack sx={{width: "40%", height: "100%", ml: 1, mr: 1}} justifyContent="space-between">
                <CenterButton
                    sx={{height: "65%"}}
                    variant={activeCommands.has("forward") ? "contained" : "outlined"}
                    disabled={!forwardEnabled}
                    onClick={() => sendMoveCommand("forward")}
                >
                    <ArrowUpwardIcon/>
                </CenterButton>
                <CenterButton
                    sx={{height: "30%"}}
                    variant={activeCommands.has("backward") ? "contained" : "outlined"}
                    disabled={!backwardEnabled}
                    onClick={() => sendMoveCommand("backward")}
                >
                    <ArrowDownwardIcon/>
                </CenterButton>
            </Stack>
            <SideButton
                variant={activeCommands.has("rotate_clockwise") ? "contained" : "outlined"}
                disabled={!rotateCwEnabled}
                onClick={() => sendMoveCommand("rotate_clockwise")}
            >
                <RotateRightIcon/>
            </SideButton>
        </Stack>
    );
};

const ManualControlInternal: React.FunctionComponent = (): React.ReactElement => {
    const { isPending: stateLoading, isError: stateError } = useManualControlStateQuery();
    const { isPending: propertiesLoading, isError: propertiesError } = useManualControlPropertiesQuery();

    const loading = stateLoading || propertiesLoading;
    const hasError = stateError || propertiesError;

    if (loading) {
        return <Skeleton height={"12rem"}/>;
    }

    return (
        <>
            { hasError && <Typography color="error">Error loading manual controls</Typography> }
            <MovementControls />
        </>
    );
};

const HighResolutionMovementControls = () => {
    const {
        data: manualControlState,
        isPending: manualControlStatePending,
    } = useHighResolutionManualControlStateQuery();
    const { mutate: sendInteraction } = useHighResolutionManualControlInteraction();

    const controlsEnabled = (!manualControlStatePending && manualControlState?.enabled);
    const theme = useTheme();

    const velocityRef = useRef(0);
    const angleRef = useRef(0);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const joystickActiveRef = useRef(false);

    const sendMoveCommand = useCallback((vector: ValetudoManualMovementVector) => {
        sendInteraction({ action: "move", vector: vector });
    }, [sendInteraction]);

    const handleInputStateUpdate = useCallback((type: "move" | "stop" | "start") => {
        if (type === "stop") {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
            sendMoveCommand({ velocity: 0, angle: 0 });
        } else if (type === "move") {
            if (!intervalRef.current) {
                sendMoveCommand({ velocity: velocityRef.current, angle: angleRef.current });
                intervalRef.current = setInterval(() => {
                    sendMoveCommand({ velocity: velocityRef.current, angle: angleRef.current });
                }, 250);
            }
        }
    }, [sendMoveCommand]);

    const handleJoystickInput = useCallback((e: IJoystickUpdateEvent) => {
        if (!controlsEnabled) {
            return;
        }

        let eventVelocity = 0;
        let eventAngle = 0;

        if (e.type === "move") {
            eventVelocity = (e.y ?? 0);
            eventAngle = (e.x ?? 0) * 120; // 180 would be the limit, but 120 is far saner
        }

        joystickActiveRef.current = (e.type === "move");
        velocityRef.current = eventVelocity;
        angleRef.current = eventAngle;

        handleInputStateUpdate(e.type);
    }, [controlsEnabled, handleInputStateUpdate]);

    const heldKeysRef = useRef<Set<string>>(new Set());

    const updateVectorFromKeys = useCallback(() => {
        const keys = heldKeysRef.current;
        const fwd = keys.has("w") || keys.has("W") || keys.has("ArrowUp");
        const bck = keys.has("s") || keys.has("S") || keys.has("ArrowDown");
        const lft = keys.has("a") || keys.has("A") || keys.has("ArrowLeft");
        const rgt = keys.has("d") || keys.has("D") || keys.has("ArrowRight");
        velocityRef.current = (fwd ? 1 : 0) + (bck ? -1 : 0);
        angleRef.current = (rgt ? 120 : 0) + (lft ? -120 : 0);
    }, []);

    useEffect(() => {
        if (!controlsEnabled) {
            heldKeysRef.current.clear();
            joystickActiveRef.current = false;
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        }
    }, [controlsEnabled]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!controlsEnabled || e.repeat) {
                return;
            }
            if (!KEY_COMMAND_MAP[e.key]) {
                return;
            }
            heldKeysRef.current.add(e.key);
            updateVectorFromKeys();
            handleInputStateUpdate("move");
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (!controlsEnabled || !KEY_COMMAND_MAP[e.key]) {
                return;
            }
            heldKeysRef.current.delete(e.key);
            updateVectorFromKeys();
            if (heldKeysRef.current.size === 0 && !joystickActiveRef.current) {
                handleInputStateUpdate("stop");
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
        };
    }, [controlsEnabled, handleInputStateUpdate, updateVectorFromKeys]);

    useEffect(() => {
        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, []);

    const baseColor = controlsEnabled ? theme.palette.grey[600] : theme.palette.grey[800];
    const stickColor = controlsEnabled ? theme.palette.primary.main : theme.palette.grey[600];

    return (
        <Box sx={{ my: 2, display: "flex", flexDirection: "column", alignItems: "center" }}>
            <Joystick
                size={200}
                move={handleJoystickInput}
                stop={handleJoystickInput}
                disabled={!controlsEnabled}
                throttle={100}
                baseColor={baseColor}
                stickColor={stickColor}
            />
        </Box>
    );
};

const HighResolutionManualControlInternal: React.FunctionComponent = (): React.ReactElement => {
    const { isPending: stateLoading, isError: stateError } = useHighResolutionManualControlStateQuery();

    if (stateLoading) {
        return <Skeleton height={"12rem"}/>;
    }

    return (
        <>
            { stateError && <Typography color="error">Error loading manual controls</Typography> }
            <HighResolutionMovementControls />
        </>
    );
};


export const ManualControlEnableButton = (): React.ReactElement | null => {
    const [highResSupported, standardSupported] = useCapabilitiesSupported(
        Capability.HighResolutionManualControl,
        Capability.ManualControl
    );
    if (highResSupported) {
        return <HighResolutionEnableButton />;
    }
    if (standardSupported) {
        return <ControlEnableButton />;
    }
    return null;
};

const ManualControl = (): React.ReactElement => {
    const [highResSupported, standardSupported] = useCapabilitiesSupported(
        Capability.HighResolutionManualControl,
        Capability.ManualControl
    );

    const controls = highResSupported ? <HighResolutionManualControlInternal /> :
        standardSupported ? <ManualControlInternal /> :
            <Typography color="error">This robot does not support manual control.</Typography>;

    return (
        <PaperContainer>
            <Box sx={{userSelect: "none"}}>
                <CameraStream
                    iframeStyle={{ minHeight: "50vh", width: "100%" }}
                />
                <Box sx={{ px: 1, pb: 1 }}>
                    {controls}
                    <Box sx={{ mt: 1, display: "flex", justifyContent: "center" }}>
                        <ManualControlEnableButton />
                    </Box>
                </Box>
            </Box>
        </PaperContainer>
    );
};

export default ManualControl;
