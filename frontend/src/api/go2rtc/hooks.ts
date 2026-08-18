import {keepPreviousData, useQuery} from "@tanstack/react-query";
import {fetchStreams} from "./client";

export const useGo2RtcStreamsQuery = () => {
    return useQuery({
        queryKey: ["go2rtc_streams"],
        queryFn: fetchStreams,
        refetchInterval: 7_000,
        retry: false,
        placeholderData: keepPreviousData,
    });
};
