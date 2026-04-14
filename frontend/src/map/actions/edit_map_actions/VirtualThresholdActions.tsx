import {
    StatusState,
    useCombinedVirtualThresholdsMutation,
} from "../../../api";
import React from "react";
import {Grid2, Typography} from "@mui/material";
import {ActionButton} from "../../Styled";
import PassableThresholdClientStructure from "../../structures/client_structures/PassableThresholdClientStructure";
import ImpassableThresholdClientStructure from "../../structures/client_structures/ImpassableThresholdClientStructure";
import {PointCoordinates} from "../../utils/types";
import {
    Save as SaveIcon,
    Refresh as RefreshIcon,
    Clear as ClearIcon,
    Add as AddIcon,
} from "@mui/icons-material";
import {CircularProgress} from "@mui/material";

interface VirtualThresholdActionsProperties {
    robotStatus: StatusState,
    passableThresholds: Array<PassableThresholdClientStructure>,
    impassableThresholds: Array<ImpassableThresholdClientStructure>,

    convertPixelCoordinatesToCMSpace(coordinates: PointCoordinates): PointCoordinates

    onAddPassableThreshold(): void,
    onAddImpassableThreshold(): void,

    onSave(): void;
    onRefresh(): void;
    onClear(): void;
    onRequestDraw(): void;
}

const VirtualThresholdActions = (
    props: VirtualThresholdActionsProperties
): React.ReactElement => {
    const {
        passableThresholds,
        impassableThresholds,

        convertPixelCoordinatesToCMSpace,

        onAddPassableThreshold,
        onAddImpassableThreshold,

        onSave,
        onRefresh,
        onClear,
    } = props;

    const {
        mutate: saveThresholds,
        isPending: thresholdsSaving
    } = useCombinedVirtualThresholdsMutation({
        onSuccess: onSave,
    });

    const canEdit = props.robotStatus.value === "docked";

    const handleSaveClick = React.useCallback(() => {
        if (!canEdit) {
            return;
        }

        saveThresholds({
            passableThresholds: passableThresholds.map(t => ({
                points: {
                    pA: convertPixelCoordinatesToCMSpace({x: t.x0, y: t.y0}),
                    pB: convertPixelCoordinatesToCMSpace({x: t.x1, y: t.y1})
                }
            })),
            impassableThresholds: impassableThresholds.map(t => ({
                points: {
                    pA: convertPixelCoordinatesToCMSpace({x: t.x0, y: t.y0}),
                    pB: convertPixelCoordinatesToCMSpace({x: t.x1, y: t.y1})
                }
            })),
            ramps: []
        });
    }, [canEdit, saveThresholds, passableThresholds, impassableThresholds, convertPixelCoordinatesToCMSpace]);

    return (
        <Grid2 container spacing={1} direction="row-reverse" flexWrap="wrap-reverse">
            {
                canEdit &&

                <Grid2>
                    <ActionButton
                        disabled={thresholdsSaving}
                        color="inherit"
                        size="medium"
                        variant="extended"
                        onClick={handleSaveClick}
                    >
                        <SaveIcon style={{marginRight: "0.25rem", marginLeft: "-0.25rem"}}/>
                        Save
                        {thresholdsSaving && (
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
                canEdit &&

                <Grid2>
                    <ActionButton
                        color="inherit"
                        size="medium"
                        variant="extended"
                        onClick={onAddPassableThreshold}
                    >
                        <AddIcon style={{marginRight: "0.25rem", marginLeft: "-0.25rem"}}/>
                        Passable ({passableThresholds.length})
                    </ActionButton>
                </Grid2>
            }
            {
                canEdit &&

                <Grid2>
                    <ActionButton
                        color="inherit"
                        size="medium"
                        variant="extended"
                        onClick={onAddImpassableThreshold}
                    >
                        <AddIcon style={{marginRight: "0.25rem", marginLeft: "-0.25rem"}}/>
                        Impassable ({impassableThresholds.length})
                    </ActionButton>
                </Grid2>
            }
            {
                canEdit &&

                <Grid2>
                    <ActionButton
                        color="inherit"
                        size="medium"
                        variant="extended"
                        disabled={passableThresholds.length === 0 && impassableThresholds.length === 0}
                        onClick={onClear}
                    >
                        <ClearIcon style={{marginRight: "0.25rem", marginLeft: "-0.25rem"}}/>
                        Clear
                    </ActionButton>
                </Grid2>
            }
            {
                canEdit &&

                <Grid2>
                    <ActionButton
                        color="inherit"
                        size="medium"
                        variant="extended"
                        onClick={onRefresh}
                    >
                        <RefreshIcon style={{marginRight: "0.25rem", marginLeft: "-0.25rem"}}/>
                        Refresh
                    </ActionButton>
                </Grid2>
            }
            {
                !canEdit &&
                <Grid2>
                    <Typography variant="caption" color="textSecondary">
                        Editing virtual thresholds requires the robot to be docked
                    </Typography>
                </Grid2>
            }
        </Grid2>
    );
};

export default VirtualThresholdActions;
