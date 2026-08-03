import {Grid2} from "@mui/material";
import {CRTCompositor, FetchSource, Player} from "jsmpeg";
import type {JSMpegOptions} from "jsmpeg";
import React from "react";
import {
    Capability,
    useDuststreamingConfigurationQuery,
    useDuststreamingPropertiesQuery,
    valetudoAPIBaseURL,
} from "../api";
import {useCapabilitiesSupported} from "../CapabilitiesProvider";

const STREAM_URL = `${valetudoAPIBaseURL}/robot/capabilities/${Capability.Duststreaming}/stream`;

const CameraStream = (props: { iframeStyle?: React.CSSProperties; setVisible?: (value: boolean) => void }): React.ReactElement => {
    const { iframeStyle, setVisible } = props;
    const canvasRef = React.useRef<HTMLCanvasElement>(null);
    const [duststreamingSupported] = useCapabilitiesSupported(Capability.Duststreaming);
    const {data: configuration} = useDuststreamingConfigurationQuery({
        enabled: duststreamingSupported,
    });
    const {data: properties} = useDuststreamingPropertiesQuery({
        enabled: duststreamingSupported,
    });

    const visible = duststreamingSupported &&
        configuration?.enabled === true &&
        properties?.duststreamerInstalled === true;

    React.useEffect(() => {
        setVisible?.(visible);
    }, [setVisible, visible]);

    React.useEffect(() => {
        if (!visible || !properties || !canvasRef.current) {
            return;
        }

        const options: JSMpegOptions = {
            source: FetchSource,
            canvas: canvasRef.current,
            autoplay: true,
            reconnectInterval: 3,
            decodeFirstFrame: false,
            videoWidth: properties.width,
            videoHeight: properties.height,
            createRenderer: (rendererOptions) => new CRTCompositor(rendererOptions, {label: "VALETUDO+"}),
        };
        const player = new Player(STREAM_URL, options);

        return () => {
            try {
                player.destroy();
            } catch (e) {
                // intentional
            }
        };
    }, [properties, visible]);

    if (!visible || !properties) {
        return <></>;
    }

    return (
        <Grid2
            display="flex"
            sx={{minHeight: 0, flex: 1, bgcolor: "#000"}}
            style={iframeStyle}
        >
            <canvas
                ref={canvasRef}
                width={properties.width}
                height={properties.height}
                style={{width: "100%", height: "100%", objectFit: "contain", display: "block"}}
            />
        </Grid2>
    );
};

export default CameraStream;
