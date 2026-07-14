import {Capability, useMapSegmentationPropertiesQuery} from "../../../api";
import React from "react";
import {Box, Button, CircularProgress, Container, Grid2, Typography} from "@mui/material";
import {ActionButton} from "../../Styled";
import {IterationsIcon} from "../../../assets/icon_components/IterationsIcon";
import {
    Clear as ClearIcon,
} from "@mui/icons-material";

interface SegmentActionsProperties {
    segments: string[];
    iterationCount: number;

    onClear(): void;
    onIterationChange(iterations: number): void;
}

const SegmentActions = (
    props: SegmentActionsProperties
): React.ReactElement => {
    const {segments, iterationCount, onClear, onIterationChange} = props;


    const {
        data: mapSegmentationProperties,
        isPending: mapSegmentationPropertiesPending,
        isError: mapSegmentationPropertiesLoadError,
        refetch: refetchMapSegmentationProperties,
    } = useMapSegmentationPropertiesQuery();
    const didSelectSegments = segments.length > 0;

    const handleIterationToggle = React.useCallback(() => {
        if (mapSegmentationProperties) {
            onIterationChange(iterationCount % mapSegmentationProperties.iterationCount.max + 1);
        }
    }, [iterationCount, onIterationChange, mapSegmentationProperties]);

    if (mapSegmentationPropertiesLoadError) {
        return (
            <Container>
                <Typography color="error">
                    Error loading {Capability.MapSegmentation} properties
                </Typography>
                <Box m={1}/>
                <Button color="primary" variant="contained" onClick={() => {
                    return refetchMapSegmentationProperties();
                }}>
                    Retry
                </Button>
            </Container>
        );
    }

    if (mapSegmentationProperties === undefined && mapSegmentationPropertiesPending) {
        return (
            <Container>
                <CircularProgress/>
            </Container>
        );
    }

    if (mapSegmentationProperties === undefined) {
        return (
            <Container>
                <Typography align="center">
                    No {Capability.MapSegmentation} properties
                </Typography>
                ;
            </Container>
        );
    }



    return (
        <Grid2 container spacing={1} direction="row-reverse" flexWrap="wrap-reverse">
            {
                mapSegmentationProperties.iterationCount.max > 1 &&
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
            {
                didSelectSegments &&
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

export default SegmentActions;
