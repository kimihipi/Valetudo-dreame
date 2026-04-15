import {
    AppBar,
    Box,
    Divider,
    Drawer,
    IconButton,
    List,
    ListItem,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    ListSubheader,
    PaletteMode,
    Switch,
    Toolbar,
    Typography
} from "@mui/material";
import React from "react";
import {
    DarkMode as DarkModeIcon,
    Map as MapManagementIcon,
    Home as HomeIcon,
    Menu as MenuIcon,
    ArrowBack as BackIcon,
    Favorite as DonateIcon,
    Settings as SettingsIcon,
    SvgIconComponent
} from "@mui/icons-material";
import {Link, useLocation} from "react-router-dom";
import ValetudoEvents from "./ValetudoEvents";
import {Capability, useValetudoCustomizationsQuery} from "../api";
import {useCapabilitiesSupported} from "../CapabilitiesProvider";

interface MenuEntry {
    kind: "MenuEntry";
    route: string;
    title: string;
    menuIcon: SvgIconComponent;
    menuText: string;
    requiredCapabilities?: {
        capabilities: Capability[];
        type: "allof" | "anyof"
    };
}

interface MenuSubEntry {
    kind: "MenuSubEntry",
    route: string,
    title: string,
    parentRoute: string
}

interface MenuSubheader {
    kind: "Subheader";
    title: string;
    requiredCapabilities?: {
        capabilities: Capability[];
        type: "allof" | "anyof"
    };
}



//Note that order is important here
const menuTree: Array<MenuEntry | MenuSubEntry | MenuSubheader> = [
    {
        kind: "MenuEntry",
        route: "/",
        title: "Home",
        menuIcon: HomeIcon,
        menuText: "Home"
    },

    {
        kind: "MenuEntry",
        route: "/settings",
        title: "Settings",
        menuIcon: SettingsIcon,
        menuText: "Settings"
    },

    {
        kind: "Subheader",
        title: "Options"
    },
    {
        kind: "MenuEntry",
        route: "/options/map_management",
        title: "Map Options",
        menuIcon: MapManagementIcon,
        menuText: "Map",
        requiredCapabilities: {
            capabilities: [
                Capability.PersistentMapControl,
                Capability.MappingPass,
                Capability.MapReset,

                Capability.MapSegmentEdit,
                Capability.MapSegmentRename,

                Capability.CombinedVirtualRestrictions
            ],
            type: "anyof"
        }
    },
    {
        kind: "MenuSubEntry",
        route: "/options/map_management/segments",
        title: "Map Editor",
        parentRoute: "/options/map_management"
    },
    {
        kind: "MenuSubEntry",
        route: "/options/map_management/robot_coverage",
        title: "Robot Coverage Map",
        parentRoute: "/options/map_management"
    },
    {
        kind: "MenuSubEntry",
        route: "/settings/valetudo",
        title: "Valetudo",
        parentRoute: "/settings"
    },
    {
        kind: "MenuSubEntry",
        route: "/settings/connectivity",
        title: "Connectivity",
        parentRoute: "/settings"
    },
    {
        kind: "MenuSubEntry",
        route: "/settings/connectivity/auth",
        title: "Auth Settings",
        parentRoute: "/settings/connectivity"
    },
    {
        kind: "MenuSubEntry",
        route: "/settings/connectivity/mqtt",
        title: "MQTT Connectivity",
        parentRoute: "/settings/connectivity"
    },
    {
        kind: "MenuSubEntry",
        route: "/settings/connectivity/networkadvertisement",
        title: "Network Advertisement",
        parentRoute: "/settings/connectivity"
    },
    {
        kind: "MenuSubEntry",
        route: "/settings/connectivity/ntp",
        title: "NTP Connectivity",
        parentRoute: "/settings/connectivity"
    },
    {
        kind: "MenuSubEntry",
        route: "/settings/connectivity/wifi",
        title: "Wi-Fi Connectivity",
        parentRoute: "/settings/connectivity"
    },
    {
        kind: "MenuSubEntry",
        route: "/settings/log",
        title: "Log",
        parentRoute: "/settings"
    },
    {
        kind: "MenuSubEntry",
        route: "/settings/system_information",
        title: "System Information",
        parentRoute: "/settings"
    },
    {
        kind: "MenuSubEntry",
        route: "/settings/timers",
        title: "Timers",
        parentRoute: "/settings"
    },
];

const ValetudoAppBar: React.FunctionComponent<{ paletteMode: PaletteMode, setPaletteMode: (newMode: PaletteMode) => void }> = ({
    paletteMode,
    setPaletteMode
}): React.ReactElement => {
    const [drawerOpen, setDrawerOpen] = React.useState<boolean>(false);
    const currentLocation = useLocation()?.pathname;
    const robotCapabilities = useCapabilitiesSupported(...Object.values(Capability));
    const {data: customizations} = useValetudoCustomizationsQuery();

    //@ts-ignore
    const currentMenuEntry = menuTree.find(element => element.route === currentLocation) ?? menuTree[0];

    const pageTitle = React.useMemo(() => {
        let ret = "";

        menuTree.forEach((element) => {
            //@ts-ignore
            if (currentLocation.includes(element.route) && element.route !== "/" && element.title) {
                if (ret !== "") {
                    ret += " - ";
                }

                ret += element.title;
            }
        });

        if (ret !== "") {
            document.title = `Valetudo+ - ${ret}`;
        } else {
            // On home page - use friendly name if available, otherwise just "Valetudo"
            document.title = customizations?.friendlyName || "Valetudo";
        }

        if (currentMenuEntry.kind !== "Subheader" && currentMenuEntry.route === "/" && customizations?.friendlyName) {
            return customizations.friendlyName;
        }

        return currentMenuEntry.title;
    }, [currentLocation, currentMenuEntry, customizations]);

    const drawerContent = React.useMemo(() => {
        return (
            <Box
                sx={{width: 250}}
                role="presentation"
                onClick={() => {
                    setDrawerOpen(false);
                }}
                onKeyDown={() => {
                    setDrawerOpen(false);
                }}
                style={{
                    scrollbarWidth: "thin",
                    overflowX: "hidden"
                }}
            >
                <List>
                    {menuTree.filter(item => {
                        return item.kind !== "MenuSubEntry";
                    }).map((value, idx) => {
                        switch (value.kind) {
                            case "Subheader":
                                if (value.requiredCapabilities) {
                                    switch (value.requiredCapabilities.type) {
                                        case "allof": {
                                            if (!value.requiredCapabilities.capabilities.every(capability => {
                                                const idx = Object.values(Capability).indexOf(capability);
                                                return robotCapabilities[idx];
                                            })) {
                                                return null;
                                            }

                                            break;
                                        }
                                        case "anyof": {
                                            if (!value.requiredCapabilities.capabilities.some(capability => {
                                                const idx = Object.values(Capability).indexOf(capability);
                                                return robotCapabilities[idx];
                                            })) {
                                                return null;
                                            }

                                            break;
                                        }
                                    }
                                }

                                return (
                                    <ListSubheader
                                        key={`${idx}`}
                                        sx={{
                                            background: "transparent",
                                            userSelect: "none"
                                        }}
                                        disableSticky={true}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        {value.title}
                                    </ListSubheader>
                                );

                            case "MenuEntry": {
                                if (value.requiredCapabilities) {
                                    switch (value.requiredCapabilities.type) {
                                        case "allof": {
                                            if (!value.requiredCapabilities.capabilities.every(capability => {
                                                const idx = Object.values(Capability).indexOf(capability);
                                                return robotCapabilities[idx];
                                            })) {
                                                return null;
                                            }

                                            break;
                                        }
                                        case "anyof": {
                                            if (!value.requiredCapabilities.capabilities.some(capability => {
                                                const idx = Object.values(Capability).indexOf(capability);
                                                return robotCapabilities[idx];
                                            })) {
                                                return null;
                                            }

                                            break;
                                        }
                                    }
                                }

                                const ItemIcon = value.menuIcon;

                                return (
                                    <ListItemButton
                                        key={value.route}
                                        selected={value.route === currentLocation}
                                        component={Link}
                                        to={value.route}
                                    >
                                        <ListItemIcon>
                                            <ItemIcon/>
                                        </ListItemIcon>
                                        <ListItemText primary={value.menuText}/>
                                    </ListItemButton>
                                );
                            }
                        }
                    })}

                    <Divider/>
                    <ListItem
                        onClick={(e) => e.stopPropagation()}
                        sx={{
                            userSelect: "none"
                        }}
                    >
                        <ListItemIcon>
                            <DarkModeIcon/>
                        </ListItemIcon>
                        <ListItemText primary="Dark mode"/>
                        <Switch
                            edge="end"
                            onChange={(e) => {
                                setPaletteMode(e.target.checked ? "dark" : "light");
                            }}
                            checked={paletteMode === "dark"}
                        />
                    </ListItem>


                    <ListSubheader
                        sx={{
                            background: "transparent",
                            userSelect: "none"
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        Links
                    </ListSubheader>
                    <ListItemButton
                        component="a"
                        href="https://github.com/sponsors/Hypfer"
                        target="_blank"
                        rel="noopener"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <ListItemIcon>
                            <DonateIcon/>
                        </ListItemIcon>
                        <ListItemText primary="Donate to Upstream"/>
                    </ListItemButton>


                </List>
            </Box>
        );
    }, [currentLocation, paletteMode, setPaletteMode, robotCapabilities]);

    const toolbarContent = React.useMemo(() => {
        switch (currentMenuEntry.kind) {
            case "MenuEntry":
                // Show back button for settings page, hamburger for others
                if (currentMenuEntry.route === "/settings") {
                    return (
                        <>
                            <IconButton
                                size="large"
                                edge="start"
                                color="inherit"
                                aria-label="back"
                                sx={{mr: 2}}
                                component={Link}
                                to="/"
                            >
                                <BackIcon/>
                            </IconButton>
                            <Typography variant="h6" component="div" sx={{flexGrow: 1}}>
                                {pageTitle}
                            </Typography>
                        </>
                    );
                }
                return (
                    <>
                        <IconButton
                            size="large"
                            edge="start"
                            color="inherit"
                            aria-label="menu"
                            sx={{mr: 2}}
                            onClick={() => {
                                setDrawerOpen(true);
                            }}
                            title="Menu"
                        >
                            <MenuIcon/>
                        </IconButton>
                        <Typography variant="h6" component="div" sx={{flexGrow: 1}}>
                            {pageTitle}
                        </Typography>
                    </>
                );
            case "MenuSubEntry":
                return (
                    <>
                        <IconButton
                            size="large"
                            edge="start"
                            color="inherit"
                            aria-label="back"
                            sx={{mr: 2}}

                            component={Link}
                            to={currentMenuEntry.parentRoute}
                        >
                            <BackIcon/>
                        </IconButton>
                        <Typography variant="h6" component="div" sx={{flexGrow: 1}}>
                            {pageTitle}
                        </Typography>
                    </>
                );
            case "Subheader":
                //This can never happen
                return (<></>);
        }
    }, [currentMenuEntry, setDrawerOpen, pageTitle]);

    return (
        <Box
            sx={{
                userSelect: "none"
            }}
        >
            <AppBar position="fixed">
                <Toolbar>
                    {toolbarContent}
                    <div>
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
            {
                currentMenuEntry.kind !== "MenuSubEntry" &&
                <Drawer
                    anchor={"left"}
                    open={drawerOpen}
                    onClose={() => {
                        setDrawerOpen(false);
                    }}
                >
                    {drawerContent}
                </Drawer>
            }
        </Box>
    );
};

export default ValetudoAppBar;
