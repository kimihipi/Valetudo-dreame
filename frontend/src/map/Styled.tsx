import {Box, ButtonBase, emphasize, Fab, styled} from "@mui/material";

export const ActionButton = styled(Fab)(({theme}) => {
    return {
        pointerEvents: "auto",
        backgroundColor: theme.palette.background.paper,
        border: `1px solid ${theme.palette.divider}`,
        "&:hover": {
            backgroundColor: emphasize(theme.palette.background.paper, 0.15),
        },
    };
});

export const MapOverlayTopLeft = styled(Box)(({theme}) => ({
    position: "absolute",
    pointerEvents: "none",
    top: theme.spacing(2),
    left: theme.spacing(2),
    display: "flex",
    flexDirection: "column",
    gap: theme.spacing(1),
}));

export const MapToolbarContainer = styled(Box)(({theme}) => ({
    position: "absolute",
    pointerEvents: "none",
    top: theme.spacing(2),
    right: theme.spacing(2),
    display: "flex",
    flexDirection: "row",
    gap: theme.spacing(1),
    alignItems: "flex-start",
}));

export const MapOverlayBottomLeft = styled(Box)(({theme}) => ({
    position: "absolute",
    pointerEvents: "none",
    bottom: theme.spacing(2),
    left: theme.spacing(2),
    display: "flex",
    flexDirection: "column",
    gap: theme.spacing(1),
}));

export const StatsOverlayButton = styled(ButtonBase)(({theme}) => {
    return {
        pointerEvents: "auto",
        backgroundColor: theme.palette.background.paper,
        border: `1px solid ${theme.palette.divider}`,
        boxShadow: theme.shadows[6],
        borderRadius: "999px",
        height: "40px",
        padding: "0 14px",
        display: "inline-flex",
        alignItems: "center",
        gap: "10px",
        "&:hover": {
            backgroundColor: emphasize(theme.palette.background.paper, 0.15),
        },
    };
});

export const ActionsContainer = styled(Box)(({theme}) => {
    return {
        position: "absolute",
        pointerEvents: "none",
        bottom: theme.spacing(2),
        left: theme.spacing(2),
        right: theme.spacing(2),
    };
});
