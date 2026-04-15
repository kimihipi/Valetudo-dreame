import {Route} from "react-router";
import {Navigate, Routes} from "react-router-dom";
import React from "react";
import MapManagementOptionsRouter from "./MapManagementOptionsRouter";

const OptionsRouter = (): React.ReactElement => {

    return (
        <Routes>
            <Route path={"map_management/*"} element={<MapManagementOptionsRouter />} />

            <Route path="*" element={<Navigate to="/" />} />
        </Routes>
    );
};

export default OptionsRouter;
