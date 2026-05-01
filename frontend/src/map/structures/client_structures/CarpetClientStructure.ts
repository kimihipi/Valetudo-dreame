import BaseZoneClientStructure from "./BaseZoneClientStructure";

class CarpetClientStructure extends BaseZoneClientStructure {
    public static readonly TYPE = "CarpetClientStructure";

    protected activeStyle: { stroke: string, fill: string } = {
        stroke: "rgb(217, 119, 6)",
        fill: "rgba(217, 119, 6, 0)"
    };

    protected style: { stroke: string, fill: string } = {
        stroke: "rgb(217, 119, 6)",
        fill: "rgba(217, 119, 6, 0.4)"
    };
}

export default CarpetClientStructure;
