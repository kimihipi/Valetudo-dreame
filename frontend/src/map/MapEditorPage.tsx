import React from "react";
import {SpeedDialAction} from "@mui/material";
import {
    Dashboard as SegmentIcon,
    EditNote as AnnotationsIcon,
    Texture as CarpetsIcon,
} from "@mui/icons-material";
import {VirtualRestrictionsIcon} from "../components/CustomIcons";
import {Capability} from "../api";
import {useCapabilitiesSupported} from "../CapabilitiesProvider";
import EditMapPage from "./EditMapPage";
import {NoTransition, StyledSpeedDial} from "./LiveMapModeSwitcher";

type ManagementMode = "segments" | "virtual_restrictions" | "annotations" | "carpets";

const modeIcon: Record<ManagementMode, React.ReactElement> = {
    "segments": <SegmentIcon/>,
    "virtual_restrictions": <VirtualRestrictionsIcon/>,
    "annotations": <AnnotationsIcon/>,
    "carpets": <CarpetsIcon/>,
};

const modeLabel: Record<ManagementMode, string> = {
    "segments": "Segments",
    "virtual_restrictions": "Restrictions",
    "annotations": "Annotations",
    "carpets": "Carpets",
};

interface ModeSwitcherProps {
    availableModes: ManagementMode[];
    currentMode: ManagementMode;
    setMode: (mode: ManagementMode) => void;
}

const ModeSwitcher = ({availableModes, currentMode, setMode}: ModeSwitcherProps): React.ReactElement => {
    const [open, setOpen] = React.useState(false);

    return (
        <StyledSpeedDial
            open={open}
            onClick={() => setOpen(!open)}
            icon={modeIcon[currentMode]}
            title="Editing Mode"
            FabProps={{size: "small"}}
            ariaLabel="Editing Mode"
            direction="down"
            slots={{ transition: NoTransition }}
        >
            {availableModes.map((mode) => (
                <SpeedDialAction
                    key={mode}
                    slotProps={{ tooltip: { open: true, title: modeLabel[mode] } }}
                    icon={modeIcon[mode]}
                    onClick={() => {
                        setMode(mode);
                        setOpen(false);
                    }}
                />
            ))}
        </StyledSpeedDial>
    );
};

const MapEditorPage = (): React.ReactElement => {
    const [
        mapSegmentEditCapabilitySupported,
        mapSegmentRenameCapabilitySupported,
        combinedVirtualRestrictionsCapabilitySupported,
        mapAnnotationsCapabilitySupported,
        carpetZonesCapabilitySupported,
    ] = useCapabilitiesSupported(
        Capability.MapSegmentEdit,
        Capability.MapSegmentRename,
        Capability.CombinedVirtualRestrictions,
        Capability.MapAnnotations,
        Capability.CarpetZones,
    );

    const segmentsSupported = mapSegmentEditCapabilitySupported || mapSegmentRenameCapabilitySupported;

    const availableModes = React.useMemo<ManagementMode[]>(() => {
        const modes: ManagementMode[] = [];
        if (segmentsSupported) {
            modes.push("segments");
        }
        if (combinedVirtualRestrictionsCapabilitySupported) {
            modes.push("virtual_restrictions");
        }
        if (mapAnnotationsCapabilitySupported) {
            modes.push("annotations");
        }
        if (carpetZonesCapabilitySupported) {
            modes.push("carpets");
        }
        return modes;
    }, [segmentsSupported, combinedVirtualRestrictionsCapabilitySupported, mapAnnotationsCapabilitySupported, carpetZonesCapabilitySupported]);

    const [mode, setMode] = React.useState<ManagementMode>(() => availableModes[0] ?? "segments");

    const effectiveMode: ManagementMode = availableModes.includes(mode) ? mode : (availableModes[0] ?? "segments");

    const modeSwitcher = availableModes.length > 1 ? (
        <ModeSwitcher
            availableModes={availableModes}
            currentMode={effectiveMode}
            setMode={setMode}
        />
    ) : null;

    return (
        <EditMapPage
            mode={effectiveMode}
            modeSwitcher={modeSwitcher}
        />
    );
};

export default MapEditorPage;
