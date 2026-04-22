import {
    AppBar,
    Box,
    IconButton,
    PaletteMode,
    Toolbar,
    Typography
} from "@mui/material";
import React from "react";
import {
    DarkMode as DarkModeIcon,
    LightMode as LightModeIcon,
    ArrowBack as BackIcon,
    Settings as SettingsIcon,
} from "@mui/icons-material";
import {Link, useLocation} from "react-router-dom";
import ValetudoEvents from "./ValetudoEvents";
import {useValetudoCustomizationsQuery} from "../api";

interface RouteInfo {
    title: string;
    parentRoute?: string;
}

const routeMap: Record<string, RouteInfo> = {
    "/settings": {title: "Settings"},
    "/settings/valetudo": {title: "Valetudo", parentRoute: "/settings"},
    "/settings/connectivity": {title: "Connectivity", parentRoute: "/settings"},
    "/settings/connectivity/auth": {title: "Auth Settings", parentRoute: "/settings/connectivity"},
    "/settings/connectivity/mqtt": {title: "MQTT Connectivity", parentRoute: "/settings/connectivity"},
    "/settings/connectivity/networkadvertisement": {title: "Network Advertisement", parentRoute: "/settings/connectivity"},
    "/settings/connectivity/ntp": {title: "NTP Connectivity", parentRoute: "/settings/connectivity"},
    "/settings/connectivity/wifi": {title: "Wi-Fi Connectivity", parentRoute: "/settings/connectivity"},
    "/settings/log": {title: "Log", parentRoute: "/settings"},
    "/settings/system_information": {title: "System Information", parentRoute: "/settings"},
    "/settings/timers": {title: "Timers", parentRoute: "/settings"},
};

const ValetudoAppBar: React.FunctionComponent<{paletteMode: PaletteMode; setPaletteMode: (newMode: PaletteMode) => void}> = ({
    paletteMode,
    setPaletteMode,
}): React.ReactElement => {
    const currentLocation = useLocation()?.pathname;
    const {data: customizations} = useValetudoCustomizationsQuery();

    const currentRoute = routeMap[currentLocation];

    const pageTitle = React.useMemo(() => {
        const breadcrumb = Object.entries(routeMap)
            .filter(([route]) => currentLocation.includes(route))
            .sort((a, b) => a[0].length - b[0].length)
            .map(([, info]) => info.title)
            .join(" - ");

        if (breadcrumb !== "") {
            document.title = `Valetudo+ - ${breadcrumb}`;
        } else {
            document.title = customizations?.friendlyName || "Valetudo";
        }

        if (!currentRoute) {
            return customizations?.friendlyName || "Home";
        }

        return currentRoute.title;
    }, [currentLocation, currentRoute, customizations]);

    return (
        <Box sx={{userSelect: "none"}}>
            <AppBar position="fixed">
                <Toolbar>
                    {currentRoute && (
                        <IconButton
                            size="large"
                            edge="start"
                            color="inherit"
                            aria-label="back"
                            sx={{mr: 2}}
                            component={Link}
                            to={currentRoute.parentRoute ?? "/"}
                        >
                            <BackIcon/>
                        </IconButton>
                    )}
                    <Typography variant="h6" component="div" sx={{flexGrow: 1}}>
                        {pageTitle}
                    </Typography>
                    <div>
                        <IconButton
                            size="large"
                            color="inherit"
                            title={paletteMode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                            onClick={() => {
                                setPaletteMode(paletteMode === "dark" ? "light" : "dark");
                            }}
                        >
                            {paletteMode === "dark" ? <LightModeIcon/> : <DarkModeIcon/>}
                        </IconButton>
                        <IconButton
                            size="large"
                            color="inherit"
                            title="Settings"
                            component={Link}
                            to="/settings"
                        >
                            <SettingsIcon/>
                        </IconButton>
                        <ValetudoEvents/>
                    </div>
                </Toolbar>
            </AppBar>
            <Toolbar/>
        </Box>
    );
};

export default ValetudoAppBar;
