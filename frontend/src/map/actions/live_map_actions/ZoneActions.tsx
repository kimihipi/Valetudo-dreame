import {
    Capability,
    useZonePropertiesQuery,
} from "../../../api";
import React from "react";
import {Box, Button, CircularProgress, Container, Grid2, Typography} from "@mui/material";
import {ActionButton} from "../../Styled";
import ZoneClientStructure from "../../structures/client_structures/ZoneClientStructure";
import {IterationsIcon} from "../../../assets/icon_components/IterationsIcon";
import {
    Clear as ClearIcon,
    Add as AddIcon
} from "@mui/icons-material";

interface ZoneActionsProperties {
    zones: ZoneClientStructure[];
    iterationCount: number;

    onClear(): void;

    onAdd(): void;

    onIterationChange(iterations: number): void;
}

const ZoneActions = (
    props: ZoneActionsProperties
): React.ReactElement => {
    const {zones, iterationCount, onClear, onAdd, onIterationChange} = props;
    const {
        data: zoneProperties,
        isPending: zonePropertiesPending,
        isError: zonePropertiesLoadError,
        refetch: refetchZoneProperties,
    } = useZonePropertiesQuery();

    const didSelectZones = zones.length > 0;

    const handleIterationToggle = React.useCallback(() => {
        if (zoneProperties) {
            onIterationChange(iterationCount % zoneProperties.iterationCount.max + 1);
        }
    }, [iterationCount, onIterationChange, zoneProperties]);

    if (zonePropertiesLoadError) {
        return (
            <Container>
                <Typography color="error">
                    Error loading {Capability.ZoneCleaning} properties
                </Typography>
                <Box m={1}/>
                <Button color="primary" variant="contained" onClick={() => {
                    return refetchZoneProperties();
                }}>
                    Retry
                </Button>
            </Container>
        );
    }

    if (zoneProperties === undefined && zonePropertiesPending) {
        return (
            <Container>
                <CircularProgress/>
            </Container>
        );
    }

    if (zoneProperties === undefined) {
        return (
            <Container>
                <Typography align="center">
                    No {Capability.ZoneCleaning} properties
                </Typography>
                ;
            </Container>
        );
    }

    return (
        <Grid2 container spacing={1} direction="row-reverse" flexWrap="wrap-reverse">
            {
                zoneProperties.iterationCount.max > 1 &&
                    <Grid2>
                        <ActionButton
                            color="inherit"
                            size="medium"
                            variant="extended"
                            style={{
                                textTransform: "initial"
                            }}
                            onClick={handleIterationToggle}
                            title="Iteration Count"
                        >
                            <IterationsIcon iterationCount={iterationCount}/>
                        </ActionButton>
                    </Grid2>
            }
            <Grid2>
                <ActionButton
                    disabled={zones.length === zoneProperties.zoneCount.max}
                    color="inherit"
                    size="medium"
                    variant="extended"
                    onClick={onAdd}
                >
                    <AddIcon style={{marginRight: "0.25rem", marginLeft: "-0.25rem"}}/>
                        Add ({zones.length}/{zoneProperties.zoneCount.max})
                </ActionButton>
            </Grid2>
            {
                didSelectZones &&
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
        </Grid2>
    );
};

export default ZoneActions;
