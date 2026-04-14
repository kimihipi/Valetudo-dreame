import {
    StatusState,
    useCurtainsMutation,
} from "../../../api";
import React from "react";
import {Grid2, Typography} from "@mui/material";
import {ActionButton} from "../../Styled";
import CurtainClientStructure from "../../structures/client_structures/CurtainClientStructure";
import {PointCoordinates} from "../../utils/types";
import {
    Save as SaveIcon,
    Refresh as RefreshIcon,
    Clear as ClearIcon,
    Add as AddIcon,
} from "@mui/icons-material";
import {CircularProgress} from "@mui/material";

interface CurtainActionsProperties {
    robotStatus: StatusState,
    curtains: Array<CurtainClientStructure>,

    convertPixelCoordinatesToCMSpace(coordinates: PointCoordinates): PointCoordinates

    onAddCurtain(): void,

    onSave(): void;
    onRefresh(): void;
    onClear(): void;
    onRequestDraw(): void;
}

const CurtainActions = (
    props: CurtainActionsProperties
): React.ReactElement => {
    const {
        curtains,
        convertPixelCoordinatesToCMSpace,
        onAddCurtain,
        onSave,
        onRefresh,
        onClear,
    } = props;

    const {
        mutate: saveCurtains,
        isPending: curtainsSaving
    } = useCurtainsMutation({
        onSuccess: onSave,
    });

    const canEdit = props.robotStatus.value === "docked";

    const handleSaveClick = React.useCallback(() => {
        if (!canEdit) {
            return;
        }

        saveCurtains({
            curtains: curtains.map(c => ({
                points: {
                    pA: convertPixelCoordinatesToCMSpace({x: c.x0, y: c.y0}),
                    pB: convertPixelCoordinatesToCMSpace({x: c.x1, y: c.y1})
                }
            }))
        });
    }, [canEdit, saveCurtains, curtains, convertPixelCoordinatesToCMSpace]);

    return (
        <Grid2 container spacing={1} direction="row-reverse" flexWrap="wrap-reverse">
            {
                canEdit &&

                <Grid2>
                    <ActionButton
                        disabled={curtainsSaving}
                        color="inherit"
                        size="medium"
                        variant="extended"
                        onClick={handleSaveClick}
                    >
                        <SaveIcon style={{marginRight: "0.25rem", marginLeft: "-0.25rem"}}/>
                        Save
                        {curtainsSaving && (
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
                        onClick={onAddCurtain}
                    >
                        <AddIcon style={{marginRight: "0.25rem", marginLeft: "-0.25rem"}}/>
                        Curtain ({curtains.length})
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
                        disabled={curtains.length === 0}
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
                        Editing curtains requires the robot to be docked
                    </Typography>
                </Grid2>
            }
        </Grid2>
    );
};

export default CurtainActions;
