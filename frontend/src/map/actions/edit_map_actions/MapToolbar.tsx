import React from "react";
import {ActionButton} from "../../Styled";
import {
    Help as HelpIcon
} from "@mui/icons-material";

const MapToolbar: React.FunctionComponent<{
    setHelpDialogOpen: (open: boolean) => void,
}> = ({setHelpDialogOpen}): React.ReactElement => {
    return (
        <ActionButton
            color="inherit"
            size="small"
            onClick={() => {
                setHelpDialogOpen(true);
            }}
            title="Help"
        >
            <HelpIcon/>
        </ActionButton>
    );
};

export default MapToolbar;
