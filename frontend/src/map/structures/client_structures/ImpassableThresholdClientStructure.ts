import LineClientStructure from "./LineClientStructure";
import {considerHiDPI} from "../../utils/helpers";

class ImpassableThresholdClientStructure extends LineClientStructure {
    public static readonly TYPE = "ImpassableThresholdClientStructure";

    constructor(
        x0: number, y0: number,
        x1: number, y1: number,
        active?: boolean
    ) {
        super(x0, y0, x1, y1, active ?? true);
    }

    protected setLineStyle(ctx: CanvasRenderingContext2D) {/* unnecessary */}

    protected drawLine(ctx: CanvasRenderingContext2D, p0: DOMPoint, p1: DOMPoint, scaleFactor: number): void {
        const dx = p1.x - p0.x;
        const dy = p1.y - p0.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);
        const scaledWidth = scaleFactor;

        ctx.save();
        ctx.translate(p0.x, p0.y);
        ctx.rotate(angle);
        ctx.fillStyle = "rgba(239, 68, 68, 0.6)";
        ctx.fillRect(0, -scaledWidth / 2, length, scaledWidth);

        const grooveCount = 8;
        const step = scaledWidth / (grooveCount + 1);
        ctx.beginPath();
        ctx.lineWidth = Math.max(0.5, considerHiDPI(0.5));
        ctx.strokeStyle = "rgba(239, 68, 68, 0.9)";
        for (let i = 1; i <= grooveCount; i++) {
            const yOffset = -scaledWidth / 2 + (step * i);
            ctx.moveTo(0, yOffset);
            ctx.lineTo(length, yOffset);
        }
        ctx.stroke();
        ctx.lineWidth = considerHiDPI(1);
        ctx.strokeStyle = "rgb(239, 68, 68)";
        ctx.strokeRect(0, -scaledWidth / 2, length, scaledWidth);
        ctx.restore();
    }
}

export default ImpassableThresholdClientStructure;
