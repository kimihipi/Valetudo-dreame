const DreameConst = require("./DreameConst");
const Logger = require("../../Logger");
const mapEntities = require("../../entities/map");
const uuid = require("uuid");
const zlib = require("zlib");

/**
 * P-Frames contain relative changes to the previous I- or even P-Frame
 *
 * That means that e.g. positions parsed from p-frames require the most recent previous absolute position to make sense
 */

class DreameMapParser {
    /**
     * This expects the already inflated buffer.
     * Since there are no magic bytes, there's no real way to do sanity checking which is sad.
     *
     * :(
     *
     * @param {Buffer} buf
     * @param {MapDataType} [mapType]
     * @returns {Promise<null|import("../../entities/map/ValetudoMap")>}
     */
    static async PARSE(buf, mapType = MAP_DATA_TYPES.REGULAR) {
        //Maps are always at least 27 bytes in size
        if (!buf || buf.length < HEADER_SIZE) {
            return null;
        }

        const parsedHeader = DreameMapParser.PARSE_HEADER(buf.subarray(0, HEADER_SIZE));


        // Since P-Frame parsing is much harder than I-Frame parsing, we're skipping them
        if (parsedHeader.frame_type !== FRAME_TYPES.I) {
            return null;
        }

        const layers = [];
        const entities = [];
        const metaData = {
            vendorMapId: parsedHeader.id
        };

        if (mapType === MAP_DATA_TYPES.RISM) {
            metaData.id = `${parsedHeader.id}`;
        }

        if (parsedHeader.robot_position.valid === true) {
            entities.push(
                new mapEntities.PointMapEntity({
                    points: [
                        parsedHeader.robot_position.x,
                        parsedHeader.robot_position.y
                    ],
                    metaData: {
                        angle: DreameMapParser.CONVERT_ANGLE_TO_VALETUDO(parsedHeader.robot_position.angle)
                    },
                    type: mapEntities.PointMapEntity.TYPE.ROBOT_POSITION
                })
            );
        }

        if (parsedHeader.charger_position.valid === true) {
            entities.push(
                new mapEntities.PointMapEntity({
                    points: [
                        parsedHeader.charger_position.x,
                        parsedHeader.charger_position.y
                    ],
                    metaData: {
                        angle: DreameMapParser.CONVERT_ANGLE_TO_VALETUDO(parsedHeader.charger_position.angle)
                    },
                    type: mapEntities.PointMapEntity.TYPE.CHARGER_LOCATION
                })
            );
        }


        if (buf.length >= HEADER_SIZE + parsedHeader.width * parsedHeader.height) {
            const imageData = buf.subarray(HEADER_SIZE, HEADER_SIZE + parsedHeader.width * parsedHeader.height);
            const activeSegmentIds = [];
            const deletedSegmentIds = [];
            const segmentNames = {};
            const segmentCleanOrder = {};
            const segmentMaterials = {};
            let additionalData = {};
            const additionalDataBuf = buf.subarray(parsedHeader.width * parsedHeader.height + HEADER_SIZE);

            if (additionalDataBuf.length > 0) {
                try {
                    additionalData = JSON.parse(additionalDataBuf.toString());
                } catch (e) {
                    // A non-empty payload that fails to parse means the frame is truncated or
                    // corrupted. Silently continuing would drop path, virtual walls, no-go
                    // zones, RISM and pending-map flags while presenting the map as valid.
                    // Reject the frame so callers keep the last-known-good map instead.
                    Logger.error(
                        `Failed to parse additional map data (${additionalDataBuf.length} bytes). Rejecting map frame.`,
                        e
                    );
                    return null;
                }
            }

            if (additionalData.sa && Array.isArray(additionalData.sa)) {
                additionalData.sa.forEach(sa => {
                    activeSegmentIds.push(sa[0].toString());
                });
            }

            if (additionalData.delsr && Array.isArray(additionalData.delsr)) {
                additionalData.delsr.forEach(id => {
                    deletedSegmentIds.push(id.toString());
                });
            }

            if (additionalData.seg_inf) {
                Object.keys(additionalData.seg_inf).forEach(segmentId => {
                    if (additionalData.seg_inf[segmentId].name) {
                        try {
                            segmentNames[segmentId] = Buffer.from(
                                String(additionalData.seg_inf[segmentId].name),
                                "base64"
                            ).toString("utf8");
                        } catch (e) {
                            Logger.warn(`Failed to decode name for segment ${segmentId}`, e);
                        }
                    }

                    if (additionalData.cleanareaorder !== undefined && Array.isArray(additionalData.cleanareaorder)) {
                        const foundEntry = additionalData.cleanareaorder.find(entry => Object.keys(entry).includes(segmentId));

                        if (foundEntry !== undefined) {
                            segmentCleanOrder[segmentId] = foundEntry[segmentId];
                        }
                    }

                    if (additionalData.seg_inf[segmentId].material !== undefined) {
                        let material;
                        switch (additionalData.seg_inf[segmentId].material) {
                            case 0:
                                material = mapEntities.MapLayer.MATERIAL.GENERIC;
                                break;
                            case 1:
                                material = mapEntities.MapLayer.MATERIAL.WOOD_HORIZONTAL;

                                if (additionalData.seg_inf[segmentId].direction === 90) {
                                    material = mapEntities.MapLayer.MATERIAL.WOOD_VERTICAL;
                                }

                                break;
                            case 2:
                                material = mapEntities.MapLayer.MATERIAL.TILE;
                                break;
                            case 5:
                                material = mapEntities.MapLayer.MATERIAL.CARPET_HIGH;
                                break;
                            case 6:
                                material = mapEntities.MapLayer.MATERIAL.CARPET_LOW;
                                break;
                            case 7:
                                material = mapEntities.MapLayer.MATERIAL.CARPET;
                                break;
                            default:
                                Logger.warn("Unhandled segment material", additionalData.seg_inf[segmentId].material);
                        }

                        segmentMaterials[segmentId] = material;
                    }
                });
            }

            const { layers: imageLayers, carpetPolygons: regularCarpetPolygons } = DreameMapParser.PARSE_IMAGE(parsedHeader, activeSegmentIds, deletedSegmentIds, segmentNames, segmentCleanOrder, segmentMaterials, imageData, mapType);
            layers.push(...imageLayers);
            const rismCarpetPolygons = [];
            const jsonCarpetPolygons = [];

            /**
             * Contains saved map data such as virtual restrictions as well as segments
             *
             * ris 2 seems to represent that the rism data shall be applied to the map while ris 1 only appears
             * after the robot complains about being unable to use the map
             *
             * With vSLAM robots, ris doesn't automatically switch from 1 to 2 after the initial cleanup.
             * Instead, it requires the start of another cleanup
             * Because of that, we also need to check for iscleanlog, so that a vSlam user gets to see their
             * newly mapped segments without any instantly aborted second cleanups.
             */
            if (additionalData.rism && (additionalData.ris === 2 || additionalData.iscleanlog === true)) {
                const rismResult = await DreameMapParser.PARSE(await DreameMapParser.PREPROCESS(additionalData.rism), MAP_DATA_TYPES.RISM);

                if (rismResult instanceof mapEntities.ValetudoMap) {
                    rismResult.entities.forEach(e => {
                        if (e instanceof mapEntities.PointMapEntity) {
                            if (e.type === mapEntities.PointMapEntity.TYPE.ROBOT_POSITION && parsedHeader.robot_position.valid === false) {
                                entities.push(e);
                            }
                            if (e.type === mapEntities.PointMapEntity.TYPE.CHARGER_LOCATION && parsedHeader.charger_position.valid === false) {
                                entities.push(e);
                            }
                        } else if (e instanceof mapEntities.PolygonMapEntity) {
                            if (e.type === mapEntities.PolygonMapEntity.TYPE.CARPET) {
                                rismCarpetPolygons.push(e);
                            } else if (
                                e.type === mapEntities.PolygonMapEntity.TYPE.NO_GO_AREA ||
                                e.type === mapEntities.PolygonMapEntity.TYPE.NO_MOP_AREA ||
                                e.type === mapEntities.PolygonMapEntity.TYPE.RAMP
                            ) {
                                entities.push(e);
                            }
                        } else if (e instanceof mapEntities.LineMapEntity) {
                            if (
                                e.type === mapEntities.LineMapEntity.TYPE.VIRTUAL_WALL ||
                                e.type === mapEntities.LineMapEntity.TYPE.THRESHOLD ||
                                e.type === mapEntities.LineMapEntity.TYPE.IMPASSABLE_THRESHOLD ||
                                e.type === mapEntities.LineMapEntity.TYPE.CURTAIN
                            ) {
                                entities.push(e);
                            }
                        }
                    });

                    rismResult.layers.forEach(l => {
                        if (l.metaData.segmentId !== undefined) {
                            if (activeSegmentIds.includes(l.metaData.segmentId)) { //required for the 1C
                                l.metaData.active = true;
                            }

                            const existingLayer = layers.find(eL => {
                                return eL.metaData.segmentId === l.metaData.segmentId;
                            });

                            if (!existingLayer) {
                                layers.push(l);
                            } else {
                                if (l.metaData.name) {
                                    existingLayer.metaData.name = l.metaData.name;
                                }
                                if (l.metaData.cleanOrder) {
                                    existingLayer.metaData.cleanOrder = l.metaData.cleanOrder;
                                }
                                if (l.metaData.material && existingLayer.metaData.material === undefined) {
                                    existingLayer.metaData.material = l.metaData.material;
                                }
                            }
                        } else {
                            if (layers.findIndex(eL => {
                                return eL.type === l.type;
                            }) === -1) {
                                layers.push(l);
                            }
                        }
                    });

                    if (rismResult.metaData?.dreamePendingMapChange !== undefined) {
                        metaData.dreamePendingMapChange = rismResult.metaData.dreamePendingMapChange;
                    } else {
                        // The map ID probably cannot be trusted if we are pending a map change
                        metaData.id = rismResult.metaData.id;
                    }

                    if (rismResult.metaData?.rotation !== undefined) {
                        metaData.rotation = rismResult.metaData.rotation;
                    }
                }
            }


            if (additionalData.tr) {
                const paths = DreameMapParser.PARSE_PATH(parsedHeader, additionalData.tr, additionalData.l2r === 1);

                if (paths?.length > 0) {
                    entities.push(...paths);
                }

            }

            if (Array.isArray(additionalData.da)) { //1C
                entities.push(
                    ...DreameMapParser.PARSE_AREAS(
                        parsedHeader,
                        [additionalData.da],
                        mapEntities.PolygonMapEntity.TYPE.ACTIVE_ZONE
                    )
                );
            }

            if (additionalData.da2 && Array.isArray(additionalData.da2.areas)) {
                entities.push(
                    ...DreameMapParser.PARSE_AREAS(
                        parsedHeader,
                        additionalData.da2.areas,
                        mapEntities.PolygonMapEntity.TYPE.ACTIVE_ZONE
                    )
                );
            }

            if (additionalData.vw) {
                if (Array.isArray(additionalData.vw.rect)) {
                    entities.push(
                        ...DreameMapParser.PARSE_AREAS(
                            parsedHeader,
                            additionalData.vw.rect,
                            mapEntities.PolygonMapEntity.TYPE.NO_GO_AREA
                        )
                    );
                }

                if (Array.isArray(additionalData.vw.mop)) {
                    entities.push(
                        ...DreameMapParser.PARSE_AREAS(
                            parsedHeader,
                            additionalData.vw.mop,
                            mapEntities.PolygonMapEntity.TYPE.NO_MOP_AREA
                        )
                    );
                }

                if (Array.isArray(additionalData.vw.line)) {
                    entities.push(
                        ...DreameMapParser.PARSE_LINES(
                            parsedHeader,
                            additionalData.vw.line,
                            mapEntities.LineMapEntity.TYPE.VIRTUAL_WALL
                        )
                    );
                }

                if (Array.isArray(additionalData.vw.addcpt)) {
                    additionalData.vw.addcpt.forEach(carpet => {
                        const pA = DreameMapParser.CONVERT_TO_VALETUDO_COORDINATES(carpet[0], carpet[1]);
                        const pC = DreameMapParser.CONVERT_TO_VALETUDO_COORDINATES(carpet[2], carpet[3]);
                        const xCoords = [pA.x, pC.x].sort((a, b) => a - b);
                        const yCoords = [pA.y, pC.y].sort((a, b) => a - b);

                        jsonCarpetPolygons.push(new mapEntities.PolygonMapEntity({
                            points: [
                                xCoords[0], yCoords[0],
                                xCoords[1], yCoords[0],
                                xCoords[1], yCoords[1],
                                xCoords[0], yCoords[1]
                            ],
                            type: mapEntities.PolygonMapEntity.TYPE.CARPET,
                            metaData: {
                                id: carpet[4]
                            }
                        }));
                    });
                }
                // Apparently there's also .cliff?
            }

            if (additionalData.vws) {
                if (Array.isArray(additionalData.vws.vwsl)) {
                    entities.push(
                        ...DreameMapParser.PARSE_LINES(
                            parsedHeader,
                            additionalData.vws.vwsl,
                            mapEntities.LineMapEntity.TYPE.THRESHOLD
                        )
                    );
                }

                if (Array.isArray(additionalData.vws.npthrsd)) {
                    entities.push(
                        ...DreameMapParser.PARSE_LINES(
                            parsedHeader,
                            additionalData.vws.npthrsd,
                            mapEntities.LineMapEntity.TYPE.IMPASSABLE_THRESHOLD
                        )
                    );
                }

                if (Array.isArray(additionalData.vws.ramp)) {
                    entities.push(
                        ...DreameMapParser.PARSE_RAMPS(
                            parsedHeader,
                            additionalData.vws.ramp
                        )
                    );
                }
            }

            if (additionalData.ct) {
                if (Array.isArray(additionalData.ct.line)) {
                    entities.push(
                        ...DreameMapParser.PARSE_LINES(
                            parsedHeader,
                            additionalData.ct.line,
                            mapEntities.LineMapEntity.TYPE.CURTAIN
                        )
                    );
                }
            }

            /*
                rec_vw can be an object of recommendations by the robot firmware that may look like this:

                {
                    "vwsl":    [[x1, y1, x2, y2], ...],   // passable thresholds
                    "npthrsd": [[x1, y1, x2, y2], ...],   // impassable thresholds
                    "rect":    [[x1, y1, x2, y2], ...],   // no-go zones
                    "mop":     [[x1, y1, x2, y2], ...],   // no-mop zones
                    "line":    [[x1, y1, x2, y2], ...],   // virtual walls
                    "carpet":  [[x1, y1, x2, y2], ...]    // carpets
                }
             */

            /*
                TODO RESEARCH

                There can be an spoint object. No idea what that does
                There can also be multiple tpoint points. No idea when or why that happens or what it does either
             */
            if (additionalData.pointinfo && Array.isArray(additionalData.pointinfo.tpoint) && additionalData.pointinfo.tpoint.length === 1) {
                const goToPoint = DreameMapParser.CONVERT_TO_VALETUDO_COORDINATES(
                    additionalData.pointinfo.tpoint[0][0],
                    additionalData.pointinfo.tpoint[0][1],
                );

                entities.push(new mapEntities.PointMapEntity({
                    points: [
                        goToPoint.x,
                        goToPoint.y,
                    ],
                    type: mapEntities.PointMapEntity.TYPE.GO_TO_TARGET
                }));
            }

            if (additionalData.suw > 0) {
                /*
                    6 = New Map in Single-map
                    5 = New Map in Multi-map

                    other values TBD
                 */
                metaData.dreamePendingMapChange = true;
            }

            if (additionalData.mra !== undefined) {
                metaData.rotation = Number(additionalData.mra);
            }

            if (additionalData.ai_obstacle?.length > 0) {
                additionalData.ai_obstacle.forEach((obstacle) => {
                    const coords = DreameMapParser.CONVERT_TO_VALETUDO_COORDINATES(
                        parseFloat(obstacle[0]),
                        parseFloat(obstacle[1])
                    );
                    const type = DreameConst.AI_CLASSIFIER_IDS[obstacle[2]] ?? `Unknown ID ${obstacle[2]}`;
                    const confidence = `${Math.round(parseFloat(obstacle[3])*100)}%`;
                    const image = obstacle[5] !== undefined ? obstacle[5] : undefined;

                    if (HIDDEN_OBSTACLE_TYPES.includes(obstacle[2])) {
                        return;
                    }

                    entities.push(new mapEntities.PointMapEntity({
                        points: [
                            coords.x,
                            coords.y,
                        ],
                        type: mapEntities.PointMapEntity.TYPE.OBSTACLE,
                        metaData: {
                            label: `${type} (${confidence})`,
                            id: uuid.v5(
                                `${obstacle[2]}_${obstacle[0]}_${obstacle[1]}`,
                                OBSTACLE_ID_NAMESPACE
                            ),
                            image: image
                        }
                    }));
                });
            }

            if (additionalData.carpet_info) {
                for (const [carpetId, carpetInfo] of Object.entries(additionalData.carpet_info)) {
                    const pA = DreameMapParser.CONVERT_TO_VALETUDO_COORDINATES(carpetInfo[0], carpetInfo[1]);
                    const pB = DreameMapParser.CONVERT_TO_VALETUDO_COORDINATES(carpetInfo[2], carpetInfo[3]);

                    //I'm way too lazy to figure out which dreame model uses which order of coordinates
                    const xCoords = [pA.x, pB.x].sort((a, b) => {
                        return a-b;
                    });
                    const yCoords = [pA.y, pB.y].sort((a, b) => {
                        return a-b;
                    });

                    jsonCarpetPolygons.push(new mapEntities.PolygonMapEntity({
                        points: [
                            xCoords[0], yCoords[0],
                            xCoords[1], yCoords[0],
                            xCoords[1], yCoords[1],
                            xCoords[0], yCoords[1]
                        ],
                        type: mapEntities.PolygonMapEntity.TYPE.CARPET,
                        metaData: {
                            id: carpetId
                        }
                    }));

                }
            }

            if (additionalData.carpet_polygon) {
                for (const [carpetId, carpetPolygon] of Object.entries(additionalData.carpet_polygon)) {
                    const coords = carpetPolygon[0];
                    const points = [];

                    for (let i = 0; i < coords.length; i = i + 2) {
                        const p = DreameMapParser.CONVERT_TO_VALETUDO_COORDINATES(coords[i], coords[i+1]);

                        points.push(p.x, p.y);
                    }

                    jsonCarpetPolygons.push(new mapEntities.PolygonMapEntity({
                        points: points,
                        type: mapEntities.PolygonMapEntity.TYPE.CARPET,
                        metaData: {
                            id: carpetId
                        }
                    }));

                }
            }

            if (jsonCarpetPolygons.length > 0) {
                // The same carpet can be reported by multiple sources (e.g. vw.addcpt
                // and carpet_info), so drop exact geometric duplicates
                const seenCarpetKeys = new Set();

                entities.push(...jsonCarpetPolygons.filter(polygon => {
                    const key = polygon.points.join(":");

                    if (seenCarpetKeys.has(key)) {
                        return false;
                    }

                    seenCarpetKeys.add(key);
                    return true;
                }));
            } else if (rismCarpetPolygons.length > 0) {
                entities.push(...rismCarpetPolygons);
            } else {
                entities.push(...regularCarpetPolygons);
            }

        } else {
            //Just a header
            return null;
        }

        // While the map is technically valid at this point, we still ignore it as we don't need a map with 0 pixels
        if (layers.length === 0) {
            return null;
        }

        return new mapEntities.ValetudoMap({
            metaData: metaData,
            size: {
                x: MAX_X,
                y: MAX_Y
            },
            pixelSize: parsedHeader.pixelSize,
            layers: layers,
            entities: entities
        });
    }

    static PARSE_HEADER(buf) {
        const parsedHeader = {
            robot_position: {},
            charger_position: {}
        };

        // ids and angles are unsigned 0..65535 / 0..360. Positions stay signed because they
        // use the HALF_INT16 offset trick.
        parsedHeader.id = buf.readUInt16LE();
        parsedHeader.frame_id = buf.readUInt16LE(2);
        parsedHeader.frame_type = buf.readInt8(4);

        parsedHeader.robot_position = DreameMapParser.CONVERT_TO_VALETUDO_COORDINATES(buf.readInt16LE(5), buf.readInt16LE(7));
        parsedHeader.robot_position.angle = buf.readUInt16LE(9);
        parsedHeader.robot_position.valid = true;

        parsedHeader.charger_position = DreameMapParser.CONVERT_TO_VALETUDO_COORDINATES(buf.readInt16LE(11), buf.readInt16LE(13));
        parsedHeader.charger_position.angle = buf.readUInt16LE(15);
        parsedHeader.charger_position.valid = true;

        parsedHeader.pixelSize = Math.round(buf.readInt16LE(17) / 10);

        parsedHeader.width = buf.readInt16LE(19);
        parsedHeader.height = buf.readInt16LE(21);

        parsedHeader.left = Math.round((buf.readInt16LE(23) + HALF_INT16 )/ 10);
        parsedHeader.top = Math.round((buf.readInt16LE(25) + HALF_INT16) / 10);


        if (buf.readInt16LE(5) === HALF_INT16_UPPER_HALF && buf.readInt16LE(7) === HALF_INT16_UPPER_HALF) {
            parsedHeader.robot_position.valid = false;
        }

        if (buf.readInt16LE(11) === HALF_INT16_UPPER_HALF && buf.readInt16LE(13) === HALF_INT16_UPPER_HALF) {
            parsedHeader.charger_position.valid = false;
        }

        return parsedHeader;
    }

    static PARSE_IMAGE(parsedHeader, activeSegmentIds, deletedSegmentIds, segmentNames, segmentCleanOrder, segmentMaterials, buf, mapType) {
        const floorPixels = [];
        const wallPixels = [];
        const carpetPixels = [];
        const segments = {};

        const layers = [];

        /**
         * The valetudo map origin is in the top left corner
         * The dreame map origin is in the bottom left corner
         *
         * Therefore, we need to flip this and every Y coordinate
         */
        const colOffset = parsedHeader.left / parsedHeader.pixelSize;
        const rowOffset = parsedHeader.top / parsedHeader.pixelSize;
        const flippedMaxY = MAX_Y / parsedHeader.pixelSize;

        // Valid pixel coord range within the Valetudo canvas. Aggressive RISM headers can
        // produce coords outside these bounds, which would collide under the (x<<13)|y
        // key scheme and leak off-canvas pixels into the layer arrays.
        const maxPixelX = MAX_X / parsedHeader.pixelSize;
        const maxPixelY = MAX_Y / parsedHeader.pixelSize;

        // Bounded-int pixel key for the wall-filter and carpet flood-fill sets below.
        // Valid over 0 <= x,y < 8192 (comfortably covers MAX_X/MAX_Y at any pixelSize).
        /** @type {(x: number, y: number) => number} */
        const pixelKey = (x, y) => (x << 13) | y;

        for (let i = 0; i < parsedHeader.height; i++) {
            for (let j = 0; j < parsedHeader.width; j++) {

                const coords = [
                    Math.round(j + colOffset),
                    Math.round(flippedMaxY - (i + rowOffset))
                ];

                if (
                    coords[0] < 0 || coords[1] < 0 ||
                    coords[0] >= maxPixelX || coords[1] >= maxPixelY
                ) {
                    continue;
                }

                if (mapType === MAP_DATA_TYPES.REGULAR) {
                    /**
                     * A regular Pixel is one byte consisting of
                     *      000000               00
                     *      The segment ID       The Type
                     */
                    const px = buf[(i * parsedHeader.width) + j];

                    const segmentId = px >> 2;

                    if (segmentId > 0 && segmentId < 62) { //62 is newly discovered floor
                        if (!segments[segmentId]) {
                            segments[segmentId] = [];
                        }

                        segments[segmentId].push(coords);

                        if ((px & 0b00000011) === PIXEL_TYPES.CARPET) {
                            carpetPixels.push(coords);
                        }
                    } else {
                        switch (px & 0b00000011) {
                            case PIXEL_TYPES.NONE:
                                break;
                            case PIXEL_TYPES.FLOOR:
                                floorPixels.push(coords);
                                break;
                            case PIXEL_TYPES.CARPET:
                                floorPixels.push(coords);
                                carpetPixels.push(coords);
                                break;
                            case PIXEL_TYPES.WALL:
                                wallPixels.push(coords);
                                break;
                            default:
                                Logger.warn("Unhandled pixel type", px);
                        }
                    }
                } else if (mapType === MAP_DATA_TYPES.RISM) {
                    /**
                     * A rism Pixel is one byte consisting of
                     *      1            1                000000
                     *      isWall flag  isCarpet flag    The Segment ID
                     */
                    const px = buf[(i * parsedHeader.width) + j];

                    const segmentId = px & 0b00111111;
                    const wallFlag = px >> 7;
                    const carpetFlag = (px >> 6) & 0b00000001;

                    if (wallFlag) {
                        wallPixels.push(coords);
                    } else if (segmentId > 0) {
                        if (!segments[segmentId]) {
                            segments[segmentId] = [];
                        }

                        segments[segmentId].push(coords);

                        if (carpetFlag) {
                            carpetPixels.push(coords);
                        }
                    } else if (carpetFlag) {
                        floorPixels.push(coords);
                        carpetPixels.push(coords);
                    }
                }
            }
        }

        if (floorPixels.length > 0) {
            layers.push(
                new mapEntities.MapLayer({
                    pixels: floorPixels.sort(mapEntities.MapLayer.COORDINATE_TUPLE_SORT).flat(),
                    type: mapEntities.MapLayer.TYPE.FLOOR
                })
            );
        }

        if (deletedSegmentIds.length > 0) {
            // Build a set of visible pixel coordinates to filter out walls that only
            // border hidden segments.
            const visiblePixelSet = new Set();
            Object.keys(segments).forEach(segmentId => {
                if (!deletedSegmentIds.includes(segmentId)) {
                    segments[segmentId].forEach(([x, y]) => {
                        visiblePixelSet.add(pixelKey(x, y));
                    });
                }
            });
            floorPixels.forEach(([x, y]) => visiblePixelSet.add(pixelKey(x, y)));

            const filteredWallPixels = wallPixels.filter(([x, y]) => {
                return (
                    visiblePixelSet.has(pixelKey(x-1, y)) ||
                    visiblePixelSet.has(pixelKey(x+1, y)) ||
                    visiblePixelSet.has(pixelKey(x, y-1)) ||
                    visiblePixelSet.has(pixelKey(x, y+1)) ||
                    visiblePixelSet.has(pixelKey(x-1, y-1)) ||
                    visiblePixelSet.has(pixelKey(x+1, y-1)) ||
                    visiblePixelSet.has(pixelKey(x-1, y+1)) ||
                    visiblePixelSet.has(pixelKey(x+1, y+1))
                );
            });

            if (filteredWallPixels.length > 0) {
                layers.push(
                    new mapEntities.MapLayer({
                        pixels: filteredWallPixels.sort(mapEntities.MapLayer.COORDINATE_TUPLE_SORT).flat(),
                        type: mapEntities.MapLayer.TYPE.WALL
                    })
                );
            }
        } else if (wallPixels.length > 0) {
            layers.push(
                new mapEntities.MapLayer({
                    pixels: wallPixels.sort(mapEntities.MapLayer.COORDINATE_TUPLE_SORT).flat(),
                    type: mapEntities.MapLayer.TYPE.WALL
                })
            );
        }

        Object.keys(segments).forEach(segmentId => {
            const metaData = {
                segmentId: segmentId,
                active: activeSegmentIds.includes(segmentId),
                source: mapType,
                hidden: deletedSegmentIds.includes(segmentId)
            };

            if (segmentNames[segmentId]) {
                metaData.name = segmentNames[segmentId];
            }

            if (segmentCleanOrder[segmentId]) {
                metaData.cleanOrder = segmentCleanOrder[segmentId];
            }

            if (segmentMaterials[segmentId]) {
                metaData.material = segmentMaterials[segmentId];
            }

            layers.push(
                new mapEntities.MapLayer({
                    pixels: segments[segmentId].sort(mapEntities.MapLayer.COORDINATE_TUPLE_SORT).flat(),
                    type: mapEntities.MapLayer.TYPE.SEGMENT,
                    metaData: metaData
                })
            );
        });

        const carpetPolygons = [];

        if (carpetPixels.length > 0) {
            const pixelSet = new Set(carpetPixels.map(([x, y]) => pixelKey(x, y)));
            const visited = new Set();

            for (const [sx, sy] of carpetPixels) {
                const startKey = pixelKey(sx, sy);
                if (visited.has(startKey)) {
                    continue;
                }

                const queue = [[sx, sy]];
                visited.add(startKey);
                let minX = sx, maxX = sx, minY = sy, maxY = sy;

                while (queue.length > 0) {
                    const [x, y] = /** @type {number[]} */ (queue.pop());
                    if (x < minX) {
                        minX = x;
                    }
                    if (x > maxX) {
                        maxX = x;
                    }
                    if (y < minY) {
                        minY = y;
                    }
                    if (y > maxY) {
                        maxY = y;
                    }

                    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                        const nk = pixelKey(x + dx, y + dy);
                        if (pixelSet.has(nk) && !visited.has(nk)) {
                            visited.add(nk);
                            queue.push([x + dx, y + dy]);
                        }
                    }
                }

                const ps = parsedHeader.pixelSize;
                carpetPolygons.push(new mapEntities.PolygonMapEntity({
                    points: [
                        minX * ps, minY * ps,
                        (maxX + 1) * ps, minY * ps,
                        (maxX + 1) * ps, (maxY + 1) * ps,
                        minX * ps, (maxY + 1) * ps,
                    ],
                    type: mapEntities.PolygonMapEntity.TYPE.CARPET,
                    metaData: {
                        id: `carpet_${carpetPolygons.length}`
                    }
                }));
            }
        }

        return { layers: layers, carpetPolygons: carpetPolygons };
    }

    static PARSE_PATH(parsedHeader, traceString, appendRobotPosition) {
        const paths = [];

        const unprocessedPaths = [];
        let currentUnprocessedPath = undefined;

        let currentPosition = {
            x: 0,
            y: 0
        };
        let match;

        while ((match = PATH_REGEX.exec(traceString)) !== null) {
            if (
                match.groups.operator === PATH_OPERATORS.START ||
                match.groups.operator === PATH_OPERATORS.MOP_START ||
                match.groups.operator === PATH_OPERATORS.DUAL_START
            ) {
                currentUnprocessedPath = {
                    operator: match.groups.operator,
                    points: []
                };
                unprocessedPaths.push(currentUnprocessedPath);

                currentPosition.x = parseInt(match.groups.x);
                currentPosition.y = parseInt(match.groups.y);
            } else if (match.groups.operator === PATH_OPERATORS.RELATIVE_LINE) {
                currentPosition.x += parseInt(match.groups.x);
                currentPosition.y += parseInt(match.groups.y);
            } else {
                throw new Error(`Invalid path operator ${match.groups.operator}`);
            }

            currentUnprocessedPath.points.push({
                x: currentPosition.x,
                y: currentPosition.y
            });
        }

        unprocessedPaths.forEach((unprocessedPath, i) => {
            let processedPathPoints = [];

            unprocessedPath.points.forEach(e => {
                const p = DreameMapParser.CONVERT_TO_VALETUDO_COORDINATES(e.x, e.y);

                processedPathPoints.push(p.x, p.y);
            });

            //Add the robot position to the last of all paths
            if (i === unprocessedPaths.length-1 && appendRobotPosition) {
                processedPathPoints.push(parsedHeader.robot_position.x, parsedHeader.robot_position.y);
            }

            let pathType;
            switch (unprocessedPath.operator) {
                case PATH_OPERATORS.MOP_START:
                    pathType = mapEntities.PathMapEntity.TYPE.MOP_PATH;
                    break;
                case PATH_OPERATORS.DUAL_START:
                    pathType = mapEntities.PathMapEntity.TYPE.VACUUM_AND_MOP_PATH;
                    break;
                default:
                    pathType = mapEntities.PathMapEntity.TYPE.PATH;
                    break;
            }

            paths.push(
                new mapEntities.PathMapEntity({
                    points: processedPathPoints,
                    type: pathType
                })
            );
        });


        return paths;
    }

    static PARSE_AREAS(parsedHeader, areas, type) {
        return areas.map(a => {
            const pA = DreameMapParser.CONVERT_TO_VALETUDO_COORDINATES(a[0], a[1]);
            const pB = DreameMapParser.CONVERT_TO_VALETUDO_COORDINATES(a[2], a[3]);

            //I'm way too lazy to figure out which dreame model uses which order of coordinates
            const xCoords = [pA.x, pB.x].sort((a, b) => {
                return a-b;
            });
            const yCoords = [pA.y, pB.y].sort((a, b) => {
                return a-b;
            });


            return new mapEntities.PolygonMapEntity({
                type: type,
                points: [
                    xCoords[0], yCoords[0],
                    xCoords[1], yCoords[0],
                    xCoords[1], yCoords[1],
                    xCoords[0], yCoords[1]
                ]
            });
        });
    }

    static PARSE_LINES(parsedHeader, lines, type) {
        return lines.map(a => {
            const pA = DreameMapParser.CONVERT_TO_VALETUDO_COORDINATES(a[0], a[1]);
            const pB = DreameMapParser.CONVERT_TO_VALETUDO_COORDINATES(a[2], a[3]);


            return new mapEntities.LineMapEntity({
                type: type,
                points: [pA.x,pA.y,pB.x,pB.y]
            });
        });
    }

    static PARSE_RAMPS(parsedHeader, ramps) {
        return ramps.map(r => {
            const pA = DreameMapParser.CONVERT_TO_VALETUDO_COORDINATES(r[0], r[1]);
            const pB = DreameMapParser.CONVERT_TO_VALETUDO_COORDINATES(r[2], r[3]);
            const angle = r[4];

            const minX = Math.min(pA.x, pB.x);
            const minY = Math.min(pA.y, pB.y);
            const maxX = Math.max(pA.x, pB.x);
            const maxY = Math.max(pA.y, pB.y);

            const corners = [
                { x: minX, y: minY },
                { x: maxX, y: minY },
                { x: maxX, y: maxY },
                { x: minX, y: maxY }
            ];

            const centerX = (minX + maxX) / 2;
            const centerY = (minY + maxY) / 2;
            const angleRad = -angle * Math.PI / 180;

            const rotatedCorners = corners.map(point => {
                const translatedX = point.x - centerX;
                const translatedY = point.y - centerY;

                const rotatedX = translatedX * Math.cos(angleRad) - translatedY * Math.sin(angleRad);
                const rotatedY = translatedX * Math.sin(angleRad) + translatedY * Math.cos(angleRad);

                return {
                    x: Math.round(rotatedX + centerX),
                    y: Math.round(rotatedY + centerY)
                };
            });

            return new mapEntities.PolygonMapEntity({
                type: mapEntities.PolygonMapEntity.TYPE.RAMP,
                points: [
                    rotatedCorners[0].x, rotatedCorners[0].y,
                    rotatedCorners[1].x, rotatedCorners[1].y,
                    rotatedCorners[2].x, rotatedCorners[2].y,
                    rotatedCorners[3].x, rotatedCorners[3].y
                ]
            });
        });
    }

    /**
     * Uploaded dreame Maps are actually base64url strings of zlib compressed data
     *
     * https://tools.ietf.org/html/rfc4648#section-5
     *
     *
     *
     * @param {Buffer|string} data
     * @returns {Promise<Buffer|null>}
     */
    static async PREPROCESS(data) {
        // Node handles the base64url alphabet natively — no need to string-replace
        // _→/ and -→+ before decoding. Called twice per I-frame (main + RISM).
        // As string.toString() is a no-op, we don't need to check the type beforehand
        try {
            // intentional return await
            return await new Promise((resolve, reject) => {
                zlib.inflate(Buffer.from(data.toString(), "base64url"), (err, result) => {
                    if (!err) {
                        resolve(result);
                    } else {
                        reject(err);
                    }
                });
            });
        } catch (e) {
            Logger.error("Error while preprocessing map", e);

            return null;
        }
    }
}

const PIXEL_TYPES = Object.freeze({
    NONE: 0,
    FLOOR: 1,
    WALL: 2,
    CARPET: 3
});

const FRAME_TYPES = Object.freeze({
    I: 73,
    P: 80
});

const PATH_REGEX = /(?<operator>[SMWL])(?<x>-?\d+),(?<y>-?\d+)/g;
const PATH_OPERATORS = {
    START: "S",
    MOP_START: "M",
    DUAL_START: "W",
    RELATIVE_LINE: "L"
};

/**
 *  @typedef {string} MapDataType
 *  @enum {string}
 *
 */
const MAP_DATA_TYPES = Object.freeze({
    REGULAR: "regular",
    RISM: "rism" //Room-information Saved Map
});

const HALF_INT16 = 32768;
const HALF_INT16_UPPER_HALF = 32767;
const HEADER_SIZE = 27;
const MAX_X = Math.round(((HALF_INT16 + HALF_INT16_UPPER_HALF)/10));
const MAX_Y = Math.round(((HALF_INT16 + HALF_INT16_UPPER_HALF)/10));

DreameMapParser.HALF_INT16 = HALF_INT16;

/**
 * Dreame coordinates are signed INT16. Valetudo coordinates are unsigned
 * Therefore, every absolute position needs to be shifted by half an INT16
 *
 * The valetudo map origin is in the top left corner
 * The dreame map origin is in the bottom left corner
 *
 * Therefore, we need to flip this and every Y coordinate
 *
 *
 * @param {number} x
 * @param {number} y
 * @returns {{x: number, y: number}}
 */
DreameMapParser.CONVERT_TO_VALETUDO_COORDINATES = function(x, y) {
    return {
        x: Math.round((x + HALF_INT16)/10),
        y: MAX_Y - Math.round((y + HALF_INT16)/10)
    };
};

/**
 *
 * @param {number} x
 * @param {number} y
 * @returns {{x: number, y: number}}
 */
DreameMapParser.CONVERT_TO_DREAME_COORDINATES = function(x, y) {
    return {
        x: (x*10) - HALF_INT16,
        y: (-1 * HALF_INT16) - ((y - MAX_Y) * 10) //thanks denna!
    };
};

/**
 * @param {number} angle
 * @return {number}
 */
DreameMapParser.CONVERT_ANGLE_TO_VALETUDO = function(angle) {
    //This flips the angle at the Y-axis due to our different coordinate system and then substracts 90° from it
    return ((angle < 180 ? 180 - angle : 360 - angle + 180) + 270) % 360;
};

const HIDDEN_OBSTACLE_TYPES = ["200"];
const OBSTACLE_ID_NAMESPACE = "f90e13dc-3728-4267-bd90-43caa3f460e5";

module.exports = DreameMapParser;
