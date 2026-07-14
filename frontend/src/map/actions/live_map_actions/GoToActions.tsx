import React from "react";
import {Grid2} from "@mui/material";
import {ActionButton} from "../../Styled";
import GoToTargetClientStructure from "../../structures/client_structures/GoToTargetClientStructure";
import {
    Clear as ClearIcon
} from "@mui/icons-material";

interface GoToActionsProperties {
    goToTarget: GoToTargetClientStructure | undefined;

    onClear(): void;
}

const GoToActions = (
    props: GoToActionsProperties
): React.ReactElement => {
    const {goToTarget, onClear} = props;


    return (
        <Grid2 container spacing={1} direction="row-reverse" flexWrap="wrap-reverse">
            <Grid2>
                {
                    goToTarget &&
                        <ActionButton
                            color="inherit"
                            size="medium"
                            variant="extended"
                            onClick={onClear}
                        >
                            <ClearIcon style={{marginRight: "0.25rem", marginLeft: "-0.25rem"}}/>
                            Clear
                        </ActionButton>
                }
            </Grid2>
        </Grid2>
    );
};

export default GoToActions;
