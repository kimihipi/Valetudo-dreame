import React from "react";
import {Box, styled} from "@mui/material";
import {ActionButton} from "../../Styled";
import {
    Help as HelpIcon
} from "@mui/icons-material";

export const HelpButtonContainer = styled(Box)(({theme}) => {
    return {
        position: "absolute",
        pointerEvents: "none",
        top: theme.spacing(2),
        right: theme.spacing(2),
        display: "flex",
        flexDirection: "row",
        gap: theme.spacing(1),
        alignItems: "center",
    };
});

export type mode = "segments" | "virtual_restrictions";

const ModeSwitchAction: React.FunctionComponent<{
    setHelpDialogOpen: (open: boolean) => void,
    modeSwitcher?: React.ReactNode,
}> = (
    {
        setHelpDialogOpen,
        modeSwitcher,
    }
): React.ReactElement => {
    return (
        <HelpButtonContainer>
            {modeSwitcher}
            <ActionButton
                color="inherit"
                size="medium"
                variant="extended"
                onClick={() => {
                    setHelpDialogOpen(true);
                }}
                title="Help"
            >
                <HelpIcon/>
            </ActionButton>
        </HelpButtonContainer>
    );
};

export default ModeSwitchAction;
