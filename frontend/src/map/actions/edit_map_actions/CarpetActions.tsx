import {
    StatusState,
    useCarpetZonesMutation,
} from "../../../api";
import React from "react";
import {Grid2, Typography} from "@mui/material";
import {ActionButton} from "../../Styled";
import CarpetClientStructure from "../../structures/client_structures/CarpetClientStructure";
import {PointCoordinates} from "../../utils/types";
import {
    Save as SaveIcon,
    Refresh as RefreshIcon,
    Clear as ClearIcon,
    Add as AddIcon,
} from "@mui/icons-material";
import {CircularProgress} from "@mui/material";

interface CarpetActionsProperties {
    robotStatus: StatusState,
    carpets: Array<CarpetClientStructure>,

    convertPixelCoordinatesToCMSpace(coordinates: PointCoordinates): PointCoordinates

    onAddCarpet(): void,

    onSave(): void;
    onRefresh(): void;
    onClear(): void;
    onRequestDraw(): void;
}

const CarpetActions = (
    props: CarpetActionsProperties
): React.ReactElement => {
    const {
        carpets,
        convertPixelCoordinatesToCMSpace,
        onAddCarpet,
        onSave,
        onRefresh,
        onClear,
    } = props;

    const {
        mutate: saveCarpetZones,
        isPending: carpetZonesSaving
    } = useCarpetZonesMutation({
        onSuccess: onSave,
    });

    const canEdit = props.robotStatus.value === "docked";

    const handleSaveClick = React.useCallback(() => {
        if (!canEdit) {
            return;
        }

        saveCarpetZones({
            zones: carpets.map(c => ({
                points: {
                    pA: convertPixelCoordinatesToCMSpace({x: c.x0, y: c.y0}),
                    pB: convertPixelCoordinatesToCMSpace({x: c.x1, y: c.y1}),
                    pC: convertPixelCoordinatesToCMSpace({x: c.x2, y: c.y2}),
                    pD: convertPixelCoordinatesToCMSpace({x: c.x3, y: c.y3})
                }
            }))
        });
    }, [canEdit, saveCarpetZones, carpets, convertPixelCoordinatesToCMSpace]);

    return (
        <Grid2 container spacing={1} direction="row-reverse" flexWrap="wrap-reverse">
            {
                canEdit &&

                <Grid2>
                    <ActionButton
                        disabled={carpetZonesSaving}
                        color="inherit"
                        size="medium"
                        variant="extended"
                        onClick={handleSaveClick}
                    >
                        <SaveIcon style={{marginRight: "0.25rem", marginLeft: "-0.25rem"}}/>
                        Save
                        {carpetZonesSaving && (
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
                        onClick={onAddCarpet}
                    >
                        <AddIcon style={{marginRight: "0.25rem", marginLeft: "-0.25rem"}}/>
                        Carpet ({carpets.length})
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
                        disabled={carpets.length === 0}
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
                        Editing carpet zones requires the robot to be docked
                    </Typography>
                </Grid2>
            }
        </Grid2>
    );
};

export default CarpetActions;
