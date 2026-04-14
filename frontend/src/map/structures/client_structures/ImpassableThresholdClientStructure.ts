import LineClientStructure from "./LineClientStructure";
import {considerHiDPI} from "../../utils/helpers";

class ImpassableThresholdClientStructure extends LineClientStructure {
    public static readonly TYPE = "ImpassableThresholdClientStructure";

    constructor(
        x0: number, y0: number,
        x1: number, y1: number,
        active?: boolean
    ) {
        super(x0, y0, x1, y1, active ?? false);
    }

    // Required by abstract base; not used since drawLine is fully overridden
    protected setLineStyle(_ctx: CanvasRenderingContext2D) { /* intentional */ }

    protected drawLine(ctx: CanvasRenderingContext2D, p0: DOMPoint, p1: DOMPoint, scaleFactor: number): void {
        const dx = p1.x - p0.x;
        const dy = p1.y - p0.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len === 0) {return;}

        const ux = dx / len;
        const uy = dy / len;
        const px = -uy;
        const py = ux;
        const halfThick = scaleFactor * 1;

        // Four corners of the thin rectangle around the line
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

        // Shadow outline
        ctx.save();
        ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
        ctx.lineWidth = considerHiDPI(2) + considerHiDPI(2);
        ctx.lineCap = "square";
        traceRect();
        ctx.stroke();
        ctx.restore();

        // Semi-transparent fill
        ctx.fillStyle = "rgba(239, 68, 68, 0.15)";
        traceRect();
        ctx.fill();

        // Border — dashed when active
        ctx.strokeStyle = "rgb(239, 68, 68, 0.75)";
        ctx.lineWidth = considerHiDPI(2);
        ctx.lineCap = "square";
        if (this.active) {
            ctx.setLineDash([considerHiDPI(8), considerHiDPI(6)]);
        }
        traceRect();
        ctx.stroke();
        ctx.setLineDash([]);

        // Clip to rectangle and draw diagonal slashes
        traceRect();
        ctx.clip();

        ctx.strokeStyle = "rgb(239, 68, 68, 0.75)";
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
    }
}

export default ImpassableThresholdClientStructure;
