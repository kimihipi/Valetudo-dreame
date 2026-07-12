import {Box, Divider, Grid2, styled} from "@mui/material";
import ControlsBody from "./controls";
import {useIsMobileView} from "./hooks";
import {FullHeightGrid} from "./components/FullHeightGrid";
import LiveMapPage from "./map/LiveMapPage";
import React from "react";
import GlobalControlsBar, {GLOBAL_CONTROLS_BAR_HEIGHT} from "./components/GlobalControlsBar";

const ScrollableGrid = styled(Grid2)({
    overflow: "auto",
});

const ControlsSheetContainer = styled(Box)(({theme}) => {
    const color = theme.palette.mode === "light" ? "#ededed" : "#242424";
    return {
        backgroundColor: color,
        borderColor: color,
        borderTopWidth: "4px",
        borderLeftWidth: "1px",
        borderRightWidth: "1px",
        borderBottomWidth: "1px",
        borderStyle: "solid",
        borderTopLeftRadius: "4px",
        borderTopRightRadius: "4px",
        paddingTop: "0.125rem",
    };
});

const HomePage = (): React.ReactElement => {
    const mobileView = useIsMobileView();
    const [mobileControlsOpen, setMobileControlsOpen] = React.useState(false);

    if (mobileView) {
        return (
            <Box sx={{height: "100%", width: "100%", overflow: "hidden"}}>
                <Box sx={{height: `calc(100% - ${GLOBAL_CONTROLS_BAR_HEIGHT}px)`, display: mobileControlsOpen ? "none" : "inherit"}}>
                    <LiveMapPage/>
                </Box>
                <Box sx={{height: "5%", display: mobileControlsOpen ? "inherit" : "none"}}>
                    &nbsp;
                </Box>
                <Box sx={{height: "100%"}}>
                    <ControlsSheetContainer
                        sx={{
                            display: mobileControlsOpen ? "block" : "none",
                            height: `calc(95% - ${GLOBAL_CONTROLS_BAR_HEIGHT}px)`,
                        }}
                    >
                        <Box p={1} sx={{overflow: mobileControlsOpen ? "auto" : "hidden", height: "100%"}}>
                            <ControlsBody/>
                        </Box>
                    </ControlsSheetContainer>
                    <GlobalControlsBar onDrawerToggle={() => setMobileControlsOpen(!mobileControlsOpen)}/>
                </Box>
            </Box>
        );
    }

    return (
        <FullHeightGrid container direction="row" justifyContent="space-evenly">
            <Grid2 size="grow">
                <Box sx={{height: "100%", display: "flex", flexDirection: "column", overflow: "hidden"}}>
                    <Box sx={{flex: 1, minHeight: 0}}>
                        <LiveMapPage/>
                    </Box>
                    <GlobalControlsBar/>
                </Box>
            </Grid2>
            <Divider orientation="vertical"/>
            <ScrollableGrid size={{sm:4, md: 4, lg: 4, xl: 3}}>
                <Box m={1}>
                    <ControlsBody/>
                </Box>
            </ScrollableGrid>
        </FullHeightGrid>
    );
};

export default HomePage;
