import {Route} from "react-router";
import {Navigate, Routes} from "react-router-dom";
import Settings from "./Settings";
import ValetudoOptions from "../options/ValetudoOptions";
import ConnectivityOptionsRouter from "../options/ConnectivityOptionsRouter";
import Log from "./Log";
import SystemInformation from "./SystemInformation";
import Timers from "./timers";
import React from "react";

const SettingsRouter = (): React.ReactElement => {
    return (
        <Routes>
            <Route path="" element={<Settings/>}/>
            <Route path="valetudo" element={<ValetudoOptions/>}/>
            <Route path="connectivity/*" element={<ConnectivityOptionsRouter/>}/>
            <Route path="log" element={<Log/>}/>
            <Route path="system_information" element={<SystemInformation/>}/>
            <Route path="timers" element={<Timers/>}/>

            <Route path="*" element={<Navigate to="/settings"/>}/>
        </Routes>
    );
};

export default SettingsRouter;
