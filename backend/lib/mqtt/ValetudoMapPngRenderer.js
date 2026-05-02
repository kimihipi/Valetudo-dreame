"use strict";

const LineMapEntity = require("../entities/map/LineMapEntity");
const MapLayer = require("../entities/map/MapLayer");
const PointMapEntity = require("../entities/map/PointMapEntity");
const PolygonMapEntity = require("../entities/map/PolygonMapEntity");
const zlib = require("zlib");

// Palette indices
const P = Object.freeze({
    BG: 0, FLOOR: 1, WALL: 2,
    SEG: [3, 4, 5, 6, 7],
    ROBOT: 8, CHARGER: 9,
    RED: 10, MAGENTA: 11, GREEN: 12, GOLD: 13, BROWN: 14, ORANGE: 15, CYAN: 16, TAN: 17,
    ROBOT_GRAY: 18,
});

// [R, G, B, A] — A goes into the tRNS chunk; PLTE contains only RGB
const PALETTE_RAW = [
    [0, 0, 0, 0],       // 0  transparent background
    [0, 118, 255, 255],  // 1  floor (Valetudo blue)
    [51, 51, 51, 255],   // 2  wall (dark grey)
    [25, 161, 161, 255], // 3  segment teal
    [122, 192, 55, 255], // 4  segment green
    [223, 86, 24, 255],  // 5  segment orange
    [247, 200, 65, 255], // 6  segment yellow
    [153, 102, 204, 255], // 7  segment purple
    [255, 255, 255, 255], // 8  robot body (white)
    [255, 220, 0, 255],  // 9  charger (bright yellow)
    [239, 68, 68, 255],  // 10 red: virtual wall, no-go, impassable threshold
    [217, 70, 239, 255], // 11 magenta: no-mop
    [53, 145, 26, 255],  // 12 green: active zone, passable threshold
    [234, 179, 8, 255],  // 13 gold: curtain
    [160, 110, 35, 255], // 14 brown: carpet
    [255, 100, 0, 255],  // 15 orange: obstacle
    [0, 200, 200, 255],  // 16 cyan: go-to target
    [200, 180, 100, 255], // 17 tan: ramp
    [127, 127, 127, 255], // 18 robot outline/stripe (#7f7f7f, matches SVG icon)
];

// Precompute PLTE and tRNS buffers once at module load
const PLTE = Buffer.allocUnsafe(PALETTE_RAW.length * 3);
const TRNS = Buffer.allocUnsafe(PALETTE_RAW.length);
for (let i = 0; i < PALETTE_RAW.length; i++) {
    PLTE[i * 3] = PALETTE_RAW[i][0];
    PLTE[i * 3 + 1] = PALETTE_RAW[i][1];
    PLTE[i * 3 + 2] = PALETTE_RAW[i][2];
    TRNS[i] = PALETTE_RAW[i][3];
}


// CRC32 lookup table, computed once at module load
const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) {
            c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        t[i] = c;
    }
    return t;
})();

const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/**
 * @param {string} type
 * @param {Buffer} data
 * @returns {Buffer}
 */
function pngChunk(type, data) {
    const typeBytes = Buffer.from(type, "ascii");
    // CRC covers type + data without allocating a combined buffer
    let c = 0xffffffff;
    for (let i = 0; i < 4; i++) {
        c = CRC_TABLE[(c ^ typeBytes[i]) & 0xff] ^ (c >>> 8);
    }
    for (let i = 0; i < data.length; i++) {
        c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
    }
    const crcVal = (c ^ 0xffffffff) >>> 0;

    const out = Buffer.allocUnsafe(4 + 4 + data.length + 4);
    out.writeUInt32BE(data.length, 0);
    typeBytes.copy(out, 4);
    data.copy(out, 8);
    out.writeUInt32BE(crcVal, 8 + data.length);
    return out;
}

// Fixed chunks — computed once since palette never changes
const PLTE_CHUNK = pngChunk("PLTE", PLTE);
const TRNS_CHUNK = pngChunk("tRNS", TRNS);
const IEND_CHUNK = pngChunk("IEND", Buffer.alloc(0));

// --- Drawing primitives ---

/**
 * @param {Uint8Array} px
 * @param {number} w
 * @param {number} h
 * @param {number} x
 * @param {number} y
 * @param {number} color
 */
function putPixel(px, w, h, x, y, color) {
    if ((x | 0) >= 0 && (x | 0) < w && (y | 0) >= 0 && (y | 0) < h) {
        px[(y | 0) * w + (x | 0)] = color;
    }
}

/**
 * @param {Uint8Array} px
 * @param {number} w
 * @param {number} h
 * @param {number} cx
 * @param {number} cy
 * @param {number} r
 * @param {number} color
 */
function drawCircle(px, w, h, cx, cy, r, color) {
    for (let dy = -r; dy <= r; dy++) {
        const maxDx2 = r * r - dy * dy;
        for (let dx = -r; dx <= r; dx++) {
            if (dx * dx <= maxDx2) {
                putPixel(px, w, h, cx + dx, cy + dy, color);
            }
        }
    }
}

/**
 * Bresenham line with square half-thickness (half=0 → 1px, half=1 → 3px, half=2 → 5px).
 * @param {Uint8Array} px
 * @param {number} w
 * @param {number} h
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1
 * @param {number} y1
 * @param {number} color
 * @param {number} half
 */
function drawLine(px, w, h, x0, y0, x1, y1, color, half) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const adx = Math.abs(x1 - x0), ady = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = adx - ady;
    for (;;) {
        for (let ty = -half; ty <= half; ty++) {
            for (let tx = -half; tx <= half; tx++) {
                putPixel(px, w, h, x0 + tx, y0 + ty, color);
            }
        }
        if (x0 === x1 && y0 === y1) {
            break;
        }
        const e2 = 2 * err;
        if (e2 > -ady) {
            err -= ady;
            x0 += sx;
        }
        if (e2 < adx) {
            err += adx;
            y0 += sy;
        }
    }
}

/**
 * Closed polygon outline. pts is a flat [x0,y0,x1,y1,...] array in pixel coords.
 * @param {Uint8Array} px
 * @param {number} w
 * @param {number} h
 * @param {number[]} pts
 * @param {number} color
 * @param {number} half
 */
function drawPolygon(px, w, h, pts, color, half) {
    const n = pts.length >> 1;
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        drawLine(px, w, h, pts[i * 2], pts[i * 2 + 1], pts[j * 2], pts[j * 2 + 1], color, half);
    }
}

/**
 * @param {Uint8Array} px
 * @param {number} w
 * @param {number} h
 * @param {number} cx
 * @param {number} cy
 * @param {number} r
 * @param {number} color
 */
function drawDiamond(px, w, h, cx, cy, r, color) {
    for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
            if (Math.abs(dx) + Math.abs(dy) <= r) {
                putPixel(px, w, h, cx + dx, cy + dy, color);
            }
        }
    }
}

// Hard cap on output dimensions — also the max upscale target.
// Native map pixels are never blown up beyond MAX_UPSCALE× so individual
// pixels don't become visible blocks.  If the cropped content would require
// a larger factor to reach MAX_SIZE, we stop at MAX_UPSCALE instead.
const MAX_SIZE = 2048;
const MAX_UPSCALE = 16;

/**
 * @param {Uint8Array} src
 * @param {number} srcW
 * @param {number} srcH
 * @returns {{pixels: Uint8Array, w: number, h: number}}
 */
function scaleToMax(src, srcW, srcH) {
    const scale = Math.min(MAX_UPSCALE, MAX_SIZE / srcW, MAX_SIZE / srcH);
    const dstW = Math.round(srcW * scale);
    const dstH = Math.round(srcH * scale);

    if (dstW === srcW && dstH === srcH) {
        return {pixels: src, w: srcW, h: srcH};
    }

    const xMap = new Uint16Array(dstW);
    for (let tx = 0; tx < dstW; tx++) {
        xMap[tx] = Math.floor(tx * srcW / dstW);
    }

    const dst = new Uint8Array(dstW * dstH);
    for (let ty = 0; ty < dstH; ty++) {
        const srcRow = Math.floor(ty * srcH / dstH) * srcW;
        const dstRow = ty * dstW;
        for (let tx = 0; tx < dstW; tx++) {
            dst[dstRow + tx] = src[srcRow + xMap[tx]];
        }
    }

    return {pixels: dst, w: dstW, h: dstH};
}

// --- Main render ---

/**
 * Renders a map to an indexed-color PNG buffer.
 * No external dependencies — uses only the built-in zlib module.
 *
 * @param {{size: {x: number, y: number}, pixelSize: number, layers: import("../entities/map/MapLayer")[], entities: import("../entities/map/MapEntity")[]}} map
 * @returns {Promise<Buffer>}
 */
function render(map) {
    // Full native canvas — same dimensions the live map uses (size / pixelSize).
    const w = Math.round(map.size.x / map.pixelSize);
    const h = Math.round(map.size.y / map.pixelSize);
    const px = new Uint8Array(w * h);

    // Assign segment colors in first-seen layer order
    const segColor = new Map();
    let segIdx = 0;
    for (const layer of map.layers) {
        if (layer.type === MapLayer.TYPE.SEGMENT && !layer.metaData.hidden) {
            const id = layer.metaData.segmentId;
            if (!segColor.has(id)) {
                segColor.set(id, P.SEG[segIdx % P.SEG.length]);
                segIdx++;
            }
        }
    }

    // Paint layers into the full native canvas (no coordinate offset)
    for (const layer of map.layers) {
        if (layer.metaData.hidden) {
            continue;
        }
        let color;
        switch (layer.type) {
            case MapLayer.TYPE.FLOOR: color = P.FLOOR; break;
            case MapLayer.TYPE.WALL: color = P.WALL; break;
            case MapLayer.TYPE.SEGMENT: color = segColor.get(layer.metaData.segmentId) ?? P.FLOOR; break;
            default: continue;
        }
        const cp = layer.compressedPixels ?? [];
        for (let i = 0; i < cp.length; i += 3) {
            // cp[i]=xStart, cp[i+1]=y, cp[i+2]=count
            px.fill(color, cp[i + 1] * w + cp[i], cp[i + 1] * w + cp[i] + cp[i + 2]);
        }
    }

    /** @param {number} v */
    const toPx = v => Math.round(v / map.pixelSize);

    const robotR = Math.max(3, Math.round(15 / map.pixelSize));

    // Separate entities by draw layer (back-to-front: polygons < lines < points)
    const polygons = [], lines = [], pointEntities = [];
    for (const e of map.entities) {
        if (e instanceof PolygonMapEntity) {
            polygons.push(e);
        } else if (e instanceof LineMapEntity) {
            lines.push(e);
        } else if (e instanceof PointMapEntity) {
            pointEntities.push(e);
        }
    }

    for (const e of polygons) {
        const pts = e.points.map(toPx);
        let color;
        switch (e.type) {
            case PolygonMapEntity.TYPE.NO_GO_AREA: color = P.RED; break;
            case PolygonMapEntity.TYPE.NO_MOP_AREA: color = P.MAGENTA; break;
            case PolygonMapEntity.TYPE.ACTIVE_ZONE: color = P.GREEN; break;
            case PolygonMapEntity.TYPE.CARPET: color = P.BROWN; break;
            case PolygonMapEntity.TYPE.RAMP: color = P.TAN; break;
            default: continue;
        }
        drawPolygon(px, w, h, pts, color, 0);
    }

    for (const e of lines) {
        const [x0, y0, x1, y1] = e.points.map(toPx);
        let color;
        switch (e.type) {
            case LineMapEntity.TYPE.VIRTUAL_WALL: color = P.RED; break;
            case LineMapEntity.TYPE.IMPASSABLE_THRESHOLD: color = P.RED; break;
            case LineMapEntity.TYPE.PASSABLE_THRESHOLD: color = P.GREEN; break;
            case LineMapEntity.TYPE.CURTAIN: color = P.GOLD; break;
            default: continue;
        }
        drawLine(px, w, h, x0, y0, x1, y1, color, 0);
    }

    for (const e of pointEntities) {
        const cx = toPx(e.points[0]), cy = toPx(e.points[1]);
        /** @type {any} */
        const meta = e.metaData;
        switch (e.type) {
            case PointMapEntity.TYPE.ROBOT_POSITION: {
                // Matches robot.svg: gray outline ring, white body, perpendicular
                // stripe dividing front/back, small sensor circle at the front.
                drawCircle(px, w, h, cx, cy, robotR + 1, P.ROBOT_GRAY);
                drawCircle(px, w, h, cx, cy, robotR, P.ROBOT);
                if (meta?.angle !== undefined) {
                    const rad = meta.angle * Math.PI / 180;
                    // Stripe perpendicular to heading (cos/sin gives the 90° rotated axis)
                    const sx = Math.round(Math.cos(rad) * robotR);
                    const sy = Math.round(Math.sin(rad) * robotR);
                    drawLine(px, w, h, cx + sx, cy + sy, cx - sx, cy - sy, P.ROBOT_GRAY, 0);
                    // Front sensor — gray ring + white fill, offset toward heading
                    if (robotR >= 5) {
                        const sensorR = Math.max(1, Math.round(robotR * 0.25));
                        const fOff = Math.max(1, Math.round(robotR * 0.40));
                        const fsx = cx + Math.round(Math.sin(rad) * fOff);
                        const fsy = cy - Math.round(Math.cos(rad) * fOff);
                        drawCircle(px, w, h, fsx, fsy, sensorR + 1, P.ROBOT_GRAY);
                        drawCircle(px, w, h, fsx, fsy, sensorR, P.ROBOT);
                    }
                }
                break;
            }
            case PointMapEntity.TYPE.GO_TO_TARGET:
                drawDiamond(px, w, h, cx, cy, Math.max(2, robotR - 1), P.CYAN);
                break;
            case PointMapEntity.TYPE.OBSTACLE:
                drawCircle(px, w, h, cx, cy, 2, P.ORANGE);
                break;
        }
    }

    // Compute tight bounding box from visible layer extents, then crop the
    // full canvas to remove empty border — same content the live map shows.
    let bMinX = Infinity, bMinY = Infinity, bMaxX = -Infinity, bMaxY = -Infinity;
    for (const layer of map.layers) {
        if (layer.metaData.hidden) {
            continue;
        }
        if (layer.type !== MapLayer.TYPE.FLOOR && layer.type !== MapLayer.TYPE.WALL && layer.type !== MapLayer.TYPE.SEGMENT) {
            continue;
        }
        bMinX = Math.min(bMinX, layer.dimensions?.x.min ?? Infinity);
        bMinY = Math.min(bMinY, layer.dimensions?.y.min ?? Infinity);
        bMaxX = Math.max(bMaxX, layer.dimensions?.x.max ?? -Infinity);
        bMaxY = Math.max(bMaxY, layer.dimensions?.y.max ?? -Infinity);
    }
    if (!isFinite(bMinX)) {
        bMinX = 0; bMinY = 0; bMaxX = w - 1; bMaxY = h - 1;
    }
    const PAD = 5;
    bMinX = Math.max(0, bMinX - PAD);
    bMinY = Math.max(0, bMinY - PAD);
    bMaxX = Math.min(w - 1, bMaxX + PAD);
    bMaxY = Math.min(h - 1, bMaxY + PAD);

    const cW = bMaxX - bMinX + 1;
    const cH = bMaxY - bMinY + 1;
    const cropped = new Uint8Array(cW * cH);
    for (let y = 0; y < cH; y++) {
        cropped.set(px.subarray((bMinY + y) * w + bMinX, (bMinY + y) * w + bMinX + cW), y * cW);
    }

    // Scale the cropped native pixels — capped at MAX_UPSCALE per native pixel
    const {pixels: outPx, w: outW, h: outH} = scaleToMax(cropped, cW, cH);

    // Build PNG scanlines with adaptive per-row filtering:
    //   Up   (type 2) for duplicate rows — nearest-neighbor upscaling repeats source rows
    //        N times, so (N-1)/N rows become all-zero bytes → deflates to almost nothing.
    //   Sub  (type 1) for the first occurrence of each source row — encodes horizontal
    //        runs of identical palette indices as a leading value + zeros.
    const raw = Buffer.allocUnsafe(outH * (1 + outW));
    for (let y = 0; y < outH; y++) {
        const off = y * (1 + outW);
        const base = y * outW;
        const isDup = y > 0 && Math.floor(y * cH / outH) === Math.floor((y - 1) * cH / outH);

        if (isDup) {
            // Up filter: filtered[x] = current[x] − prior[x]. Identical rows → all zeros.
            raw[off] = 2;
            raw.fill(0, off + 1, off + 1 + outW);
        } else {
            // Sub filter: filtered[x] = current[x] − current[x−1]  (left = 0 for x=0)
            raw[off] = 1;
            raw[off + 1] = outPx[base];
            for (let x = 1; x < outW; x++) {
                raw[off + 1 + x] = (outPx[base + x] - outPx[base + x - 1]) & 0xff;
            }
        }
    }

    const ihdr = Buffer.allocUnsafe(13);
    ihdr.writeUInt32BE(outW, 0);
    ihdr.writeUInt32BE(outH, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 3; // color type: indexed
    ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // compression, filter, interlace

    return new Promise((resolve, reject) => {
        zlib.deflate(raw, {level: 6}, (err, idat) => {
            if (err) {
                return reject(err);
            }
            resolve(Buffer.concat([
                PNG_SIG,
                pngChunk("IHDR", ihdr),
                PLTE_CHUNK,
                TRNS_CHUNK,
                pngChunk("IDAT", idat),
                IEND_CHUNK,
            ]));
        });
    });
}

module.exports = {render: render};
