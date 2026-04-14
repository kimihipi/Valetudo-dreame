import MapStructure from "./MapStructure";
import {Canvas2DContextTrackingWrapper} from "../../utils/Canvas2DContextTrackingWrapper";
import {considerHiDPI} from "../../utils/helpers";


class PassableThresholdMapStructure extends MapStructure {
    public static readonly TYPE = "PassableThresholdMapStructure";

    private x1: number;
    private y1: number;

    constructor(
        x0: number, y0: number,
        x1: number, y1: number
    ) {
        super(x0, y0);

        this.x1 = x1;
        this.y1 = y1;
    }

    draw(ctxWrapper: Canvas2DContextTrackingWrapper, transformationMatrixToScreenSpace: DOMMatrixInit, scaleFactor: number): void {
        const ctx = ctxWrapper.getContext();
        const p0 = new DOMPoint(this.x0, this.y0).matrixTransform(transformationMatrixToScreenSpace);
        const p1 = new DOMPoint(this.x1, this.y1).matrixTransform(transformationMatrixToScreenSpace);

        const dx = p1.x - p0.x;
        const dy = p1.y - p0.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len === 0) {return;}

        const ux = dx / len;
        const uy = dy / len;
        const px = -uy;
        const py = ux;
        const halfThick = scaleFactor * 1;

        const r = [
            {x: p0.x + px * halfThick, y: p0.y + py * halfThick},
            {x: p1.x + px * halfThick, y: p1.y + py * halfThick},
            {x: p1.x - px * halfThick, y: p1.y - py * halfThick},
            {x: p0.x - px * halfThick, y: p0.y - py * halfThick},
        ];
        const traceRect = () => {
            ctx.beginPath();
            ctx.moveTo(r[0].x, r[0].y);
            ctx.lineTo(r[1].x, r[1].y);
            ctx.lineTo(r[2].x, r[2].y);
            ctx.lineTo(r[3].x, r[3].y);
            ctx.closePath();
        };

        ctxWrapper.save();

        // Shadow outline
        ctx.save();
        ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
        ctx.lineWidth = considerHiDPI(2) + considerHiDPI(2);
        ctx.lineCap = "square";
        traceRect();
        ctx.stroke();
        ctx.restore();

        // Semi-transparent fill
        ctx.fillStyle = "rgba(122, 192, 55, 0.15)";
        traceRect();
        ctx.fill();

        // Border
        ctx.strokeStyle = "rgb(122, 192, 55, 0.75)";
        ctx.lineWidth = considerHiDPI(2);
        ctx.lineCap = "square";
        traceRect();
        ctx.stroke();

        // Clip to rectangle and draw diagonal slashes
        traceRect();
        ctx.clip();

        ctx.strokeStyle = "rgb(122, 192, 55, 0.75)";
        ctx.lineWidth = considerHiDPI(1.5);

        const armLen = halfThick;
        const mapLen = Math.sqrt((this.x1 - this.x0) ** 2 + (this.y1 - this.y0) ** 2);
        const numTicks = Math.max(0, Math.floor(mapLen / 4));

        for (let i = 1; i <= numTicks; i++) {
            const t = (i / (numTicks + 1)) * len;
            const mx = p0.x + ux * t;
            const my = p0.y + uy * t;
            ctx.beginPath();
            ctx.moveTo(mx + (ux - px) * armLen, my + (uy - py) * armLen);
            ctx.lineTo(mx - (ux - px) * armLen, my - (uy - py) * armLen);
            ctx.stroke();
        }

        ctxWrapper.restore();
    }
}

export default PassableThresholdMapStructure;
