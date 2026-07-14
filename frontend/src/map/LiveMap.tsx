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
    onCleaningTargetChange?: (
        target: Pick<CleaningTargetState, "value" | "segmentIds"> &
            Partial<Pick<CleaningTargetState, "zones" | "iterations">> & {expectedRevision?: number}
    ) => Promise<CleaningTargetState>,
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
    goToTarget: GoToTargetClientStructure | undefined,
    iterations: number
}

class LiveMap extends BaseMap<LiveMapProps, LiveMapState> {
    private readonly supportedModes: Array<LiveMapMode>;
    private _cleanOrderActive: boolean;
    private appliedCleaningTargetRevision = -1;
    private cleaningTargetSyncTimer: ReturnType<typeof setTimeout> | null = null;
    private cleaningTargetSyncQueue: Promise<void> = Promise.resolve();
    private lastCleaningTargetSignature: string | null = null;
    private lastAcknowledgedCleaningTargetRevision: number | null = null;
    private pendingCleaningTargetSignature: string | null = null;

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

        const modeIdxToUse = 0;

        this.state = {
            mode: this.supportedModes[modeIdxToUse] ?? "none",
            selectedSegmentIds: [],

            dialogOpen: false,
            dialogTitle: "Hello World",
            dialogBody: "This should never be visible",

            zones: [],
            goToTarget: undefined,
            iterations: 1
        };

        this._cleanOrderActive = this.state.mode === "all" || this.state.mode === "automatic";
        this.mapLayerManager.setAlwaysDimUnselectedSegments((this.supportedModes[modeIdxToUse] ?? "none") === "segments");
    }

    protected updateState() : void {
        this.applySelectedSegmentIdsToLabels(this.state.selectedSegmentIds);
        const zones = this.structureManager.getClientStructures().filter(s => {
            return s.type === ZoneClientStructure.TYPE;
        }) as Array<ZoneClientStructure>;
        const goToTarget = this.structureManager.getClientStructures().find(s => {
            return s.type === GoToTargetClientStructure.TYPE;
        }) as GoToTargetClientStructure | undefined;
        this.setState({
            selectedSegmentIds: this.state.selectedSegmentIds,
            zones: zones,
            goToTarget: goToTarget
        });

        if (this.state.mode === "zones") {
            this.queueCleaningTargetSync({
                value: "zones",
                segmentIds: [],
                zones: this.getZonesForDraft(zones),
                iterations: this.state.iterations
            });
        }

        this.updateCleanOrderLabels();
    }

    private getZonesForDraft(zones = this.state.zones): CleaningTargetState["zones"] {
        return zones.map(zone => ({
            points: {
                pA: this.structureManager.convertPixelCoordinatesToCMSpace({x: zone.x0, y: zone.y0}),
                pB: this.structureManager.convertPixelCoordinatesToCMSpace({x: zone.x1, y: zone.y1}),
                pC: this.structureManager.convertPixelCoordinatesToCMSpace({x: zone.x2, y: zone.y2}),
                pD: this.structureManager.convertPixelCoordinatesToCMSpace({x: zone.x3, y: zone.y3})
            }
        }));
    }

    private applySelectedSegmentIdsToLabels(segmentIds: string[]): void {
        const segmentLabels = this.structureManager.getMapStructures().filter(s =>
            s.type === SegmentLabelMapStructure.TYPE
        ) as Array<SegmentLabelMapStructure>;
        segmentLabels.forEach(label => {
            const index = segmentIds.indexOf(label.id);
            label.selected = index !== -1;
            label.topLabel = this.props.trackSegmentSelectionOrder && index !== -1 ? String(index + 1) : undefined;
        });
        this.mapLayerManager.setSelectedSegmentIds(segmentIds);
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

            segmentLabels.forEach(label => {
                label.cleanOrderBadge = cleanOrderBySegmentId[label.id];
            });
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
                if (this.props.cleaningTarget?.active) {
                    return true;
                }
                const intersectingSegmentId = this.mapLayerManager.getIntersectingSegment(tappedPointInMapSpace.x, tappedPointInMapSpace.y);

                if (intersectingSegmentId) {
                    const segmentLabels = this.structureManager.getMapStructures().filter(s => {
                        return s.type === SegmentLabelMapStructure.TYPE;
                    }) as Array<SegmentLabelMapStructure>;

                    const matchedSegmentLabel = segmentLabels.find(l => {
                        return l.id === intersectingSegmentId;
                    });


                    if (matchedSegmentLabel) {
                        const selectedSegmentIds = this.state.selectedSegmentIds.includes(matchedSegmentLabel.id) ?
                            this.state.selectedSegmentIds.filter(id => id !== matchedSegmentLabel.id) :
                            [...this.state.selectedSegmentIds, matchedSegmentLabel.id];
                        this.setState({selectedSegmentIds: selectedSegmentIds}, () => {
                            this.applySelectedSegmentIdsToLabels(selectedSegmentIds);
                            this.redrawLayers();
                            this.queueCleaningTargetSync({
                                value: "segments",
                                segmentIds: selectedSegmentIds,
                                zones: [],
                                iterations: this.state.iterations
                            });
                        });

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
            this.props.cleaningTarget !== undefined &&
            this.props.cleaningTarget.revision > this.appliedCleaningTargetRevision
        ) {
            this.applyCleaningTarget(this.props.cleaningTarget);
        }

        this.publishPendingMapAction();
    }

    componentDidMount(): void {
        super.componentDidMount();
        useLiveMapMode.setState({
            mode: this.state.mode,
            supportedModes: this.supportedModes,
            setMode: this.handleModeChange,
        });
        if (this.props.cleaningTarget) {
            this.applyCleaningTarget(this.props.cleaningTarget);
        }
        this.publishPendingMapAction();
    }

    private publishPendingMapAction(): void {
        const cleaningInProgress = this.props.cleaningTarget?.active === true;
        const type = !cleaningInProgress && ["segments", "zones", "goto"].includes(this.state.mode) ?
            this.state.mode as "segments" | "zones" | "goto" : null;
        const goToTarget = type === "goto" && this.state.goToTarget ?
            this.structureManager.convertPixelCoordinatesToCMSpace({
                x: this.state.goToTarget.x0,
                y: this.state.goToTarget.y0
            }) : null;
        usePendingMapAction.setState({
            hasPendingMapAction: type !== null,
            type: type,
            selectionCount: type === "segments" ? this.state.selectedSegmentIds.length :
                type === "zones" ? this.state.zones.length : goToTarget ? 1 : 0,
            goToTarget: goToTarget,
            ...(type === "goto" ? {draftReady: goToTarget !== null} : {}),
            clearAction: type === "goto" && goToTarget ? this.clearGoToTarget : null
        });
    }

    private clearGoToTarget = (): void => {
        this.structureManager.getClientStructures().filter(s => s.type === GoToTargetClientStructure.TYPE)
            .forEach(s => this.structureManager.removeClientStructure(s));
        this.updateState();
        this.draw();
    };

    private queueCleaningTargetSync(
        target: Pick<CleaningTargetState, "value" | "segmentIds"> &
            Partial<Pick<CleaningTargetState, "zones" | "iterations">>,
        force = false
    ): void {
        const signature = JSON.stringify(target);
        if (!this.props.onCleaningTargetChange || (!force && signature === this.lastCleaningTargetSignature)) {
            return;
        }
        if (this.cleaningTargetSyncTimer !== null) {
            clearTimeout(this.cleaningTargetSyncTimer);
        }
        this.pendingCleaningTargetSignature = signature;
        usePendingMapAction.setState({draftReady: false, targetRevision: null});
        this.cleaningTargetSyncTimer = setTimeout(() => {
            this.cleaningTargetSyncTimer = null;
            const sync = async (): Promise<void> => {
                try {
                    const acknowledgedTarget = await this.props.onCleaningTargetChange?.({
                        ...target,
                        ...(this.lastAcknowledgedCleaningTargetRevision !== null ?
                            {expectedRevision: this.lastAcknowledgedCleaningTargetRevision} : {})
                    });
                    if (!acknowledgedTarget) {
                        return;
                    }
                    this.lastAcknowledgedCleaningTargetRevision = acknowledgedTarget.revision;
                    this.lastCleaningTargetSignature = JSON.stringify({
                        value: acknowledgedTarget.value,
                        segmentIds: acknowledgedTarget.segmentIds,
                        zones: acknowledgedTarget.zones,
                        iterations: acknowledgedTarget.iterations
                    });
                    if (this.pendingCleaningTargetSignature === signature) {
                        usePendingMapAction.setState({
                            draftReady: true,
                            targetRevision: acknowledgedTarget.revision
                        });
                        this.pendingCleaningTargetSignature = null;
                    }
                } catch (e) {
                    if (this.pendingCleaningTargetSignature === signature) {
                        usePendingMapAction.setState({draftReady: false, targetRevision: null});
                        this.pendingCleaningTargetSignature = null;
                    }
                    if (this.props.cleaningTarget) {
                        this.applyCleaningTarget(this.props.cleaningTarget);
                    }
                }
            };
            this.cleaningTargetSyncQueue = this.cleaningTargetSyncQueue.then(sync, sync);
        }, 100);
    }

    /**
     * Apply an integration-owned target without persisting it as the user's preferred map mode.
     * @param {CleaningTargetState|undefined} target ordered target published by the backend
     */
    private applyCleaningTarget(target: CleaningTargetState | undefined): void {
        if (!target || !["none", "all", "segments", "zones", "automatic"].includes(target.value) ||
            (target.value === "segments" && !this.supportedModes.includes("segments")) ||
            (target.value === "zones" && !this.supportedModes.includes("zones")) ||
            (target.value === "automatic" && !this.supportedModes.includes("automatic"))) {
            return;
        }
        const targetSignature = JSON.stringify({
            value: target.value,
            segmentIds: target.segmentIds,
            zones: target.zones,
            iterations: target.iterations
        });
        if (this.pendingCleaningTargetSignature !== null &&
            targetSignature !== this.pendingCleaningTargetSignature && !target.active) {
            this.appliedCleaningTargetRevision = target.revision;
            this.lastAcknowledgedCleaningTargetRevision = target.revision;
            return;
        }

        const mode: LiveMapMode = target.value === "segments" ? "segments" :
            target.value === "zones" ? "zones" : target.value === "all" ? "all" :
                target.value === "automatic" ? "automatic" : this.state.mode;
        const segmentIds = target.value === "segments" ? target.segmentIds : [];
        const segmentLabels = this.structureManager.getMapStructures().filter(s =>
            s.type === SegmentLabelMapStructure.TYPE
        ) as Array<SegmentLabelMapStructure>;
        if (mode === "segments" && segmentIds.some(id => !segmentLabels.some(label => label.id === id))) {
            // Map structures are built asynchronously. Leave the revision
            // unapplied so the state update produced by redrawMap retries it.
            return;
        }

        this.appliedCleaningTargetRevision = target.revision;
        this.lastAcknowledgedCleaningTargetRevision = target.revision;
        this.lastCleaningTargetSignature = targetSignature;
        this.pendingCleaningTargetSignature = null;
        usePendingMapAction.setState({draftReady: true, targetRevision: target.revision});
        this._cleanOrderActive = mode === "all" || mode === "automatic";
        // Whole-home/automatic modes show firmware clean order. Segment mode
        // must clear those badges so only the selected target's ordered IDs
        // receive numbered badges.
        this.updateCleanOrderLabels();
        this.mapLayerManager.setAlwaysDimUnselectedSegments(mode === "segments");
        if (target.value === "zones") {
            this.structureManager.getClientStructures().filter(s => s.type === ZoneClientStructure.TYPE)
                .forEach(s => this.structureManager.removeClientStructure(s));
            target.zones.forEach(zone => {
                const pA = this.structureManager.convertCMCoordinatesToPixelSpace(zone.points.pA);
                const pB = this.structureManager.convertCMCoordinatesToPixelSpace(zone.points.pB);
                const pC = this.structureManager.convertCMCoordinatesToPixelSpace(zone.points.pC);
                const pD = this.structureManager.convertCMCoordinatesToPixelSpace(zone.points.pD);
                this.structureManager.addClientStructure(new ZoneClientStructure(
                    pA.x, pA.y, pB.x, pB.y, pC.x, pC.y, pD.x, pD.y, true
                ));
            });
        }
        const zones = this.structureManager.getClientStructures()
            .filter(s => s.type === ZoneClientStructure.TYPE) as Array<ZoneClientStructure>;
        this.setState({
            mode: mode,
            selectedSegmentIds: segmentIds,
            zones: zones,
            iterations: target.iterations ?? 1
        }, () => {
            this.applySelectedSegmentIdsToLabels(segmentIds);
            this.redrawLayers();
            this.publishPendingMapAction();
        });
        if (target.value !== "none") {
            useLiveMapMode.setState({mode: mode});
        }
    }

    componentWillUnmount(): void {
        if (this.cleaningTargetSyncTimer !== null) {
            clearTimeout(this.cleaningTargetSyncTimer);
            this.cleaningTargetSyncTimer = null;
        }
        useLiveMapMode.setState({setMode: null});
        usePendingMapAction.setState({
            hasPendingMapAction: false,
            type: null,
            selectionCount: 0,
            goToTarget: null,
            draftReady: false,
            targetRevision: null,
            clearAction: null
        });
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

        this.setState({mode: newMode, selectedSegmentIds: [], zones: [], goToTarget: undefined, iterations: 1}, () => {
            this.applySelectedSegmentIdsToLabels([]);
            this.updateState();
            this.redrawLayers();
        });
        useLiveMapMode.setState({mode: newMode});

        this.queueCleaningTargetSync({
            value: newMode === "all" ? "all" : newMode === "automatic" ? "automatic" :
                newMode === "segments" ? "segments" : newMode === "zones" ? "zones" : "none",
            segmentIds: [],
            zones: [],
            iterations: 1
        }, true);
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
                                this.state.mode === "segments" && !this.props.cleaningTarget?.active &&

                                <SegmentActions
                                    segments={this.state.selectedSegmentIds}
                                    iterationCount={this.state.iterations}
                                    onIterationChange={iterations => {
                                        this.setState({iterations: iterations});
                                        this.queueCleaningTargetSync({
                                            value: "segments",
                                            segmentIds: this.state.selectedSegmentIds,
                                            zones: [],
                                            iterations: iterations
                                        });
                                    }}
                                    onClear={() => {
                                        this.setState({selectedSegmentIds: []}, () => {
                                            this.applySelectedSegmentIdsToLabels([]);
                                            this.redrawLayers();
                                        });
                                        this.queueCleaningTargetSync({
                                            value: "segments", segmentIds: [], zones: [],
                                            iterations: this.state.iterations
                                        });
                                    }}
                                />
                            }
                            {
                                this.state.mode === "zones" &&

                                <ZoneActions
                                    zones={this.state.zones}
                                    iterationCount={this.state.iterations}
                                    onIterationChange={iterations => {
                                        this.setState({iterations: iterations});
                                        this.queueCleaningTargetSync({
                                            value: "zones",
                                            segmentIds: [],
                                            zones: this.getZonesForDraft(),
                                            iterations: iterations
                                        });
                                    }}
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
                                    onClear={this.clearGoToTarget}
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
