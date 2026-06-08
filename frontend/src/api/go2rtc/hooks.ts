import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchStreams } from "./client";
import { subscribeToStreamerState, StreamerState } from "../client";

// Always prepend with go2rtc to avoid conflicts with Valetudo queries
enum QueryKey {
    Streams = "go2rtc_streams",
    StreamerState = "go2rtc_streamer_state",
}

export const useStreamerStateQuery = () => {
    const queryClient = useQueryClient();

    React.useEffect(() => {
        return subscribeToStreamerState((state) => {
            queryClient.setQueryData<StreamerState>([QueryKey.StreamerState], state);
        });
    }, [queryClient]);

    return useQuery<StreamerState>({
        queryKey: [QueryKey.StreamerState],
        queryFn: async () => ({running: false, managed: false}),
        staleTime: Infinity,
    });
};

export const useGo2RtcStreamsQuery = (streamerState: StreamerState | undefined) => {
    const managed = streamerState?.managed ?? false;
    const running = streamerState?.running ?? false;

    return useQuery({
        queryKey: [QueryKey.Streams],
        queryFn: fetchStreams,
        // When managed via SSE: only fetch while running; otherwise fall back to periodic polling
        enabled: managed ? running : true,
        refetchInterval: (query) => {
            if (managed) {
                // Stop polling once we have a stream key — SSE will re-enable when needed
                return Object.keys(query.state.data ?? {}).length > 0 ? false : 2000;
            }
            return 3000;
        },
        retry: false,
    });
};
