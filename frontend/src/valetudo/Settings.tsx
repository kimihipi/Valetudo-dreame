import React from "react";
import {
    Hub as ConnectivityIcon,
    Article as LogIcon,
    Wysiwyg as SystemInformationIcon,
    AccessTime as TimersIcon,
    Settings as ValetudoIcon,
} from "@mui/icons-material";
import {ListMenu} from "../components/list_menu/ListMenu";
import {LinkListMenuItem} from "../components/list_menu/LinkListMenuItem";
import {SpacerListMenuItem} from "../components/list_menu/SpacerListMenuItem";
import {SubHeaderListMenuItem} from "../components/list_menu/SubHeaderListMenuItem";
import PaperContainer from "../components/PaperContainer";

const Settings = (): React.ReactElement => {
    const listItems = React.useMemo(() => {
        const items = [
            <SubHeaderListMenuItem
                key="settings_header"
                primaryLabel="Settings"
                icon={undefined}
            />,
            <LinkListMenuItem
                key="valetudo"
                url="/settings/valetudo"
                primaryLabel="Valetudo"
                secondaryLabel="App configuration and updates"
                icon={<ValetudoIcon/>}
            />,
            <LinkListMenuItem
                key="connectivity"
                url="/settings/connectivity"
                primaryLabel="Connectivity"
                secondaryLabel="Network interfaces and authentication"
                icon={<ConnectivityIcon/>}
            />,
            <LinkListMenuItem
                key="timers"
                url="/settings/timers"
                primaryLabel="Timers"
                secondaryLabel="Scheduled cleaning tasks"
                icon={<TimersIcon/>}
            />,
            <SpacerListMenuItem key={"spacer1"}/>,
            <SubHeaderListMenuItem
                key="diagnostics_header"
                primaryLabel="Diagnostics"
                icon={undefined}
            />,
            <LinkListMenuItem
                key="log"
                url="/settings/log"
                primaryLabel="System Log"
                secondaryLabel="System logs and diagnostics"
                icon={<LogIcon/>}
            />,
            <LinkListMenuItem
                key="system_information"
                url="/settings/system_information"
                primaryLabel="System Information"
                secondaryLabel="Host and runtime information"
                icon={<SystemInformationIcon/>}
            />,
        ];

        return items;
    }, []);

    return (
        <PaperContainer>
            <ListMenu
                primaryHeader=""
                secondaryHeader=""
                listItems={listItems}
            />
        </PaperContainer>
    );
};

export default Settings;
