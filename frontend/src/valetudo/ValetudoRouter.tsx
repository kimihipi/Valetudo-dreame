import {Route, } from "react-router";
import {Navigate, Routes} from "react-router-dom";
import SystemInformation from "./SystemInformation";
import Timers from "./timers";
import Log from "./Log";
import React from "react";

const ValetudoRouter = (): React.ReactElement => {
    return (
        <Routes>
            <Route path={"system_information"} element={<SystemInformation/>}/>
            <Route path={"log"} element={<Log/>}/>
            <Route path={"timers"} element={<Timers/>}/>

            <Route path="*" element={<Navigate to="/" />} />
        </Routes>
    );
};

export default ValetudoRouter;
