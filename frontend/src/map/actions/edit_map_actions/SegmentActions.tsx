import {
    Capability,
    MapSegmentMaterial,
    RawMapLayer,
    RawMapLayerMaterial,
    RawMapLayerType,
    StatusState,
    useJoinSegmentsMutation,
    useMapSegmentMaterialControlPropertiesQuery,
    useRenameSegmentMutation,
    useRobotMapQuery,
    useSegmentCleanOrderMutation,
    useSetHiddenSegmentsMutation,
    useSetSegmentMaterialMutation,
    useSplitSegmentMutation,
} from "../../../api";
import React from "react";
import {
    Avatar,
    Box,
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    Divider,
    FormControl,
    FormControlLabel,
    Grid2,
    IconButton,
    List,
    ListItem,
    ListItemAvatar,
    ListItemText,
    Radio,
    RadioGroup,
    TextField,
    Typography
} from "@mui/material";
import {ActionButton} from "../../Styled";
import CuttingLineClientStructure from "../../structures/client_structures/CuttingLineClientStructure";
import {PointCoordinates} from "../../utils/types";
import {
    Clear as ClearIcon,
    ContentCut as SplitIcon,
    Dashboard as MaterialIcon,
    ExpandLess,
    ExpandMore,
    JoinFull as JoinIcon,
    SwapVert as CleanOrderIcon,
    Visibility as UnhideIcon,
    VisibilityOff as HideIcon,
} from "@mui/icons-material";
import {AddCuttingLineIcon, RenameIcon} from "../../../components/CustomIcons";

const getMaterialLabel = (material: MapSegmentMaterial): string => {
    switch (material) {
        case MapSegmentMaterial.Generic:
            return "Generic";
        case MapSegmentMaterial.Tile:
            return "Tile";
        case MapSegmentMaterial.Wood:
            return "Wood";
        case MapSegmentMaterial.WoodHorizontal:
            return "Wood (Horizontal)";
        case MapSegmentMaterial.WoodVertical:
            return "Wood (Vertical)";
        default:
            return material;
    }
};

interface SegmentRenameDialogProps {
    open: boolean;
    onClose: () => void;
    currentName: string;
    onRename: (newName: string) => void;
}

const SegmentRenameDialog = (props: SegmentRenameDialogProps) => {
    const {open, onClose, currentName, onRename} = props;
    const [name, setName] = React.useState(currentName);

    React.useEffect(() => {
        if (open) {
            setName(currentName);
        }
    }, [open, currentName]);

    return (
        <Dialog open={open} onClose={onClose} sx={{userSelect: "none"}}>
            <DialogTitle>Rename Segment</DialogTitle>
            <DialogContent>
                <DialogContentText>
                    How should the segment &apos;{currentName}&apos; be called?
                </DialogContentText>
                <TextField
                    autoFocus
                    margin="dense"
                    variant="standard"
                    label="Segment name"
                    fullWidth
                    value={name}
                    onChange={(e) => {
                        setName(e.target.value);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            onRename(name.trim());
                        }
                    }}
                />
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button
                    onClick={() => {
                        onRename(name.trim());
                    }}
                >
                    Rename
                </Button>
            </DialogActions>
        </Dialog>
    );
};

interface SegmentMaterialDialogProps {
    open: boolean;
    onClose: () => void;
    name: string;
    currentMaterial: MapSegmentMaterial;
    onSubmit: (material: MapSegmentMaterial) => void;
}

const SegmentMaterialDialog = (props: SegmentMaterialDialogProps) => {
    const {open, onClose, name, currentMaterial, onSubmit} = props;
    const [material, setMaterial] = React.useState<MapSegmentMaterial>(currentMaterial);

    const {
        data: materialProperties,
        isPending: materialPropertiesPending
    } = useMapSegmentMaterialControlPropertiesQuery();

    React.useEffect(() => {
        if (open) {
            setMaterial(currentMaterial);
        }
    }, [open, currentMaterial]);

    const supportedMaterials = materialProperties?.supportedMaterials ?? [];

    return (
        <Dialog open={open} onClose={onClose} sx={{userSelect: "none"}}>
            <DialogTitle>Segment Material</DialogTitle>
            <DialogContent>
                <DialogContentText style={{marginBottom: "1rem"}}>
                    What material is the floor of segment &apos;{name}&apos; made of?
                </DialogContentText>
                {materialPropertiesPending ? (
                    <CircularProgress/>
                ) : (
                    <FormControl component="fieldset">
                        <RadioGroup
                            value={material}
                            onChange={(e) => setMaterial(e.target.value as MapSegmentMaterial)}
                        >
                            {supportedMaterials.map((material) => (
                                <FormControlLabel
                                    key={material}
                                    value={material}
                                    control={<Radio/>}
                                    label={getMaterialLabel(material)}
                                />
                            ))}
                        </RadioGroup>
                    </FormControl>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button
                    onClick={() => {
                        onSubmit(material);
                    }}
                >
                    Save
                </Button>
            </DialogActions>
        </Dialog>
    );
};

interface SegmentCleanOrderDialogProps {
    open: boolean;
    onClose: () => void;
}

const SegmentCleanOrderDialog = ({open, onClose}: SegmentCleanOrderDialogProps): React.ReactElement => {
    const {data: mapData, isPending: mapIsPending} = useRobotMapQuery();
    const {mutate: updateCleanOrder, isPending: cleanOrderUpdating} = useSegmentCleanOrderMutation();

    const [segments, setSegments] = React.useState<RawMapLayer[]>([]);
    const [configurationModified, setConfigurationModified] = React.useState(false);

    React.useEffect(() => {
        if (open && mapData) {
            const sorted = (mapData.layers ?? [])
                .filter(l => l.type === RawMapLayerType.Segment && !l.metaData.hidden)
                .sort((a, b) => (a.metaData.cleanOrder ?? 0) - (b.metaData.cleanOrder ?? 0));
            setSegments(sorted);
            setConfigurationModified(false);
        }
    }, [open, mapData]);

    const offsetSegment = (index: number, offset: number) => {
        const next = segments.slice();
        const moved = next.splice(index, 1)[0];
        next.splice(index + offset, 0, moved);
        setSegments(next);
        setConfigurationModified(true);
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth sx={{userSelect: "none"}}>
            <DialogTitle>Clean Order</DialogTitle>
            <DialogContent sx={{pb: 0}}>
                <Typography variant="caption" color="text.secondary" sx={{display: "block", pb: 1}}>
                    Set the default segment order. This does not apply to custom segment or zone cleaning.
                </Typography>
                {mapIsPending ? (
                    <Box display="flex" justifyContent="center" p={2}>
                        <CircularProgress/>
                    </Box>
                ) : segments.length === 0 ? (
                    <Typography align="center" p={2}>No segments found</Typography>
                ) : (
                    <List dense disablePadding sx={{mx: -3}}>
                        {segments.map((entry, index) => (
                            <React.Fragment key={entry.metaData.segmentId}>
                                {index > 0 && <Divider component="li"/>}
                                <ListItem
                                    secondaryAction={
                                        <Grid2 container direction="row">
                                            <IconButton
                                                size="small"
                                                disabled={index === 0}
                                                onClick={() => offsetSegment(index, -1)}
                                            >
                                                <ExpandLess/>
                                            </IconButton>
                                            <IconButton
                                                size="small"
                                                disabled={index === segments.length - 1}
                                                onClick={() => offsetSegment(index, 1)}
                                            >
                                                <ExpandMore/>
                                            </IconButton>
                                        </Grid2>
                                    }
                                >
                                    <ListItemAvatar>
                                        <Avatar sx={{
                                            width: 28,
                                            height: 28,
                                            fontSize: "0.8rem",
                                            fontWeight: "bold",
                                            backgroundColor: "rgba(0, 0, 0, 0.85)",
                                            color: "#fff",
                                        }}>
                                            {index + 1}
                                        </Avatar>
                                    </ListItemAvatar>
                                    <ListItemText
                                        primary={entry.metaData.name ?? "Segment"}
                                    />
                                </ListItem>
                            </React.Fragment>
                        ))}
                    </List>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button
                    loading={cleanOrderUpdating}
                    disabled={!configurationModified}
                    onClick={() => {
                        updateCleanOrder(
                            segments
                                .map(e => e.metaData.segmentId)
                                .filter((id): id is string => id !== undefined),
                            {onSuccess: onClose}
                        );
                    }}
                >
                    Save
                </Button>
            </DialogActions>
        </Dialog>
    );
};

interface SegmentActionsProperties {
    robotStatus: StatusState,
    selectedSegmentIds: string[];
    segmentNames: Record<string, string>;
    segmentMaterials: Record<string, RawMapLayerMaterial>;
    hiddenSegmentIds: string[];
    cuttingLine: CuttingLineClientStructure | undefined,

    convertPixelCoordinatesToCMSpace(coordinates: PointCoordinates): PointCoordinates

    supportedCapabilities: {
        [Capability.MapSegmentEdit]: boolean,
        [Capability.MapSegmentRename]: boolean,
        [Capability.MapSegmentMaterialControl]: boolean,
        [Capability.MapSegmentHide]: boolean,
        [Capability.MapSegmentCleanOrder]: boolean,
    }

    onAddCuttingLine(): void,

    onClear(): void;
}

const SegmentActions = (
    props: SegmentActionsProperties
): React.ReactElement => {
    const {
        selectedSegmentIds,
        segmentNames,
        segmentMaterials,
        hiddenSegmentIds,
        cuttingLine,
        convertPixelCoordinatesToCMSpace,
        supportedCapabilities,
        onAddCuttingLine,
        onClear
    } = props;

    const [renameDialogOpen, setRenameDialogOpen] = React.useState(false);
    const [materialDialogOpen, setMaterialDialogOpen] = React.useState(false);
    const [cleanOrderDialogOpen, setCleanOrderDialogOpen] = React.useState(false);

    const {
        mutate: joinSegments,
        isPending: joinSegmentsExecuting
    } = useJoinSegmentsMutation({
        onSuccess: onClear,
    });
    const {
        mutate: splitSegment,
        isPending: splitSegmentExecuting
    } = useSplitSegmentMutation({
        onSuccess: onClear,
    });
    const {
        mutate: renameSegment,
        isPending: renameSegmentExecuting
    } = useRenameSegmentMutation({
        onSuccess: onClear,
    });
    const {
        mutate: setSegmentMaterial,
        isPending: setSegmentMaterialExecuting
    } = useSetSegmentMaterialMutation({
        onSuccess: onClear,
    });
    const {
        mutate: setHiddenSegments,
        isPending: setHiddenSegmentsExecuting
    } = useSetHiddenSegmentsMutation({
        onSuccess: onClear,
    });

    const canEdit = props.robotStatus.value === "docked";

    const handleSplitClick = React.useCallback(() => {
        if (!canEdit || !cuttingLine || selectedSegmentIds.length !== 1) {
            return;
        }

        splitSegment({
            segment_id: selectedSegmentIds[0],
            pA: convertPixelCoordinatesToCMSpace({
                x: cuttingLine.x0,
                y: cuttingLine.y0
            }),
            pB: convertPixelCoordinatesToCMSpace({
                x: cuttingLine.x1,
                y: cuttingLine.y1
            })
        });
    }, [canEdit, splitSegment, selectedSegmentIds, cuttingLine, convertPixelCoordinatesToCMSpace]);

    const handleJoinClick = React.useCallback(() => {
        if (!canEdit || selectedSegmentIds.length !== 2) {
            return;
        }

        joinSegments({
            segment_a_id: selectedSegmentIds[0],
            segment_b_id: selectedSegmentIds[1],
        });
    }, [canEdit, joinSegments, selectedSegmentIds]);

    const handleRename = React.useCallback((name: string) => {
        if (!canEdit || selectedSegmentIds.length !== 1) {
            return;
        }
        setRenameDialogOpen(false);
        renameSegment({
            segment_id: selectedSegmentIds[0],
            name: name
        });
    }, [canEdit, renameSegment, selectedSegmentIds]);

    const handleSetMaterial = React.useCallback((material: MapSegmentMaterial) => {
        if (!canEdit || selectedSegmentIds.length !== 1) {
            return;
        }
        setMaterialDialogOpen(false);
        setSegmentMaterial({
            segment_id: selectedSegmentIds[0],
            material: material
        });
    }, [canEdit, setSegmentMaterial, selectedSegmentIds]);


    return (
        <Grid2 container spacing={1} direction="row-reverse" flexWrap="wrap-reverse">
            {
                supportedCapabilities[Capability.MapSegmentEdit] &&
                (selectedSegmentIds.length === 1 || selectedSegmentIds.length === 2) &&
                cuttingLine === undefined &&

                <Grid2>
                    <ActionButton
                        disabled={joinSegmentsExecuting || !canEdit || selectedSegmentIds.length !== 2}
                        color="inherit"
                        size="medium"
                        variant="extended"
                        onClick={handleJoinClick}
                    >
                        <JoinIcon style={{marginRight: "0.25rem", marginLeft: "-0.25rem"}}/>
                        Join {segmentNames[selectedSegmentIds[0]]} and {selectedSegmentIds.length === 2 ? segmentNames[selectedSegmentIds[1]] : "?"}
                        {joinSegmentsExecuting && (
                            <CircularProgress
                                color="inherit"
                                size={18}
                                style={{marginLeft: 10}}
                            />
                        )}
                    </ActionButton>
                </Grid2>
            }
            {
                supportedCapabilities[Capability.MapSegmentEdit] &&
                selectedSegmentIds.length === 1 &&
                cuttingLine !== undefined &&

                <Grid2>
                    <ActionButton
                        disabled={splitSegmentExecuting || !canEdit}
                        color="inherit"
                        size="medium"
                        variant="extended"
                        onClick={handleSplitClick}
                    >
                        <SplitIcon style={{marginRight: "0.25rem", marginLeft: "-0.25rem"}}/>
                        Split {segmentNames[selectedSegmentIds[0]]}
                        {splitSegmentExecuting && (
                            <CircularProgress
                                color="inherit"
                                size={18}
                                style={{marginLeft: 10}}
                            />
                        )}
                    </ActionButton>
                </Grid2>
            }
            {
                supportedCapabilities[Capability.MapSegmentRename] &&
                selectedSegmentIds.length === 1 &&
                cuttingLine === undefined &&

                <Grid2>
                    <ActionButton
                        disabled={renameSegmentExecuting || !canEdit}
                        color="inherit"
                        size="medium"
                        variant="extended"
                        onClick={() => {
                            setRenameDialogOpen(true);
                        }}
                    >
                        <RenameIcon style={{marginRight: "0.25rem", marginLeft: "-0.25rem"}}/>
                        Rename
                        {renameSegmentExecuting && (
                            <CircularProgress
                                color="inherit"
                                size={18}
                                style={{marginLeft: 10}}
                            />
                        )}
                    </ActionButton>
                </Grid2>
            }
            {
                supportedCapabilities[Capability.MapSegmentHide] &&
                selectedSegmentIds.length >= 1 &&
                cuttingLine === undefined &&
                !selectedSegmentIds.some(id => hiddenSegmentIds.includes(id)) &&

                <Grid2>
                    <ActionButton
                        disabled={setHiddenSegmentsExecuting || !canEdit}
                        color="inherit"
                        size="medium"
                        variant="extended"
                        onClick={() => {
                            setHiddenSegments([...hiddenSegmentIds, ...selectedSegmentIds]);
                        }}
                    >
                        <HideIcon style={{marginRight: "0.25rem", marginLeft: "-0.25rem"}}/>
                        Hide
                        {setHiddenSegmentsExecuting && (
                            <CircularProgress
                                color="inherit"
                                size={18}
                                style={{marginLeft: 10}}
                            />
                        )}
                    </ActionButton>
                </Grid2>
            }
            {
                supportedCapabilities[Capability.MapSegmentHide] &&
                selectedSegmentIds.length === 1 &&
                cuttingLine === undefined &&
                hiddenSegmentIds.includes(selectedSegmentIds[0]) &&

                <Grid2>
                    <ActionButton
                        disabled={setHiddenSegmentsExecuting || !canEdit}
                        color="inherit"
                        size="medium"
                        variant="extended"
                        onClick={() => {
                            setHiddenSegments(hiddenSegmentIds.filter(id => id !== selectedSegmentIds[0]));
                        }}
                    >
                        <UnhideIcon style={{marginRight: "0.25rem", marginLeft: "-0.25rem"}}/>
                        Unhide
                        {setHiddenSegmentsExecuting && (
                            <CircularProgress
                                color="inherit"
                                size={18}
                                style={{marginLeft: 10}}
                            />
                        )}
                    </ActionButton>
                </Grid2>
            }
            {
                supportedCapabilities[Capability.MapSegmentMaterialControl] &&
                selectedSegmentIds.length === 1 &&
                cuttingLine === undefined &&

                <Grid2>
                    <ActionButton
                        disabled={setSegmentMaterialExecuting || !canEdit}
                        color="inherit"
                        size="medium"
                        variant="extended"
                        onClick={() => {
                            setMaterialDialogOpen(true);
                        }}
                    >
                        <MaterialIcon style={{marginRight: "0.25rem", marginLeft: "-0.25rem"}}/>
                        Material
                        {setSegmentMaterialExecuting && (
                            <CircularProgress
                                color="inherit"
                                size={18}
                                style={{marginLeft: 10}}
                            />
                        )}
                    </ActionButton>
                </Grid2>
            }
            {
                supportedCapabilities[Capability.MapSegmentCleanOrder] &&
                selectedSegmentIds.length >= 1 &&
                cuttingLine === undefined &&

                <Grid2>
                    <ActionButton
                        color="inherit"
                        size="medium"
                        variant="extended"
                        onClick={() => setCleanOrderDialogOpen(true)}
                    >
                        <CleanOrderIcon style={{marginRight: "0.25rem", marginLeft: "-0.25rem"}}/>
                        Reorder
                    </ActionButton>
                </Grid2>
            }
            {
                supportedCapabilities[Capability.MapSegmentEdit] &&
                selectedSegmentIds.length === 1 &&
                cuttingLine === undefined &&

                <Grid2>
                    <ActionButton
                        disabled={joinSegmentsExecuting || !canEdit}
                        color="inherit"
                        size="medium"
                        variant="extended"
                        onClick={onAddCuttingLine}
                    >
                        <AddCuttingLineIcon style={{marginRight: "0.25rem", marginLeft: "-0.25rem"}}/>
                        Cutting Line
                    </ActionButton>
                </Grid2>
            }
            {
                (
                    selectedSegmentIds.length > 0 ||
                    cuttingLine !== undefined
                ) &&

                <Grid2>
                    <ActionButton
                        color="inherit"
                        size="medium"
                        variant="extended"
                        onClick={onClear}
                    >
                        <ClearIcon style={{marginRight: "0.25rem", marginLeft: "-0.25rem"}}/>
                        Clear
                    </ActionButton>
                </Grid2>
            }
            {
                !canEdit &&
                <Grid2>
                    <Typography variant="caption" color="textSecondary">
                        Editing segments requires the robot to be docked
                    </Typography>
                </Grid2>
            }
            {
                canEdit &&
                selectedSegmentIds.length === 0 &&
                <Grid2>
                    <Typography variant="caption" color="textSecondary" style={{fontSize: "1em"}}>
                        Please select a segment to start editing
                    </Typography>
                </Grid2>
            }

            {
                supportedCapabilities[Capability.MapSegmentRename] && selectedSegmentIds.length === 1 &&
                <SegmentRenameDialog
                    open={renameDialogOpen}
                    onClose={() => setRenameDialogOpen(false)}
                    currentName={segmentNames[selectedSegmentIds[0]] ?? selectedSegmentIds[0]}
                    onRename={handleRename}
                />
            }

            {
                supportedCapabilities[Capability.MapSegmentMaterialControl] && selectedSegmentIds.length === 1 &&
                <SegmentMaterialDialog
                    open={materialDialogOpen}
                    onClose={() => setMaterialDialogOpen(false)}
                    name={segmentNames[selectedSegmentIds[0]] ?? selectedSegmentIds[0]}
                    currentMaterial={segmentMaterials[selectedSegmentIds[0]] as unknown as MapSegmentMaterial ?? MapSegmentMaterial.Generic}
                    onSubmit={handleSetMaterial}
                />
            }

            {
                supportedCapabilities[Capability.MapSegmentCleanOrder] &&
                <SegmentCleanOrderDialog
                    open={cleanOrderDialogOpen}
                    onClose={() => setCleanOrderDialogOpen(false)}
                />
            }
        </Grid2>
    );
};

export default SegmentActions;
