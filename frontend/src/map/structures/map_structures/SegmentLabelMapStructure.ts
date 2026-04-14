import MapStructure from "./MapStructure";
import {Canvas2DContextTrackingWrapper} from "../../utils/Canvas2DContextTrackingWrapper";
import {considerHiDPI} from "../../utils/helpers";
import {RawMapLayerMaterial} from "../../../api";

class SegmentLabelMapStructure extends MapStructure {
    public static readonly TYPE = "SegmentLabelMapStructure";

    id: string;
    selected: boolean;
    topLabel: string | undefined;
    cleanOrderBadge: number | undefined;
    private area: number;
    public name: string | undefined;
    public material: RawMapLayerMaterial | undefined;
    public hidden: boolean;
    public showMetaInfo: boolean = false;


    constructor(
        x0 : number,
        y0 : number,
        id: string,
        selected: boolean,
        area: number,
        name: string | undefined,
        material: RawMapLayerMaterial | undefined,
        hidden: boolean = false
    ) {
        super(x0, y0);

        this.id = id;
        this.selected = selected;
        this.area = area;
        this.name = name;
        this.material = material;
        this.hidden = hidden;
    }

    draw(ctxWrapper: Canvas2DContextTrackingWrapper, transformationMatrixToScreenSpace: DOMMatrixInit, scaleFactor: number): void {
        const ctx = ctxWrapper.getContext();
        const p0 = new DOMPoint(this.x0, this.y0).matrixTransform(transformationMatrixToScreenSpace);

        if (this.hidden) {
            ctx.globalAlpha = 0.4;
        }

        // Draw clean-order badge at the centroid when an order number is assigned
        const orderText = this.topLabel ?? (this.cleanOrderBadge !== undefined ? String(this.cleanOrderBadge) : undefined);
        const badgeDiameter = 5 * scaleFactor;
        const badgeRadius = badgeDiameter / 2;

        const pillAnchorY = p0.y + badgeRadius + (0.75 * scaleFactor);

        ctxWrapper.save();

        ctx.beginPath();
        ctx.arc(p0.x, p0.y, badgeRadius, 0, Math.PI * 2);

        if (orderText !== undefined) {
            ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
            ctx.fill();

            ctx.fillStyle = "rgba(255, 255, 255, 1)";
            ctx.font = `bold ${badgeDiameter * 0.65}px system-ui, sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(orderText, p0.x, p0.y);
        } else {
            ctx.fillStyle = "rgba(128, 128, 128, 0.5)";
            ctx.fill();
        }

        ctxWrapper.restore();

        const baseFontSize = 2.75 * scaleFactor;
        const linesToDraw = [];

        if (this.name) {
            const maxNameLabelLength = Math.min(3 * scaleFactor, 48);
            const nameText = this.name.length > maxNameLabelLength ?
                `${this.name.substring(0, maxNameLabelLength - 3)}...` :
                this.name;

            linesToDraw.push({
                text: nameText,
                fontSize: baseFontSize,
            });
        }

        if (this.showMetaInfo && scaleFactor >= considerHiDPI(11)) {
            let metaString = (this.area / 10000).toPrecision(2) + " m²";
            metaString += ` (id=${this.id})`;

            linesToDraw.push({ text: metaString, fontSize: baseFontSize - 5 });
        }

        if (linesToDraw.length > 0) {
            ctxWrapper.save();
            this.drawPill(
                ctx,
                p0.x,
                pillAnchorY,
                linesToDraw,
                {baseline: "top"}
            );
            ctxWrapper.restore();
        }

        if (this.hidden) {
            ctx.globalAlpha = 1;
        }
    }

    onTap() {
        this.selected = !this.selected;
    }
}

export default SegmentLabelMapStructure;
