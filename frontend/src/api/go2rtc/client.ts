import axios from "axios";
import {Go2RtcStreams} from "./types";

const go2RtcAPI = axios.create({
    baseURL: "./streamer/api/",
    timeout: 5_000,
});

export const fetchStreams = (): Promise<Go2RtcStreams> => {
    return go2RtcAPI.get<Go2RtcStreams>("/streams").then(({data}) => {
        if (Object.keys(data).length > 0) {
            // go2rtc is preferred when present. Stop any Duststreamer pipeline
            // that may still be running from before this probe completed.
            void axios.delete("/api/v2/robot/capabilities/DuststreamingCapability/stream")
                .catch(() => undefined);
        }

        return data;
    });
};
