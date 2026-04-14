import {Route} from "react-router";
import {Navigate, Routes} from "react-router-dom";
import MapManagement from "./MapManagement";
import {useCapabilitiesSupported} from "../CapabilitiesProvider";
import {Capability} from "../api";
import React from "react";
import RobotCoverageMapPage from "../map/RobotCoverageMapPage";
import MapEditorPage from "../map/MapEditorPage";

const OptionsRouter = (): React.ReactElement => {
    const [
        mapSegmentEditCapabilitySupported,
        mapSegmentRenameCapabilitySupported,
        mapSegmentCleanOrderCapabilitySupported,
        combinedVirtualRestrictionsCapabilitySupported,
        combinedVirtualThresholdsCapabilitySupported,
    ] = useCapabilitiesSupported(
        Capability.MapSegmentEdit,
        Capability.MapSegmentRename,
        Capability.MapSegmentCleanOrder,
        Capability.CombinedVirtualRestrictions,
        Capability.CombinedVirtualThresholds,
    );

    const mapEditorSupported =
        mapSegmentEditCapabilitySupported ||
        mapSegmentRenameCapabilitySupported ||
        mapSegmentCleanOrderCapabilitySupported ||
        combinedVirtualRestrictionsCapabilitySupported ||
        combinedVirtualThresholdsCapabilitySupported;

    return (
        <Routes>
            <Route path={""} element={<MapManagement />}/>

            {mapEditorSupported && (
                <Route path={"segments"} element={<MapEditorPage />}/>
            )}

            {/* Redirect old routes to the unified page */}
            <Route path={"segment_clean_order"} element={<Navigate to="../segments" replace />}/>
            <Route path={"virtual_restrictions"} element={<Navigate to="../segments" replace />}/>

            <Route path={"robot_coverage"} element={<RobotCoverageMapPage/>}/>

            <Route path="*" element={<Navigate to="/" />} />
        </Routes>
    );
};

export default OptionsRouter;
