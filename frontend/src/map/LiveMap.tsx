import BaseMap, {MapContainer, MapProps, MapState, usePendingMapAction} from "./BaseMap";
import {Capability, RawMapLayerType, useAutomaticControlAttributeQuery, useSetAutomaticControlMutation} from "../api";
import GoToTargetClientStructure from "./structures/client_structures/GoToTargetClientStructure";
import {ActionsContainer, ActionButton, MapOverlayTopLeft, MapToolbarContainer, MapOverlayBottomLeft, StatsOverlayButton} from "./Styled";
import {LiveMapModeSwitcher} from "./LiveMapModeSwitcher";
import SegmentActions from "./actions/live_map_actions/SegmentActions";
import SegmentLabelMapStructure from "./structures/map_structures/SegmentLabelMapStructure";
import ZoneActions from "./actions/live_map_actions/ZoneActions";
import ZoneClientStructure from "./structures/client_structures/ZoneClientStructure";
import GoToActions from "./actions/live_map_actions/GoToActions";
import {TapTouchHandlerEvent} from "./utils/touch_handling/events/TapTouchHandlerEvent";
import React from "react";
import {Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography} from "@mui/material";
import {AccessTime as TimeIcon, CropFree as CropFreeIcon, SquareFoot as AreaIcon, SportsEsports as GamepadIcon, DesignServices as MapEditorIcon} from "@mui/icons-material";
import {useCurrentStatisticsQuery} from "../api";
import { create } from "zustand";

const StatsOverlayWidget = ({onClick}: {onClick: () => void}): React.ReactElement | null => {
    const {data: stats} = useCurrentStatisticsQuery();

    const timeStat = stats?.find(s => s.type === "time");
    const areaStat = stats?.find(s => s.type === "area");

    if (!timeStat && !areaStat) {
        return null;
    }

    return (
        <StatsOverlayButton
            onClick={onClick}
            style={{position: "absolute", top: "16px", left: "50%", transform: "translateX(-50%)", zIndex: 1000}}
        >
            {timeStat && (
                <Box sx={{display: "inline-flex", alignItems: "center", gap: "3px"}}>
                    <Typography variant="caption" sx={{fontWeight: 600, lineHeight: 1}}>
                        {Math.round(timeStat.value / 60)} min
                    </Typography>
                    <TimeIcon sx={{fontSize: "1rem", color: "text.secondary"}}/>
                </Box>
            )}
            {areaStat && (
                <Box sx={{display: "inline-flex", alignItems: "center", gap: "3px"}}>
                    <Typography variant="caption" sx={{fontWeight: 600, lineHeight: 1}}>
                        {Math.round(areaStat.value / 10000)} m²
                    </Typography>
                    <AreaIcon sx={{fontSize: "1rem", color: "text.secondary"}}/>
                </Box>
            )}
        </StatsOverlayButton>
    );
};


export type LiveMapMode = "segments" | "zones" | "goto" | "none" | "all" | "automatic";
const LIVE_MAP_MODE_LOCAL_STORAGE_KEY = "live-map-mode";

export const useLiveMapMode = create<{
    mode: LiveMapMode;
    supportedModes: Array<LiveMapMode>;
    setMode: ((newMode: LiveMapMode) => void) | null;
}>()(() => ({
    mode: "none",
    supportedModes: [],
    setMode: null,
}));

const LiveMapModeSwitcherWithAutomatic: React.FunctionComponent<{
    supportedModes: Array<LiveMapMode>;
    currentMode: LiveMapMode;
    setMode: (newMode: LiveMapMode) => void;
}> = ({supportedModes, currentMode, setMode}) => {
    const {data: automaticAttribute} = useAutomaticControlAttributeQuery();
    const {mutate: setAutomaticControl} = useSetAutomaticControlMutation();
    const automaticControlSupported = supportedModes.includes("automatic");
    const hasSyncedRef = React.useRef(false);

    React.useEffect(() => {
        if (hasSyncedRef.current || !automaticControlSupported || automaticAttribute === undefined) {
            return;
        }
        hasSyncedRef.current = true;
        if (automaticAttribute.value !== "off" && currentMode !== "automatic") {
            setMode("automatic");
        } else if (automaticAttribute.value === "off" && currentMode === "automatic") {
            setMode(supportedModes.find(m => m !== "automatic") ?? "none");
        }
    }, [automaticAttribute, automaticControlSupported, currentMode, setMode, supportedModes]);

    const handleModeChange = (newMode: LiveMapMode) => {
        setMode(newMode);
        if (!automaticControlSupported) {
            return;
        }
        if (newMode === "automatic") {
            const level = automaticAttribute?.value && automaticAttribute.value !== "off" ?
                automaticAttribute.value :
                "routine";
            setAutomaticControl(level);
        } else if (currentMode === "automatic") {
            setAutomaticControl("off");
        }
    };

    return (
        <LiveMapModeSwitcher
            supportedModes={supportedModes}
            currentMode={currentMode}
            setMode={handleModeChange}
        />
    );
};

interface LiveMapProps extends MapProps {
    supportedCapabilities: {
        [Capability.MapSegmentation]: boolean,
        [Capability.ZoneCleaning]: boolean,
        [Capability.GoToLocation]: boolean,
        [Capability.AutomaticControl]: boolean,
    },
    onManualControlOpen?: () => void,
    onStatisticsOpen?: () => void,
    onMapEditorOpen?: () => void,
}

interface LiveMapState extends MapState {
    mode: LiveMapMode,
    zones: Array<ZoneClientStructure>,
    goToTarget: GoToTargetClientStructure | undefined
}

class LiveMap extends BaseMap<LiveMapProps, LiveMapState> {
    private readonly supportedModes: Array<LiveMapMode>;
    private _cleanOrderActive: boolean;

    constructor(props: LiveMapProps) {
        super(props);

        this.supportedModes = [];

        if (props.supportedCapabilities[Capability.MapSegmentation]) {
            this.supportedModes.push("all");
            this.supportedModes.push("segments");
        }
        if (props.supportedCapabilities[Capability.ZoneCleaning]) {
            this.supportedModes.push("zones");
        }
        if (props.supportedCapabilities[Capability.GoToLocation]) {
            this.supportedModes.push("goto");
        }
        if (props.supportedCapabilities[Capability.AutomaticControl]) {
            this.supportedModes.push("automatic");
        }

        let modeIdxToUse = 0;
        try {
            const previousMode = window.localStorage.getItem(LIVE_MAP_MODE_LOCAL_STORAGE_KEY);

            modeIdxToUse = Math.max(
                this.supportedModes.findIndex(e => e === previousMode),
                0 //default to the first if not defined or not supported
            );
        } catch (e) {
            /* users with non-working local storage will have to live with the defaults */
        }

        this.state = {
            mode: this.supportedModes[modeIdxToUse] ?? "none",
            selectedSegmentIds: [],

            dialogOpen: false,
            dialogTitle: "Hello World",
            dialogBody: "This should never be visible",

            zones: [],
            goToTarget: undefined
        };

        this._cleanOrderActive = this.state.mode === "all" || this.state.mode === "automatic";
        this.mapLayerManager.setAlwaysDimUnselectedSegments((this.supportedModes[modeIdxToUse] ?? "none") === "segments");
    }

    protected updateState() : void {
        super.updateState();

        this.setState({
            zones: this.structureManager.getClientStructures().filter(s => {
                return s.type === ZoneClientStructure.TYPE;
            }) as Array<ZoneClientStructure>,
            goToTarget: this.structureManager.getClientStructures().find(s => {
                return s.type === GoToTargetClientStructure.TYPE;
            }) as GoToTargetClientStructure | undefined
        });

        this.updateCleanOrderLabels();
    }

    private updateCleanOrderLabels(): void {
        const segmentLabels = this.structureManager.getMapStructures().filter(s =>
            s.type === SegmentLabelMapStructure.TYPE
        ) as Array<SegmentLabelMapStructure>;

        if (this._cleanOrderActive) {
            const cleanOrderBySegmentId: Record<string, number> = {};
            this.props.rawMap.layers.forEach(l => {
                if (
                    l.type === RawMapLayerType.Segment &&
                    l.metaData.segmentId !== undefined &&
                    l.metaData.cleanOrder !== undefined
                ) {
                    cleanOrderBySegmentId[l.metaData.segmentId] = l.metaData.cleanOrder;
                }
            });

            if (Object.keys(cleanOrderBySegmentId).length > 0) {
                segmentLabels.forEach(label => {
                    label.cleanOrderBadge = cleanOrderBySegmentId[label.id];
                });
            }
        } else {
            segmentLabels.forEach(label => {
                label.cleanOrderBadge = undefined;
            });
        }
    }


    protected onTap(evt: TapTouchHandlerEvent): boolean | void {
        if (super.onTap(evt)) {
            return true;
        }

        const {x, y} = this.relativeCoordinatesToCanvas(evt.x0, evt.y0);
        const tappedPointInMapSpace = this.ctxWrapper.mapPointToCurrentTransform(x, y);

        switch (this.state.mode) {
            case "segments": {
                const intersectingSegmentId = this.mapLayerManager.getIntersectingSegment(tappedPointInMapSpace.x, tappedPointInMapSpace.y);

                if (intersectingSegmentId) {
                    const segmentLabels = this.structureManager.getMapStructures().filter(s => {
                        return s.type === SegmentLabelMapStructure.TYPE;
                    }) as Array<SegmentLabelMapStructure>;

                    const matchedSegmentLabel = segmentLabels.find(l => {
                        return l.id === intersectingSegmentId;
                    });


                    if (matchedSegmentLabel) {
                        matchedSegmentLabel.onTap();

                        this.updateState();
                        this.redrawLayers();

                        return true;
                    }
                }

                break;
            }

            case "goto": {
                if (
                    this.structureManager.getClientStructures().filter(s => {
                        return s.type !== GoToTargetClientStructure.TYPE;
                    }).length === 0
                ) {
                    this.structureManager.getClientStructures().forEach(s => {
                        if (s.type === GoToTargetClientStructure.TYPE) {
                            this.structureManager.removeClientStructure(s);
                        }
                    });
                    this.structureManager.addClientStructure(new GoToTargetClientStructure(tappedPointInMapSpace.x, tappedPointInMapSpace.y));


                    this.updateState();
                    this.draw();

                    return true;
                }

                break;
            }
        }
    }

    componentDidUpdate(prevProps: Readonly<MapProps>, prevState: Readonly<MapState>): void {
        super.componentDidUpdate(prevProps, prevState);

        if (
            this.state.selectedSegmentIds.length > 0 ||
            this.state.zones.length > 0 ||
            this.state.goToTarget !== undefined
        ) {
            usePendingMapAction.setState({hasPendingMapAction: true});
        } else {
            usePendingMapAction.setState({hasPendingMapAction: false});
        }
    }

    componentDidMount(): void {
        super.componentDidMount();
        useLiveMapMode.setState({
            mode: this.state.mode,
            supportedModes: this.supportedModes,
            setMode: this.handleModeChange,
        });
    }

    componentWillUnmount(): void {
        useLiveMapMode.setState({setMode: null});
        super.componentWillUnmount();
    }

    private handleModeChange = (newMode: LiveMapMode): void => {
        this._cleanOrderActive = newMode === "all" || newMode === "automatic";
        this.mapLayerManager.setAlwaysDimUnselectedSegments(newMode === "segments" || newMode === "zones");

        this.structureManager.getMapStructures().forEach(s => {
            if (s.type === SegmentLabelMapStructure.TYPE) {
                const label = s as SegmentLabelMapStructure;
                label.selected = false;
            }
        });

        this.structureManager.getClientStructures().forEach(s => {
            if (s.type === GoToTargetClientStructure.TYPE) {
                this.structureManager.removeClientStructure(s);
            }
            if (s.type === ZoneClientStructure.TYPE) {
                this.structureManager.removeClientStructure(s);
            }
        });

        this.updateState();
        this.redrawLayers();
        this.setState({mode: newMode});
        useLiveMapMode.setState({mode: newMode});

        try {
            window.localStorage.setItem(LIVE_MAP_MODE_LOCAL_STORAGE_KEY, newMode);
        } catch (e) {
            /* intentional */
        }
    };

    recenterMap = (): void => {
        this.redrawMap();
    };

    render(): React.ReactElement {
        return (
            <MapContainer style={{overflow: "hidden"}}>
                <canvas
                    ref={this.canvasRef}
                    style={{
                        width: "100%",
                        height: "100%",
                        imageRendering: "crisp-edges"
                    }}
                />
                <ActionsContainer>
                    <Box sx={{display: "flex", alignItems: "flex-end", gap: 1}}>
                        <Box sx={{flex: 1, minWidth: 0}}>
                            {
                                this.state.mode === "segments" &&

                                <SegmentActions
                                    segments={this.state.selectedSegmentIds}
                                    onClear={() => {
                                        this.structureManager.getMapStructures().forEach(s => {
                                            if (s.type === SegmentLabelMapStructure.TYPE) {
                                                const label = s as SegmentLabelMapStructure;

                                                label.selected = false;
                                            }
                                        });
                                        this.updateState();

                                        this.redrawLayers();
                                    }}
                                />
                            }
                            {
                                this.state.mode === "zones" &&

                                <ZoneActions
                                    zones={this.state.zones}
                                    convertPixelCoordinatesToCMSpace={(coordinates => {
                                        return this.structureManager.convertPixelCoordinatesToCMSpace(coordinates);
                                    })}
                                    onClear={() => {
                                        this.structureManager.getClientStructures().forEach(s => {
                                            if (s.type === ZoneClientStructure.TYPE) {
                                                this.structureManager.removeClientStructure(s);
                                            }
                                        });

                                        this.updateState();

                                        this.draw();
                                    }}
                                    onAdd={() => {
                                        const currentCenter = this.getCurrentViewportCenterCoordinatesInPixelSpace();

                                        const p0 = {
                                            x: currentCenter.x -15,
                                            y: currentCenter.y -15
                                        };
                                        const p1 = {
                                            x: currentCenter.x +15,
                                            y: currentCenter.y -15
                                        };
                                        const p2 = {
                                            x: currentCenter.x +15,
                                            y: currentCenter.y +15
                                        };
                                        const p3 = {
                                            x: currentCenter.x -15,
                                            y: currentCenter.y +15
                                        };

                                        this.structureManager.addClientStructure(new ZoneClientStructure(
                                            p0.x, p0.y,
                                            p1.x, p1.y,
                                            p2.x, p2.y,
                                            p3.x, p3.y,
                                            true
                                        ));

                                        this.updateState();

                                        this.draw();
                                    }}
                                />
                            }
                            {
                                this.state.mode === "goto" &&

                                <GoToActions
                                    goToTarget={this.state.goToTarget}
                                    convertPixelCoordinatesToCMSpace={(coordinates => {
                                        return this.structureManager.convertPixelCoordinatesToCMSpace(coordinates);
                                    })}
                                    onClear={() => {
                                        this.structureManager.getClientStructures().forEach(s => {
                                            if (s.type === GoToTargetClientStructure.TYPE) {
                                                this.structureManager.removeClientStructure(s);
                                            }
                                        });
                                        this.updateState();

                                        this.draw();
                                    }}
                                />
                            }
                        </Box>
                        {
                            this.supportedModes.length > 1 &&
                            <LiveMapModeSwitcherWithAutomatic
                                supportedModes={this.supportedModes}
                                currentMode={this.state.mode}
                                setMode={this.handleModeChange}
                            />
                        }
                    </Box>
                </ActionsContainer>

                {
                    this.props.onMapEditorOpen &&
                    <MapToolbarContainer>
                        <ActionButton
                            color="inherit"
                            size="small"
                            onClick={this.props.onMapEditorOpen}
                            title="Map Editor"
                        >
                            <MapEditorIcon/>
                        </ActionButton>
                    </MapToolbarContainer>
                }

                {
                    this.props.onManualControlOpen &&
                    <MapOverlayTopLeft>
                        <ActionButton
                            color="inherit"
                            size="small"
                            onClick={this.props.onManualControlOpen}
                            title="Manual Control"
                        >
                            <GamepadIcon/>
                        </ActionButton>
                    </MapOverlayTopLeft>
                }

                <MapOverlayBottomLeft>
                    <ActionButton
                        color="inherit"
                        size="small"
                        onClick={this.recenterMap}
                        title="Re-Centre Map"
                    >
                        <CropFreeIcon/>
                    </ActionButton>
                </MapOverlayBottomLeft>

                {
                    this.props.onStatisticsOpen &&
                    <StatsOverlayWidget onClick={this.props.onStatisticsOpen} />
                }

                <Dialog
                    open={this.state.dialogOpen}
                    onClose={() =>{
                        this.setState({dialogOpen: false});
                    }}
                >
                    <DialogTitle>
                        {this.state.dialogTitle}
                    </DialogTitle>
                    <DialogContent>
                        {this.state.dialogBody}
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => {
                            this.setState({dialogOpen: false});
                        }} autoFocus>
                            Close
                        </Button>
                    </DialogActions>
                </Dialog>
            </MapContainer>
        );
    }
}

export default LiveMap;
