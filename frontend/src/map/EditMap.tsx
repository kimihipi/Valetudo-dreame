import BaseMap, {MapContainer, MapProps, MapState} from "./BaseMap";
import {Capability, RawMapData, RawMapEntityType, RawMapLayerMaterial, RawMapLayerType, StatusState} from "../api";
import {ActionsContainer, ActionButton, MapOverlayBottomLeft, MapToolbarContainer} from "./Styled";
import SegmentLabelMapStructure from "./structures/map_structures/SegmentLabelMapStructure";
import SegmentActions from "./actions/edit_map_actions/SegmentActions";
import CuttingLineClientStructure from "./structures/client_structures/CuttingLineClientStructure";
import VirtualWallClientStructure from "./structures/client_structures/VirtualWallClientStructure";
import VirtualRestrictionActions from "./actions/edit_map_actions/VirtualRestrictionActions";
import NoGoAreaClientStructure from "./structures/client_structures/NoGoAreaClientStructure";
import NoMopAreaClientStructure from "./structures/client_structures/NoMopAreaClientStructure";
import PassableThresholdClientStructure from "./structures/client_structures/PassableThresholdClientStructure";
import ImpassableThresholdClientStructure from "./structures/client_structures/ImpassableThresholdClientStructure";
import VirtualThresholdActions from "./actions/edit_map_actions/VirtualThresholdActions";
import CurtainClientStructure from "./structures/client_structures/CurtainClientStructure";
import CurtainActions from "./actions/edit_map_actions/CurtainActions";
import HelpDialog from "../components/HelpDialog";
import MapToolbar from "./actions/edit_map_actions/MapToolbar";
import {ProviderContext} from "notistack";
import React from "react";
import {CropFree as CropFreeIcon} from "@mui/icons-material";
import {PathDrawer} from "./PathDrawer";

export type mode = "segments" | "virtual_restrictions" | "virtual_thresholds" | "curtains";

interface EditMapProps extends MapProps {
    supportedCapabilities: {
        [Capability.CombinedVirtualRestrictions]: boolean,
        [Capability.CombinedVirtualThresholds]: boolean,
        [Capability.Curtains]: boolean,

        [Capability.MapSegmentEdit]: boolean,
        [Capability.MapSegmentRename]: boolean
        [Capability.MapSegmentMaterialControl]: boolean,
        [Capability.MapSegmentHide]: boolean,
        [Capability.MapSegmentCleanOrder]: boolean,
    }
    mode: mode,
    helpText: string,
    robotStatus: StatusState,
    enqueueSnackbar: ProviderContext["enqueueSnackbar"]
    modeSwitcher?: React.ReactNode,
}

interface EditMapState extends MapState {
    segmentNames: Record<string, string>,
    segmentMaterials: Record<string, RawMapLayerMaterial>,
    hiddenSegmentIds: string[],
    cuttingLine: CuttingLineClientStructure | undefined,

    virtualWalls: Array<VirtualWallClientStructure>,
    noGoAreas: Array<NoGoAreaClientStructure>,
    noMopAreas: Array<NoMopAreaClientStructure>,

    passableThresholds: Array<PassableThresholdClientStructure>,
    impassableThresholds: Array<ImpassableThresholdClientStructure>,

    curtains: Array<CurtainClientStructure>,

    helpDialogOpen: boolean
}

class EditMap extends BaseMap<EditMapProps, EditMapState> {
    // Count of remaining map-update refreshes after a save (>1 handles the robot's intermediate map push before confirming)
    protected pendingVirtualRestrictionsStructuresUpdateCount = 0;
    protected pendingVirtualThresholdsStructuresUpdateCount = 0;
    protected pendingCurtainsStructuresUpdateCount = 0;

    constructor(props: EditMapProps) {
        super(props);

        this.state = {
            selectedSegmentIds: [],
            dialogOpen: false,
            dialogTitle: "Hello World",
            dialogBody: "This should never be visible",

            segmentNames: {},
            segmentMaterials: {},
            hiddenSegmentIds: [],
            cuttingLine: undefined,

            virtualWalls: [],
            noGoAreas: [],
            noMopAreas: [],

            passableThresholds: [],
            impassableThresholds: [],

            curtains: [],

            helpDialogOpen: false
        };

        this.updateVirtualRestrictionClientStructures(props.mode !== "virtual_restrictions");
        this.updateVirtualThresholdClientStructures(props.mode !== "virtual_thresholds");
        this.updateCurtainClientStructures(props.mode !== "curtains");
    }

    componentDidUpdate(prevProps: Readonly<EditMapProps>, prevState: Readonly<EditMapState>): void {
        if (prevProps.mode !== this.props.mode) {
            // Clear any pending reload counts from the previous mode so they don't
            // bleed into the new mode if a map update arrives after switching.
            this.pendingVirtualRestrictionsStructuresUpdateCount = 0;
            this.pendingVirtualThresholdsStructuresUpdateCount = 0;
            this.pendingCurtainsStructuresUpdateCount = 0;

            this.updateVirtualRestrictionClientStructures(this.props.mode !== "virtual_restrictions");
            this.updateVirtualThresholdClientStructures(this.props.mode !== "virtual_thresholds");
            this.updateCurtainClientStructures(this.props.mode !== "curtains");
            this.updateInternalDrawableState();
        }

        super.componentDidUpdate(prevProps, prevState);
    }

    protected getMapDataForRendering(): RawMapData {
        return this.props.rawMap;
    }

    protected async updateDrawableComponents(): Promise<void> {
        await new Promise<void>((resolve) => {
            this.drawableComponentsMutex.take(() => {
                resolve();
            });
        });


        this.drawableComponents = [];

        await this.mapLayerManager.draw(this.props.rawMap, this.props.paletteMode);
        this.drawableComponents.push(this.mapLayerManager.getCanvas());

        this.updateStructures(this.props.mode);

        if (this.props.mode === "virtual_restrictions" || this.props.mode === "virtual_thresholds" || this.props.mode === "curtains") {
            const pathsImage = await PathDrawer.drawPaths( {
                pathMapEntities: this.props.rawMap.entities.filter(e => {
                    return e.type === RawMapEntityType.Path;
                }),
                mapWidth: this.props.rawMap.size.x,
                mapHeight: this.props.rawMap.size.y,
                pixelSize: this.props.rawMap.pixelSize,
                paletteMode: this.props.paletteMode,
                opacity: 0.5
            });

            this.drawableComponents.push(pathsImage);
        }

        this.updateState();

        this.drawableComponentsMutex.leave();
    }

    private updateStructures(mode: mode) : void {
        this.structureManager.updateMapStructuresFromMapData({
            metaData: this.props.rawMap.metaData,
            size: this.props.rawMap.size,
            pixelSize: this.props.rawMap.pixelSize,
            layers: this.props.rawMap.layers,
            entities: this.props.rawMap.entities.filter(e => {
                switch (e.type) {
                    case RawMapEntityType.ChargerLocation:
                    case RawMapEntityType.Carpet:
                        return true;
                    default:
                        return false;
                }
            })
        });

        this.structureManager.getMapStructures().forEach(s => {
            if (s.type === SegmentLabelMapStructure.TYPE) {
                (s as SegmentLabelMapStructure).showMetaInfo = true;
            }
        });

        if (this.props.supportedCapabilities[Capability.MapSegmentCleanOrder]) {
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

            this.structureManager.getMapStructures().forEach(s => {
                if (s.type === SegmentLabelMapStructure.TYPE) {
                    const label = s as SegmentLabelMapStructure;
                    label.cleanOrderBadge = cleanOrderBySegmentId[label.id];
                }
            });
        }

        if (mode === "virtual_restrictions" || mode === "virtual_thresholds" || mode === "curtains") {
            // remove all segment labels
            this.structureManager.getMapStructures().forEach(s => {
                if (s.type === SegmentLabelMapStructure.TYPE) {
                    this.structureManager.removeMapStructure(s);
                }
            });
        }
    }


    protected updateState() : void {
        super.updateState();

        const segmentNames = {} as Record<string, string>;
        const segmentMaterials = {} as Record<string, RawMapLayerMaterial>;
        const hiddenSegmentIds: string[] = [];
        this.structureManager.getMapStructures().forEach(s => {
            if (s.type === SegmentLabelMapStructure.TYPE) {
                const label = s as SegmentLabelMapStructure;

                segmentNames[label.id] = label.name ?? label.id;
                segmentMaterials[label.id] = label.material ?? RawMapLayerMaterial.Generic;
                if (label.hidden) {
                    hiddenSegmentIds.push(label.id);
                }
            }
        });


        this.setState({
            segmentNames: segmentNames,
            segmentMaterials: segmentMaterials,
            hiddenSegmentIds: hiddenSegmentIds,
            cuttingLine: this.structureManager.getClientStructures().find(s => {
                if (s.type === CuttingLineClientStructure.TYPE) {
                    return true;
                }
            }) as CuttingLineClientStructure,

            virtualWalls: this.structureManager.getClientStructures().filter(s => {
                if (s.type === VirtualWallClientStructure.TYPE) {
                    return true;
                }
            }) as Array<VirtualWallClientStructure>,
            noGoAreas: this.structureManager.getClientStructures().filter(s => {
                if (s.type === NoGoAreaClientStructure.TYPE) {
                    return true;
                }
            }) as Array<NoGoAreaClientStructure>,
            noMopAreas: this.structureManager.getClientStructures().filter(s => {
                if (s.type === NoMopAreaClientStructure.TYPE) {
                    return true;
                }
            }) as Array<NoMopAreaClientStructure>,

            passableThresholds: this.structureManager.getClientStructures().filter(s => {
                return s.type === PassableThresholdClientStructure.TYPE;
            }) as Array<PassableThresholdClientStructure>,
            impassableThresholds: this.structureManager.getClientStructures().filter(s => {
                return s.type === ImpassableThresholdClientStructure.TYPE;
            }) as Array<ImpassableThresholdClientStructure>,

            curtains: this.structureManager.getClientStructures().filter(s => {
                return s.type === CurtainClientStructure.TYPE;
            }) as Array<CurtainClientStructure>
        });
    }

    private updateVirtualRestrictionClientStructures(remove: boolean) : void {
        if (remove) {
            this.structureManager.getClientStructures().forEach(s => {
                switch (s.type) {
                    case VirtualWallClientStructure.TYPE:
                    case NoGoAreaClientStructure.TYPE:
                    case NoMopAreaClientStructure.TYPE:
                        this.structureManager.removeClientStructure(s);
                }
            });
        } else {
            this.props.rawMap.entities.forEach(e => {
                switch (e.type) {
                    case RawMapEntityType.VirtualWall: {
                        const p0 = this.structureManager.convertCMCoordinatesToPixelSpace({x: e.points[0], y: e.points[1]});
                        const p1 = this.structureManager.convertCMCoordinatesToPixelSpace({x: e.points[2], y: e.points[3]});

                        this.structureManager.addClientStructure(new VirtualWallClientStructure(
                            p0.x, p0.y,
                            p1.x, p1.y,
                            false
                        ));
                        break;
                    }
                    case RawMapEntityType.NoGoArea: {
                        const p0 = this.structureManager.convertCMCoordinatesToPixelSpace({x: e.points[0], y: e.points[1]});
                        const p1 = this.structureManager.convertCMCoordinatesToPixelSpace({x: e.points[2], y: e.points[3]});
                        const p2 = this.structureManager.convertCMCoordinatesToPixelSpace({x: e.points[4], y: e.points[5]});
                        const p3 = this.structureManager.convertCMCoordinatesToPixelSpace({x: e.points[6], y: e.points[7]});


                        this.structureManager.addClientStructure(new NoGoAreaClientStructure(
                            p0.x, p0.y,
                            p1.x, p1.y,
                            p2.x, p2.y,
                            p3.x, p3.y,
                            false
                        ));
                        break;
                    }
                    case RawMapEntityType.NoMopArea: {
                        const p0 = this.structureManager.convertCMCoordinatesToPixelSpace({x: e.points[0], y: e.points[1]});
                        const p1 = this.structureManager.convertCMCoordinatesToPixelSpace({x: e.points[2], y: e.points[3]});
                        const p2 = this.structureManager.convertCMCoordinatesToPixelSpace({x: e.points[4], y: e.points[5]});
                        const p3 = this.structureManager.convertCMCoordinatesToPixelSpace({x: e.points[6], y: e.points[7]});


                        this.structureManager.addClientStructure(new NoMopAreaClientStructure(
                            p0.x, p0.y,
                            p1.x, p1.y,
                            p2.x, p2.y,
                            p3.x, p3.y,
                            false
                        ));
                        break;
                    }

                }
            });
        }
    }

    private updateVirtualThresholdClientStructures(remove: boolean) : void {
        if (remove) {
            this.structureManager.getClientStructures().forEach(s => {
                switch (s.type) {
                    case PassableThresholdClientStructure.TYPE:
                    case ImpassableThresholdClientStructure.TYPE:
                        this.structureManager.removeClientStructure(s);
                }
            });
        } else {
            this.props.rawMap.entities.forEach(e => {
                switch (e.type) {
                    case RawMapEntityType.PassableThreshold: {
                        const p0 = this.structureManager.convertCMCoordinatesToPixelSpace({x: e.points[0], y: e.points[1]});
                        const p1 = this.structureManager.convertCMCoordinatesToPixelSpace({x: e.points[2], y: e.points[3]});

                        this.structureManager.addClientStructure(new PassableThresholdClientStructure(
                            p0.x, p0.y,
                            p1.x, p1.y,
                            false
                        ));
                        break;
                    }
                    case RawMapEntityType.ImpassableThreshold: {
                        const p0 = this.structureManager.convertCMCoordinatesToPixelSpace({x: e.points[0], y: e.points[1]});
                        const p1 = this.structureManager.convertCMCoordinatesToPixelSpace({x: e.points[2], y: e.points[3]});

                        this.structureManager.addClientStructure(new ImpassableThresholdClientStructure(
                            p0.x, p0.y,
                            p1.x, p1.y,
                            false
                        ));
                        break;
                    }

                }
            });
        }
    }

    private updateCurtainClientStructures(remove: boolean) : void {
        if (remove) {
            this.structureManager.getClientStructures().forEach(s => {
                if (s.type === CurtainClientStructure.TYPE) {
                    this.structureManager.removeClientStructure(s);
                }
            });
        } else {
            this.props.rawMap.entities.forEach(e => {
                if (e.type === RawMapEntityType.Curtain) {
                    const p0 = this.structureManager.convertCMCoordinatesToPixelSpace({x: e.points[0], y: e.points[1]});
                    const p1 = this.structureManager.convertCMCoordinatesToPixelSpace({x: e.points[2], y: e.points[3]});

                    this.structureManager.addClientStructure(new CurtainClientStructure(
                        p0.x, p0.y,
                        p1.x, p1.y,
                        false
                    ));
                }
            });
        }
    }

    recenterMap = (): void => {
        this.redrawMap();
    };

    private clearSegmentStructures() : void {
        this.structureManager.getMapStructures().forEach(s => {
            if (s.type === SegmentLabelMapStructure.TYPE) {
                const label = s as SegmentLabelMapStructure;

                label.selected = false;
            }
        });

        this.structureManager.getClientStructures().forEach(s => {
            if (s.type === CuttingLineClientStructure.TYPE) {
                this.structureManager.removeClientStructure(s);
            }
        });

        this.updateState();

        this.redrawLayers();
    }

    protected onMapUpdate() : void {
        super.onMapUpdate();

        if (this.pendingVirtualRestrictionsStructuresUpdateCount > 0 && this.props.mode === "virtual_restrictions") {
            this.updateVirtualRestrictionClientStructures(true);
            this.updateVirtualRestrictionClientStructures(false);

            this.pendingVirtualRestrictionsStructuresUpdateCount--;
        } else if (this.props.mode === "virtual_restrictions") {
            const hasVRStructures = this.structureManager.getClientStructures().some(s =>
                s.type === VirtualWallClientStructure.TYPE ||
                s.type === NoGoAreaClientStructure.TYPE ||
                s.type === NoMopAreaClientStructure.TYPE
            );
            if (!hasVRStructures) {
                this.updateVirtualRestrictionClientStructures(false);
            }
        }

        if (this.pendingVirtualThresholdsStructuresUpdateCount > 0 && this.props.mode === "virtual_thresholds") {
            this.updateVirtualThresholdClientStructures(true);
            this.updateVirtualThresholdClientStructures(false);

            this.pendingVirtualThresholdsStructuresUpdateCount--;
        } else if (this.props.mode === "virtual_thresholds") {
            const hasThresholdStructures = this.structureManager.getClientStructures().some(s =>
                s.type === PassableThresholdClientStructure.TYPE ||
                s.type === ImpassableThresholdClientStructure.TYPE
            );
            if (!hasThresholdStructures) {
                this.updateVirtualThresholdClientStructures(false);
            }
        }

        if (this.pendingCurtainsStructuresUpdateCount > 0 && this.props.mode === "curtains") {
            this.updateCurtainClientStructures(true);
            this.updateCurtainClientStructures(false);

            this.pendingCurtainsStructuresUpdateCount--;
        } else if (this.props.mode === "curtains") {
            const hasCurtainStructures = this.structureManager.getClientStructures().some(s =>
                s.type === CurtainClientStructure.TYPE
            );
            if (!hasCurtainStructures) {
                this.updateCurtainClientStructures(false);
            }
        }
    }

    //eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    protected onTap(evt: any): boolean | void {
        // Only allow map interaction while the robot is docked
        if (this.props.robotStatus.value === "docked") {
            if (super.onTap(evt)) {
                return true;
            }

            if (
                this.props.mode === "segments" &&
                this.state.cuttingLine === undefined
            ) {
                const {x, y} = this.relativeCoordinatesToCanvas(evt.x0, evt.y0);
                const tappedPointInMapSpace = this.ctxWrapper.mapPointToCurrentTransform(x, y);

                const intersectingSegmentId = this.mapLayerManager.getIntersectingSegment(tappedPointInMapSpace.x, tappedPointInMapSpace.y);

                if (intersectingSegmentId) {
                    const segmentLabels = this.structureManager.getMapStructures().filter(s => {
                        return s.type === SegmentLabelMapStructure.TYPE;
                    }) as Array<SegmentLabelMapStructure>;

                    const matchedSegmentLabel = segmentLabels.find(l => {
                        return l.id === intersectingSegmentId;
                    });

                    if (
                        this.state.selectedSegmentIds.length < 2 ||
                        this.state.selectedSegmentIds.includes(intersectingSegmentId)
                    ) {
                        if (matchedSegmentLabel) {
                            matchedSegmentLabel.onTap();

                            this.updateState();
                            this.redrawLayers();

                            return true;
                        }
                    }
                }
            }
        }
    }

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

                <MapToolbarContainer>
                    <MapToolbar
                        setHelpDialogOpen={(open) => {
                            this.setState({helpDialogOpen: open});
                        }}
                    />
                    {this.props.modeSwitcher}
                </MapToolbarContainer>

                <ActionsContainer>
                    {
                        (
                            this.props.supportedCapabilities[Capability.MapSegmentEdit] ||
                            this.props.supportedCapabilities[Capability.MapSegmentRename] ||
                            this.props.supportedCapabilities[Capability.MapSegmentCleanOrder]
                        ) &&
                        this.props.mode === "segments" &&

                        <SegmentActions
                            robotStatus={this.props.robotStatus}
                            selectedSegmentIds={this.state.selectedSegmentIds}
                            segmentNames={this.state.segmentNames}
                            segmentMaterials={this.state.segmentMaterials}
                            hiddenSegmentIds={this.state.hiddenSegmentIds}
                            cuttingLine={this.state.cuttingLine}
                            convertPixelCoordinatesToCMSpace={(coordinates => {
                                return this.structureManager.convertPixelCoordinatesToCMSpace(coordinates);
                            })}
                            supportedCapabilities={{
                                [Capability.MapSegmentEdit]: this.props.supportedCapabilities[Capability.MapSegmentEdit],
                                [Capability.MapSegmentRename]: this.props.supportedCapabilities[Capability.MapSegmentRename],
                                [Capability.MapSegmentMaterialControl]: this.props.supportedCapabilities[Capability.MapSegmentMaterialControl],
                                [Capability.MapSegmentHide]: this.props.supportedCapabilities[Capability.MapSegmentHide],
                                [Capability.MapSegmentCleanOrder]: this.props.supportedCapabilities[Capability.MapSegmentCleanOrder],
                            }}
                            onAddCuttingLine={() => {
                                const currentCenter = this.getCurrentViewportCenterCoordinatesInPixelSpace();

                                const p0 = {
                                    x: currentCenter.x -15,
                                    y: currentCenter.y -15
                                };
                                const p1 = {
                                    x: currentCenter.x +15,
                                    y: currentCenter.y +15
                                };

                                this.structureManager.addClientStructure(new CuttingLineClientStructure(
                                    p0.x, p0.y,
                                    p1.x, p1.y,
                                    true
                                ));

                                this.updateState();

                                this.draw();
                            }}
                            onClear={() => {
                                this.clearSegmentStructures();
                            }}
                        />
                    }
                    {
                        (
                            this.props.supportedCapabilities[Capability.CombinedVirtualRestrictions]
                        ) &&
                        this.props.mode === "virtual_restrictions" &&

                        <VirtualRestrictionActions
                            robotStatus={this.props.robotStatus}
                            virtualWalls={this.state.virtualWalls}
                            noGoAreas={this.state.noGoAreas}
                            noMopAreas={this.state.noMopAreas}

                            convertPixelCoordinatesToCMSpace={(coordinates => {
                                return this.structureManager.convertPixelCoordinatesToCMSpace(coordinates);
                            })}

                            onAddVirtualWall={() => {
                                const currentCenter = this.getCurrentViewportCenterCoordinatesInPixelSpace();

                                const p0 = {
                                    x: currentCenter.x -15,
                                    y: currentCenter.y -15
                                };
                                const p1 = {
                                    x: currentCenter.x +15,
                                    y: currentCenter.y +15
                                };

                                this.structureManager.addClientStructure(new VirtualWallClientStructure(
                                    p0.x, p0.y,
                                    p1.x, p1.y,
                                    true
                                ));

                                this.updateState();

                                this.draw();
                            }}
                            onAddNoGoArea={() => {
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


                                this.structureManager.addClientStructure(new NoGoAreaClientStructure(
                                    p0.x, p0.y,
                                    p1.x, p1.y,
                                    p2.x, p2.y,
                                    p3.x, p3.y,
                                    true
                                ));

                                this.updateState();

                                this.draw();
                            }}
                            onAddNoMopArea={() => {
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

                                this.structureManager.addClientStructure(new NoMopAreaClientStructure(
                                    p0.x, p0.y,
                                    p1.x, p1.y,
                                    p2.x, p2.y,
                                    p3.x, p3.y,
                                    true
                                ));

                                this.updateState();

                                this.draw();
                            }}
                            onRefresh={() => {
                                this.updateVirtualRestrictionClientStructures(true);
                                this.updateVirtualRestrictionClientStructures(false);

                                this.updateState();
                                this.draw();
                            }}
                            onClear={() => {
                                this.updateVirtualRestrictionClientStructures(true);

                                this.updateState();
                                this.draw();
                            }}
                            onSave={() => {
                                this.pendingVirtualRestrictionsStructuresUpdateCount = 2;

                                this.structureManager.getClientStructures().forEach(s => {
                                    s.active = false;
                                });
                                this.draw();

                                this.props.enqueueSnackbar("Saved successfully", {
                                    preventDuplicate: true,
                                    key: "virtual_restrictions_saved",
                                    variant: "info",
                                    autoHideDuration: 1000,
                                });
                            }}
                        />
                    }
                    {
                        this.props.supportedCapabilities[Capability.CombinedVirtualThresholds] &&
                        this.props.mode === "virtual_thresholds" &&

                        <VirtualThresholdActions
                            robotStatus={this.props.robotStatus}
                            passableThresholds={this.state.passableThresholds}
                            impassableThresholds={this.state.impassableThresholds}

                            convertPixelCoordinatesToCMSpace={(coordinates) => {
                                return this.structureManager.convertPixelCoordinatesToCMSpace(coordinates);
                            }}

                            onAddPassableThreshold={() => {
                                const currentCenter = this.getCurrentViewportCenterCoordinatesInPixelSpace();

                                this.structureManager.addClientStructure(new PassableThresholdClientStructure(
                                    currentCenter.x - 15, currentCenter.y - 15,
                                    currentCenter.x + 15, currentCenter.y + 15,
                                    true
                                ));

                                this.updateState();
                                this.draw();
                            }}
                            onAddImpassableThreshold={() => {
                                const currentCenter = this.getCurrentViewportCenterCoordinatesInPixelSpace();

                                this.structureManager.addClientStructure(new ImpassableThresholdClientStructure(
                                    currentCenter.x - 15, currentCenter.y - 15,
                                    currentCenter.x + 15, currentCenter.y + 15,
                                    true
                                ));

                                this.updateState();
                                this.draw();
                            }}
                            onRefresh={() => {
                                this.updateVirtualThresholdClientStructures(true);
                                this.updateVirtualThresholdClientStructures(false);

                                this.updateState();
                                this.draw();
                            }}
                            onClear={() => {
                                this.updateVirtualThresholdClientStructures(true);

                                this.updateState();
                                this.draw();
                            }}
                            onSave={() => {
                                this.pendingVirtualThresholdsStructuresUpdateCount = 2;

                                this.structureManager.getClientStructures().forEach(s => {
                                    s.active = false;
                                });
                                this.draw();

                                this.props.enqueueSnackbar("Saved successfully", {
                                    preventDuplicate: true,
                                    key: "virtual_thresholds_saved",
                                    variant: "info",
                                    autoHideDuration: 1000,
                                });
                            }}
                            onRequestDraw={() => {
                                this.draw();
                            }}
                        />
                    }
                    {
                        this.props.supportedCapabilities[Capability.Curtains] &&
                        this.props.mode === "curtains" &&

                        <CurtainActions
                            robotStatus={this.props.robotStatus}
                            curtains={this.state.curtains}

                            convertPixelCoordinatesToCMSpace={(coordinates) => {
                                return this.structureManager.convertPixelCoordinatesToCMSpace(coordinates);
                            }}

                            onAddCurtain={() => {
                                const currentCenter = this.getCurrentViewportCenterCoordinatesInPixelSpace();

                                this.structureManager.addClientStructure(new CurtainClientStructure(
                                    currentCenter.x - 15, currentCenter.y - 15,
                                    currentCenter.x + 15, currentCenter.y + 15,
                                    true
                                ));

                                this.updateState();
                                this.draw();
                            }}
                            onRefresh={() => {
                                this.updateCurtainClientStructures(true);
                                this.updateCurtainClientStructures(false);

                                this.updateState();
                                this.draw();
                            }}
                            onClear={() => {
                                this.updateCurtainClientStructures(true);

                                this.updateState();
                                this.draw();
                            }}
                            onSave={() => {
                                this.pendingCurtainsStructuresUpdateCount = 2;

                                this.structureManager.getClientStructures().forEach(s => {
                                    s.active = false;
                                });
                                this.draw();

                                this.props.enqueueSnackbar("Saved successfully", {
                                    preventDuplicate: true,
                                    key: "curtains_saved",
                                    variant: "info",
                                    autoHideDuration: 1000,
                                });
                            }}
                            onRequestDraw={() => {
                                this.draw();
                            }}
                        />
                    }
                </ActionsContainer>

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

                <HelpDialog
                    dialogOpen={this.state.helpDialogOpen}
                    setDialogOpen={(open: boolean) => {
                        this.setState({helpDialogOpen: open});
                    }}
                    helpText={this.props.helpText}
                />
            </MapContainer>
        );
    }
}

export default EditMap;
