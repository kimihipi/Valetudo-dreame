const ComponentType = require("../homeassistant/ComponentType");
const crc = require("crc");
const DataType = require("../homie/DataType");
const fs = require("fs");
const HassAnchor = require("../homeassistant/HassAnchor");
const InLineHassComponent = require("../homeassistant/components/InLineHassComponent");
const Logger = require("../../Logger");
const MqttCommonAttributes = require("../MqttCommonAttributes");
const NodeMqttHandle = require("./NodeMqttHandle");
const path = require("path");
const PropertyMqttHandle = require("./PropertyMqttHandle");
const StatusStateAttribute = require("../../entities/state/attributes/StatusStateAttribute");
const ValetudoMapPngRenderer = require("../ValetudoMapPngRenderer");
const zlib = require("zlib");

class MapNodeMqttHandle extends NodeMqttHandle {
    /**
     * @param {object} options
     * @param {import("./RobotMqttHandle")} options.parent
     * @param {import("../MqttController")} options.controller MqttController instance
     * @param {import("../../core/ValetudoRobot")} options.robot
     */
    constructor(options) {
        super(Object.assign(options, {
            topicName: "MapData",
            friendlyName: "Map data",
            type: "Map",
            helpText: "This handle groups access to map data. It is only enabled if `provideMapData` is enabled in " +
                "the MQTT config."
        }));

        this.robot = options.robot;
        this.mapDataRefreshTimer = null;
        this.compressedMapCache = {map: null, promise: null, buffer: null, wrappedBuffer: null};
        this.pngDebounceTimer = null;
        /** @type {Buffer | null} */
        this.cachedPngBuffer = null;
        this.pngHandle = null;
        this.robotWasActive = false;
        /** @type {number | null} */
        this.lastMapRenderHash = null;

        this.registerChild(
            new PropertyMqttHandle({
                parent: this,
                controller: this.controller,
                topicName: "map-data",
                friendlyName: "Raw map data",
                datatype: DataType.STRING,
                format: "json, but deflated",
                getter: async () => {
                    return this.getMapData(false);
                }
            })
        );

        this.registerChild(
            new PropertyMqttHandle({
                parent: this,
                controller: this.controller,
                topicName: "segments",
                friendlyName: "Map segments",
                datatype: DataType.STRING,
                format: "json",
                getter: async () => {
                    if (this.robot.state.map === null || !(this.controller.currentConfig.customizations.provideMapData ?? true)|| !this.controller.isInitialized) {
                        return {};
                    }

                    const res = {};
                    for (const segment of this.robot.state.map.getSegments()) {
                        res[segment.id] = segment.name ?? segment.id;
                    }

                    await this.controller.hassAnchorProvider.getAnchor(
                        HassAnchor.ANCHOR.MAP_SEGMENTS_LEN
                    ).post(Object.keys(res).length);

                    await this.controller.hassAnchorProvider.getAnchor(
                        HassAnchor.ANCHOR.MAP_SEGMENTS
                    ).post(res);

                    return res;
                },
                helpText: "This property contains a JSON mapping of segment IDs to segment names."
            }).also((prop) => {
                this.controller.withHass((hass) => {
                    prop.attachHomeAssistantComponent(
                        new InLineHassComponent({
                            hass: hass,
                            robot: this.robot,
                            name: "MapSegments",
                            friendlyName: "Map segments",
                            componentType: ComponentType.SENSOR,
                            baseTopicReference: this.controller.hassAnchorProvider.getTopicReference(
                                HassAnchor.REFERENCE.HASS_MAP_SEGMENTS_STATE
                            ),
                            autoconf: {
                                state_topic: this.controller.hassAnchorProvider.getTopicReference(
                                    HassAnchor.REFERENCE.HASS_MAP_SEGMENTS_STATE
                                ),
                                icon: "mdi:vector-selection",
                                json_attributes_topic: prop.getBaseTopic(),
                                json_attributes_template: "{{ value }}"
                            },
                            topics: {
                                "": this.controller.hassAnchorProvider.getAnchor(
                                    HassAnchor.ANCHOR.MAP_SEGMENTS_LEN
                                )
                            }
                        })
                    );
                });
            })
        );

        this.controller.withHass((hass) => {
            this.registerChild(
                new PropertyMqttHandle({
                    parent: this,
                    controller: this.controller,
                    topicName: "map-data-hass",
                    friendlyName: "Raw map data for Home Assistant",
                    datatype: DataType.STRING,
                    getter: async () => {
                        return this.getMapData(true);
                    },
                    helpText: "This handle is added automatically if Home Assistant autodiscovery is enabled. It " +
                        "provides a map embedded in a PNG image that recommends installing the Valetudo Lovelace card."
                }).also((prop) => {
                    prop.attachHomeAssistantComponent(
                        new InLineHassComponent({
                            hass: hass,
                            robot: this.robot,
                            name: "MapData",
                            friendlyName: "Map data",
                            componentType: ComponentType.CAMERA,
                            autoconf: {
                                topic: prop.getBaseTopic()
                            }
                        })
                    );
                })
            );
        });

        if ((/** @type {any} */ (this.controller.currentConfig?.customizations))?.provideRenderedMap ?? false) {
            this.pngHandle = new PropertyMqttHandle({
                parent: this,
                controller: this.controller,
                topicName: "map-data-png",
                friendlyName: "Map",
                datatype: DataType.STRING,
                getter: async () => {
                    return this.cachedPngBuffer;
                },
            }).also((prop) => {
                this.controller.withHass((hass) => {
                    prop.attachHomeAssistantComponent(
                        new InLineHassComponent({
                            hass: hass,
                            robot: this.robot,
                            name: "Map",
                            friendlyName: "Map",
                            componentType: ComponentType.CAMERA,
                            autoconf: {
                                topic: prop.getBaseTopic()
                            }
                        })
                    );
                });
            });
            this.registerChild(this.pngHandle);

            // Publish an initial render shortly after MQTT settles so HA has a
            // retained image immediately, without waiting for the first debounce.
            if (this.robot.state.map !== null) {
                setTimeout(() => this._renderAndPublishPng(), 2_000);
            }
        }
    }

    /**
     * @returns {number}
     */
    getQoS() {
        // This shall prevent resource issues for the MQTT broker as maps can be quite heavy
        // and might be cached indefinitely with AT_LEAST_ONCE
        return MqttCommonAttributes.QOS.AT_MOST_ONCE;
    }

    async deconfigure(options) {
        clearTimeout(this.mapDataRefreshTimer);
        clearTimeout(this.pngDebounceTimer);
        this.mapDataRefreshTimer = null;
        this.pngDebounceTimer = null;
        this.compressedMapCache = {map: null, promise: null, buffer: null, wrappedBuffer: null};
        await super.deconfigure(options);
    }

    /**
     * Called by MqttController on map updated.
     *
     * @public
     */
    onMapUpdated() {
        if (!this.controller.isInitialized || this.robot.state.map === null) {
            return;
        }

        const isActive = this.robot.state
            .getFirstMatchingAttributeByConstructor(StatusStateAttribute)
            ?.isActiveState ?? false;

        const mapDataDelay = isActive ? 5_000 : 60_000;
        if (this.mapDataRefreshTimer === null) {
            this.mapDataRefreshTimer = setTimeout(() => {
                this.mapDataRefreshTimer = null;
                this.refresh().catch(err => {
                    Logger.error("Error during MQTT map handle refresh", err);
                });
            }, mapDataDelay);
        }

        if (this.pngHandle === null) {
            return;
        }

        // 5s while cleaning; 5s on the first update after docking (captures
        // final position); 60s for all subsequent idle updates.
        const delay = (isActive || this.robotWasActive) ? 5_000 : 60_000;
        this.robotWasActive = isActive;

        clearTimeout(this.pngDebounceTimer);
        this.pngDebounceTimer = setTimeout(() => {
            this.pngDebounceTimer = null;
            this._renderAndPublishPng();
        }, delay);
    }

    /**
     * Cheap fingerprint of the parts of the map that affect the rendered PNG.
     * Covers robot position/angle and each visible layer's extent + pixel count.
     * Deliberately excludes full pixel data — O(entities + layers), not O(pixels).
     *
     * @private
     * @param {import("../../entities/map/ValetudoMap")} map
     * @returns {number}
     */
    _computeMapRenderHash(map) {
        const parts = map.entities
            .map(e => `${e.type}:${e.points.join(",")}:${/** @type {any} */ (e.metaData)?.angle ?? ""}`)
            .join("|");
        const layers = map.layers
            .filter(l => !l.metaData.hidden)
            .map(l => {
                const d = l.dimensions;
                return `${l.type}:${d?.pixelCount ?? 0}:${d?.x.min ?? ""}:${d?.y.min ?? ""}:${d?.x.max ?? ""}:${d?.y.max ?? ""}`;
            })
            .join("|");
        return crc.crc32(`${parts}||${layers}`);
    }

    /**
     * @private
     */
    _renderAndPublishPng() {
        const map = this.robot.state.map;
        if (map === null || !this.controller.isInitialized || this.pngHandle === null) {
            return;
        }

        const hash = this._computeMapRenderHash(map);
        if (hash === this.lastMapRenderHash) {
            return;
        }

        ValetudoMapPngRenderer.render({
            ...map,
            layers: map.layers.filter(l => !l.metaData.hidden),
        }).then(buf => {
            if (!this.controller.isInitialized || this.pngHandle === null) {
                return;
            }
            this.lastMapRenderHash = hash;
            this.cachedPngBuffer = buf;
            return this.controller.refresh(this.pngHandle);
        }).catch(err => {
            Logger.error("Error rendering/publishing PNG map", err);
        });
    }

    /**
     * @private
     * @param {boolean} wrapInPng
     * @return {Promise<Buffer|null>}
     */
    async getMapData(wrapInPng) {
        if (this.robot.state.map === null || !(this.controller.currentConfig.customizations.provideMapData ?? true) || !this.controller.isInitialized) {
            return null;
        }
        try {
            const map = this.robot.state.map;
            if (this.compressedMapCache.map !== map) {
                const mapForMqtt = {
                    ...map,
                    layers: map.layers.filter(l => !l.metaData.hidden)
                };
                this.compressedMapCache = {
                    map: map,
                    promise: new Promise((resolve, reject) => {
                        zlib.deflate(JSON.stringify(mapForMqtt), (err, buf) => {
                            if (err !== null) {
                                reject(err);
                            } else {
                                resolve(buf);
                            }
                        });
                    }),
                    buffer: null,
                    wrappedBuffer: null
                };
            }
            const cache = this.compressedMapCache;
            if (cache.buffer === null) {
                cache.buffer = await cache.promise;
                cache.promise = null;
            }
            if (!wrapInPng) {
                return cache.buffer;
            }
            if (cache.wrappedBuffer === null) {
                cache.wrappedBuffer = MapNodeMqttHandle.WRAP_MAP_DATA(cache.buffer);
            }
            return cache.wrappedBuffer;
        } catch (err) {
            Logger.error("Error while deflating map data for mqtt publish", err);
        }
        return null;
    }

    /**
     * @param {Buffer} compressedMap
     * @return {Buffer}
     */
    static WRAP_MAP_DATA(compressedMap) {
        const length = Buffer.alloc(4);
        const checksum = Buffer.alloc(4);
        const textChunkData = Buffer.concat([
            PNG_WRAPPER.TEXT_CHUNK_TYPE,
            PNG_WRAPPER.TEXT_CHUNK_METADATA,
            compressedMap
        ]);
        length.writeInt32BE(PNG_WRAPPER.TEXT_CHUNK_METADATA.length + compressedMap.length, 0);
        checksum.writeUInt32BE(crc.crc32(textChunkData), 0);
        return Buffer.concat([
            PNG_WRAPPER.IMAGE_WITHOUT_END_CHUNK,
            length,
            textChunkData,
            checksum,
            PNG_WRAPPER.END_CHUNK
        ]);
    }


}


const PNG_WRAPPER = {
    TEXT_CHUNK_TYPE: Buffer.from("zTXt"),
    TEXT_CHUNK_METADATA: Buffer.from("ValetudoMap\0\0"),
    IMAGE: fs.readFileSync(path.join(__dirname, "../../res/valetudo_home_assistant_mqtt_wrapper.png"))
};
PNG_WRAPPER.IMAGE_WITHOUT_END_CHUNK = PNG_WRAPPER.IMAGE.subarray(0, PNG_WRAPPER.IMAGE.length - 12);
//The PNG IEND chunk is always the last chunk and consists of a 4-byte length, the 4-byte chunk type, 0-byte chunk data and a 4-byte crc
PNG_WRAPPER.END_CHUNK = PNG_WRAPPER.IMAGE.subarray(PNG_WRAPPER.IMAGE.length - 12);

module.exports = MapNodeMqttHandle;
