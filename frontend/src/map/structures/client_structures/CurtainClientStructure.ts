import LineClientStructure from "./LineClientStructure";
import {considerHiDPI} from "../../utils/helpers";

class CurtainClientStructure extends LineClientStructure {
    public static readonly TYPE = "CurtainClientStructure";

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
        if (len === 0) {
            return;
        }

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
        ctx.fillStyle = "rgba(234, 179, 8, 0.15)";
        traceRect();
        ctx.fill();

        // Border — dashed when active
        ctx.strokeStyle = "rgba(234, 179, 8, 0.75)";
        ctx.lineWidth = considerHiDPI(2);
        ctx.lineCap = "square";
        if (this.active) {
            ctx.setLineDash([considerHiDPI(8), considerHiDPI(6)]);
        }
        traceRect();
        ctx.stroke();
        ctx.setLineDash([]);

        // Clip to rectangle and draw zig-zag
        traceRect();
        ctx.clip();

        ctx.strokeStyle = "rgba(234, 179, 8, 0.75)";
        ctx.lineWidth = considerHiDPI(1.5);

        const mapLen = Math.sqrt((this.x1 - this.x0) ** 2 + (this.y1 - this.y0) ** 2);
        const numZigZags = Math.max(1, Math.floor(mapLen / 6));

        ctx.beginPath();
        for (let i = 0; i <= numZigZags; i++) {
            const t = (i / numZigZags) * len;
            const mx = p0.x + ux * t;
            const my = p0.y + uy * t;
            const side = i % 2 === 0 ? 1 : -1;
            if (i === 0) {
                ctx.moveTo(mx + px * halfThick * side, my + py * halfThick * side);
            } else {
                ctx.lineTo(mx + px * halfThick * side, my + py * halfThick * side);
            }
        }
        ctx.stroke();
    }
}

export default CurtainClientStructure;
