import BaseMap, {MapContainer, MapProps, MapState, usePendingMapAction} from "./BaseMap";
import {Capability, CleaningTargetState, RawMapLayerType, useAutomaticControlAttributeQuery, useSetAutomaticControlMutation} from "../api";
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
    // Flipped to true the first time the user changes the mode. Consumers of the initial
    // automatic-control sync check this to avoid overriding an in-flight user choice
    // when the automaticAttribute query resolves after the click.
    userInteracted: boolean;
}>()(() => ({
    mode: "none",
    supportedModes: [],
    setMode: null,
    userInteracted: false,
}));

/**
 * Shared handler for changing the LiveMap mode. Sole owner of the automatic-control
 * side effect — both MapModeControls and LiveMapModeSwitcherWithAutomatic call through
 * here so the mutation fires exactly once per user click, regardless of which switcher
 * is on screen.
 */
export const useHandleLiveMapModeChange = (): ((newMode: LiveMapMode) => void) => {
    const {data: automaticAttribute} = useAutomaticControlAttributeQuery();
    const {mutate: setAutomaticControl} = useSetAutomaticControlMutation();

    return React.useCallback((newMode: LiveMapMode) => {
        const {mode: currentMode, supportedModes, setMode} = useLiveMapMode.getState();
        if (!setMode) {
            return;
        }

        useLiveMapMode.setState({userInteracted: true});
        setMode(newMode);

        if (!supportedModes.includes("automatic")) {
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
    }, [automaticAttribute, setAutomaticControl]);
};

const LiveMapModeSwitcherWithAutomatic: React.FunctionComponent<{
    supportedModes: Array<LiveMapMode>;
    currentMode: LiveMapMode;
    setMode: (newMode: LiveMapMode) => void;
}> = ({supportedModes, currentMode, setMode}) => {
    const {data: automaticAttribute} = useAutomaticControlAttributeQuery();
    const handleModeChange = useHandleLiveMapModeChange();
    const automaticControlSupported = supportedModes.includes("automatic");
    const hasSyncedRef = React.useRef(false);

    React.useEffect(() => {
        if (hasSyncedRef.current || !automaticControlSupported || automaticAttribute === undefined) {
            return;
        }
        hasSyncedRef.current = true;
        // If the user already interacted before the attribute query resolved, their
        // choice is authoritative — don't second-guess it with stale server state.
        if (useLiveMapMode.getState().userInteracted) {
            return;
        }
        if (automaticAttribute.value !== "off" && currentMode !== "automatic") {
            setMode("automatic");
        } else if (automaticAttribute.value === "off" && currentMode === "automatic") {
            setMode(supportedModes.find(m => m !== "automatic") ?? "none");
        }
    }, [automaticAttribute, automaticControlSupported, currentMode, setMode, supportedModes]);

    return (
        <LiveMapModeSwitcher
            supportedModes={supportedModes}
            currentMode={currentMode}
            setMode={handleModeChange}
        />
    );
};

interface LiveMapProps extends MapProps {
    cleaningTarget?: CleaningTargetState,
    onMatterAreaSelectionChange?: (segmentIds: string[]) => Promise<void>,
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
    private appliedCleaningTargetRevision = -1;
    private matterSelectionSyncTimer: ReturnType<typeof setTimeout> | null = null;
    private lastMatterSelectionSignature: string | null = null;
    private localEmptySegmentDraft = false;

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
            this.props.cleaningTarget?.revision !== this.appliedCleaningTargetRevision &&
            ["matter", "webui"].includes(this.props.cleaningTarget?.source ?? "")
        ) {
            if (!(this.localEmptySegmentDraft && this.props.cleaningTarget?.source === "webui")) {
                this.applyCleaningTarget(this.props.cleaningTarget!);
            }
        }

        const cleaningInProgress = this.props.cleaningTarget?.active === true;
        if (
            !cleaningInProgress &&
            (this.state.selectedSegmentIds.length > 0 ||
             this.state.zones.length > 0 ||
             this.state.goToTarget !== undefined)
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
        if (["matter", "webui"].includes(this.props.cleaningTarget?.source ?? "")) {
            this.applyCleaningTarget(this.props.cleaningTarget!);
        }
    }

    protected onSegmentSelectionChanged(segmentIds: string[]): void {
        if (this.state.mode === "segments") {
            this.localEmptySegmentDraft = segmentIds.length === 0;
            this.queueMatterSelectionSync(segmentIds);
        }
    }

    private queueMatterSelectionSync(segmentIds: string[], allowEmpty = false): void {
        if (segmentIds.length === 0 && !allowEmpty) {
            if (this.matterSelectionSyncTimer !== null) {
                clearTimeout(this.matterSelectionSyncTimer);
                this.matterSelectionSyncTimer = null;
            }
            return;
        }
        const signature = JSON.stringify(segmentIds);
        if (!this.props.onMatterAreaSelectionChange || signature === this.lastMatterSelectionSignature) {
            return;
        }
        if (this.matterSelectionSyncTimer !== null) {
            clearTimeout(this.matterSelectionSyncTimer);
        }
        this.matterSelectionSyncTimer = setTimeout(() => {
            this.matterSelectionSyncTimer = null;
            this.lastMatterSelectionSignature = signature;
            // Matter may be disabled. Keep the signature even on failure so a
            // map refresh does not retry the same user selection indefinitely.
            this.props.onMatterAreaSelectionChange?.(segmentIds).catch(() => {});
        }, 100);
    }

    /**
     * Apply an integration-owned target without persisting it as the user's preferred map mode.
     * @param {CleaningTargetState} target ordered target published by the backend
     */
    private applyCleaningTarget(target: CleaningTargetState): void {
        if (!this.supportedModes.includes("segments") || !["none", "all", "segments"].includes(target.value)) {
            return;
        }

        const mode: LiveMapMode = target.value === "segments" ? "segments" : "all";
        this.localEmptySegmentDraft = false;
        const segmentIds = mode === "segments" ? target.segmentIds : [];
        const segmentLabels = this.structureManager.getMapStructures().filter(s =>
            s.type === SegmentLabelMapStructure.TYPE
        ) as Array<SegmentLabelMapStructure>;
        if (mode === "segments" && segmentIds.some(id => !segmentLabels.some(label => label.id === id))) {
            // Map structures are built asynchronously. Leave the revision
            // unapplied so the state update produced by redrawMap retries it.
            return;
        }

        segmentLabels.forEach(label => {
            const index = segmentIds.indexOf(label.id);
            label.selected = index !== -1;
            label.topLabel = this.props.trackSegmentSelectionOrder && index !== -1 ? String(index + 1) : undefined;
            if (mode === "segments") {
                label.cleanOrderBadge = undefined;
            }
        });

        this.appliedCleaningTargetRevision = target.revision;
        this.lastMatterSelectionSignature = JSON.stringify(segmentIds);
        this._cleanOrderActive = mode === "all";
        if (mode === "all") {
            // Segment mode hides the firmware clean-order badges. Rebuild them
            // when Matter switches the map back to whole-home cleaning.
            this.updateCleanOrderLabels();
        }
        this.mapLayerManager.setAlwaysDimUnselectedSegments(mode === "segments");
        this.mapLayerManager.setSelectedSegmentIds(segmentIds);
        this.setState({mode: mode, selectedSegmentIds: segmentIds});
        useLiveMapMode.setState({mode: mode});
        this.redrawLayers();
    }

    componentWillUnmount(): void {
        if (this.matterSelectionSyncTimer !== null) {
            clearTimeout(this.matterSelectionSyncTimer);
            this.matterSelectionSyncTimer = null;
        }
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
        if (newMode === "all") {
            this.localEmptySegmentDraft = false;
            this.queueMatterSelectionSync([], true);
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
