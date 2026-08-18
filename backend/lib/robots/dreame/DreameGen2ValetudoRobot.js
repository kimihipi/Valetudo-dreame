const capabilities = require("./capabilities");

const ConsumableMonitoringCapability = require("../../core/capabilities/ConsumableMonitoringCapability");
const DreameAutomaticControlCapability = require("./capabilities/DreameAutomaticControlCapability");
const DreameAutomaticSubModeControlCapability = require("./capabilities/DreameAutomaticSubModeControlCapability");
const DreameConst = require("./DreameConst");
const DreameMiotServices = require("./DreameMiotServices");
const DreameUtils = require("./DreameUtils");
const DreameValetudoRobot = require("./DreameValetudoRobot");
const entities = require("../../entities");
const ErrorStateValetudoEvent = require("../../valetudo_events/events/ErrorStateValetudoEvent");
const LinuxTools = require("../../utils/LinuxTools");
const Logger = require("../../Logger");
const MopAttachmentReminderValetudoEvent = require("../../valetudo_events/events/MopAttachmentReminderValetudoEvent");
const MopDockDetergentControlCapability = require("../../core/capabilities/MopDockDetergentControlCapability");
const MopDockMopCleaningFrequencyControlCapability = require("../../core/capabilities/MopDockMopCleaningFrequencyControlCapability");
const MopDockMopWashIntensityControlCapability = require("../../core/capabilities/MopDockMopWashIntensityControlCapability");
const ValetudoRestrictedZone = require("../../entities/core/ValetudoRestrictedZone");
const ValetudoSelectionPreset = require("../../entities/core/ValetudoSelectionPreset");

const stateAttrs = entities.state.attributes;


const MIOT_SERVICES = DreameMiotServices["GEN2"];
const GEN2_STATUS_CHARGING_COMPLETED = 13;
const CLEANUP_OUTCOME_GRACE_MS = 2_000;



class DreameGen2ValetudoRobot extends DreameValetudoRobot {
    /**
     *
     * @param {object} options
     * @param {object} options.operationModes
     * @param {boolean} [options.detailedAttachmentReport]
     * @param {boolean} [options.highResolutionWaterGrades]
     * @param {import("../../Configuration")} options.config
     * @param {import("../../ValetudoEventStore")} options.valetudoEventStore
     */
    constructor(options) {
        super(
            Object.assign(
                {},
                {
                    operationModes: DreameGen2ValetudoRobot.OPERATION_MODES,
                    miotServices: {
                        MAP: MIOT_SERVICES.MAP
                    }
                },
                options,
            )
        );

        this.highResolutionWaterGrades = !!options.highResolutionWaterGrades;
        this.waterGrades = this.highResolutionWaterGrades ? DreameGen2ValetudoRobot.HIGH_RESOLUTION_WATER_GRADES : DreameValetudoRobot.WATER_GRADES;

        this.detailedAttachmentReport = options.detailedAttachmentReport === true;

        /** @type {Array<{siid: number, piid: number}>} */
        this.statePropertiesToPoll = this.getStatePropertiesToPoll();
        this.statePropertiesToPoll.push(
            {
                siid: MIOT_SERVICES.VACUUM_2.SIID,
                piid: MIOT_SERVICES.VACUUM_2.PROPERTIES.CLEANING_PAUSED.PIID
            },
            {
                siid: MIOT_SERVICES.VACUUM_2.SIID,
                piid: MIOT_SERVICES.VACUUM_2.PROPERTIES.CLEANING_TIME.PIID
            },
            {
                siid: MIOT_SERVICES.VACUUM_2.SIID,
                piid: MIOT_SERVICES.VACUUM_2.PROPERTIES.CLEANING_PROGRESS.PIID
            }
        );
        if (this.statePropertiesToPoll.some(property =>
            property.siid === MIOT_SERVICES.VACUUM_2.SIID &&
            property.piid === MIOT_SERVICES.VACUUM_2.PROPERTIES.MOP_DOCK_STATUS.PIID
        )) {
            this.statePropertiesToPoll.push(
                {
                    siid: MIOT_SERVICES.VACUUM_2.SIID,
                    piid: MIOT_SERVICES.VACUUM_2.PROPERTIES.LOW_WATER_WARNING.PIID
                },
                {
                    siid: MIOT_SERVICES.VACUUM_2.SIID,
                    piid: MIOT_SERVICES.VACUUM_2.PROPERTIES.MOP_DRYING_TIME.PIID
                },
                {
                    siid: MIOT_SERVICES.VACUUM_2.SIID,
                    piid: MIOT_SERVICES.VACUUM_2.PROPERTIES.DRYING_PROGRESS.PIID
                }
            );
        }

        this.ephemeralState = {
            mode: 0, //Idle
            gen2StatusValue: undefined,
            taskStatus: 0, // None
            cleanupTaskActive: false,
            cleanupOutcomeExpectedUntil: 0,
            isCharging: false,
            errorCode: "0",
            cleaningPaused: undefined,
            cleaningProgress: undefined,
            cleaningElapsedSeconds: undefined,
            mopDockState: undefined, // Might not be set depending on model
            autoEmptyDockState: undefined, // Might also not be set depending on model
            dryingProgress: undefined,
            mopDryingTimeHours: undefined,
            cleanGeniusSmartHost: 0,
            cleanGeniusMode: 2 // default: vacuum_and_mop
        };

        this.registerCapability(new capabilities.DreameBasicControlCapability({
            robot: this,
            miot_actions: {
                start: {
                    siid: MIOT_SERVICES.VACUUM_1.SIID,
                    aiid: MIOT_SERVICES.VACUUM_1.ACTIONS.RESUME.AIID
                },
                stop: {
                    siid: MIOT_SERVICES.VACUUM_2.SIID,
                    aiid: MIOT_SERVICES.VACUUM_2.ACTIONS.STOP.AIID
                },
                pause: {
                    siid: MIOT_SERVICES.VACUUM_1.SIID,
                    aiid: MIOT_SERVICES.VACUUM_1.ACTIONS.PAUSE.AIID
                },
                home: {
                    siid: MIOT_SERVICES.BATTERY.SIID,
                    aiid: MIOT_SERVICES.BATTERY.ACTIONS.START_CHARGE.AIID
                }
            }
        }));

        this.registerCapability(new capabilities.DreameFanSpeedControlCapability({
            robot: this,
            presets: Object.keys(DreameValetudoRobot.FAN_SPEEDS).map(k => {
                return new ValetudoSelectionPreset({name: k, value: DreameValetudoRobot.FAN_SPEEDS[k]});
            }),
            siid: MIOT_SERVICES.VACUUM_2.SIID,
            piid: MIOT_SERVICES.VACUUM_2.PROPERTIES.FAN_SPEED.PIID
        }));

        this.registerCapability(new capabilities.DreameLocateCapability({
            robot: this,
            siid: MIOT_SERVICES.AUDIO.SIID,
            aiid: MIOT_SERVICES.AUDIO.ACTIONS.LOCATE.AIID
        }));

        this.registerCapability(new capabilities.DreameMapSegmentEditCapability({
            robot: this,
            miot_actions: {
                map_edit: {
                    siid: MIOT_SERVICES.MAP.SIID,
                    aiid: MIOT_SERVICES.MAP.ACTIONS.EDIT.AIID
                }
            },
            miot_properties: {
                mapDetails: {
                    piid: MIOT_SERVICES.MAP.PROPERTIES.MAP_DETAILS.PIID
                },
                actionResult: {
                    piid: MIOT_SERVICES.MAP.PROPERTIES.ACTION_RESULT.PIID
                }
            }
        }));

        this.registerCapability(new capabilities.DreameMapSegmentRenameCapability({
            robot: this,
            miot_actions: {
                map_edit: {
                    siid: MIOT_SERVICES.MAP.SIID,
                    aiid: MIOT_SERVICES.MAP.ACTIONS.EDIT.AIID
                }
            },
            miot_properties: {
                mapDetails: {
                    piid: MIOT_SERVICES.MAP.PROPERTIES.MAP_DETAILS.PIID
                },
                actionResult: {
                    piid: MIOT_SERVICES.MAP.PROPERTIES.ACTION_RESULT.PIID
                }
            }
        }));

        this.registerCapability(new capabilities.DreameMapResetCapability({
            robot: this,
            miot_actions: {
                map_edit: {
                    siid: MIOT_SERVICES.MAP.SIID,
                    aiid: MIOT_SERVICES.MAP.ACTIONS.EDIT.AIID
                }
            },
            miot_properties: {
                mapDetails: {
                    piid: MIOT_SERVICES.MAP.PROPERTIES.MAP_DETAILS.PIID
                },
                actionResult: {
                    piid: MIOT_SERVICES.MAP.PROPERTIES.ACTION_RESULT.PIID
                }
            }
        }));

        this.registerCapability(new capabilities.DreameCombinedVirtualRestrictionsCapability({
            robot: this,
            supportedRestrictedZoneTypes: [
                ValetudoRestrictedZone.TYPE.REGULAR,
                ValetudoRestrictedZone.TYPE.MOP
            ],
            miot_actions: {
                map_edit: {
                    siid: MIOT_SERVICES.MAP.SIID,
                    aiid: MIOT_SERVICES.MAP.ACTIONS.EDIT.AIID
                }
            },
            miot_properties: {
                mapDetails: {
                    piid: MIOT_SERVICES.MAP.PROPERTIES.MAP_DETAILS.PIID
                },
                actionResult: {
                    piid: MIOT_SERVICES.MAP.PROPERTIES.ACTION_RESULT.PIID
                }
            }
        }));

        this.registerCapability(new capabilities.DreameCarpetZonesCapability({
            robot: this,
            carpetIdsSupported: this.carpetIdsSupported,
            miot_actions: {
                map_edit: {
                    siid: MIOT_SERVICES.MAP.SIID,
                    aiid: MIOT_SERVICES.MAP.ACTIONS.EDIT.AIID
                }
            },
            miot_properties: {
                mapDetails: {
                    piid: MIOT_SERVICES.MAP.PROPERTIES.MAP_DETAILS.PIID
                },
                actionResult: {
                    piid: MIOT_SERVICES.MAP.PROPERTIES.ACTION_RESULT.PIID
                }
            }
        }));

        this.registerCapability(new capabilities.DreameSpeakerVolumeControlCapability({
            robot: this,
            siid: MIOT_SERVICES.AUDIO.SIID,
            piid: MIOT_SERVICES.AUDIO.PROPERTIES.VOLUME.PIID
        }));
        this.registerCapability(new capabilities.DreameSpeakerTestCapability({
            robot: this,
            siid: MIOT_SERVICES.AUDIO.SIID,
            aiid: MIOT_SERVICES.AUDIO.ACTIONS.VOLUME_TEST.AIID
        }));

        this.registerCapability(new capabilities.DreamePendingMapChangeHandlingCapability({
            robot: this,
            miot_actions: {
                map_edit: {
                    siid: MIOT_SERVICES.MAP.SIID,
                    aiid: MIOT_SERVICES.MAP.ACTIONS.EDIT.AIID
                }
            },
            miot_properties: {
                mapDetails: {
                    piid: MIOT_SERVICES.MAP.PROPERTIES.MAP_DETAILS.PIID
                },
                actionResult: {
                    piid: MIOT_SERVICES.MAP.PROPERTIES.ACTION_RESULT.PIID
                }
            }
        }));

        this.registerCapability(new capabilities.DreameTotalStatisticsCapability({
            robot: this,
            miot_properties: {
                time: {
                    siid: MIOT_SERVICES.TOTAL_STATISTICS.SIID,
                    piid: MIOT_SERVICES.TOTAL_STATISTICS.PROPERTIES.TIME.PIID
                },
                area: {
                    siid: MIOT_SERVICES.TOTAL_STATISTICS.SIID,
                    piid: MIOT_SERVICES.TOTAL_STATISTICS.PROPERTIES.AREA.PIID
                },
                count: {
                    siid: MIOT_SERVICES.TOTAL_STATISTICS.SIID,
                    piid: MIOT_SERVICES.TOTAL_STATISTICS.PROPERTIES.COUNT.PIID
                }
            }
        }));

        this.registerCapability(new capabilities.DreameCurrentStatisticsCapability({
            robot: this,
            miot_properties: {
                time: {
                    siid: MIOT_SERVICES.VACUUM_2.SIID,
                    piid: MIOT_SERVICES.VACUUM_2.PROPERTIES.CLEANING_TIME.PIID
                },
                area: {
                    siid: MIOT_SERVICES.VACUUM_2.SIID,
                    piid: MIOT_SERVICES.VACUUM_2.PROPERTIES.CLEANING_AREA.PIID
                }
            }
        }));

        [
            capabilities.DreameVoicePackManagementCapability,
            capabilities.DreameHighResolutionManualControlCapability,
            capabilities.DreameDoNotDisturbCapability,
            capabilities.DreameEnergySavingChargingCapability
        ].forEach(capability => {
            this.registerCapability(new capability({robot: this}));
        });

    }

    onIncomingCloudMessage(msg) {
        if (super.onIncomingCloudMessage(msg) === true) {
            return true;
        }

        switch (msg.method) {
            case "properties_changed": {
                msg.params.forEach(e => {
                    switch (e.siid) {
                        case MIOT_SERVICES.MAP.SIID:
                            switch (e.piid) {
                                case MIOT_SERVICES.MAP.PROPERTIES.MAP_DATA.PIID:
                                    /*
                                        Most of the time, these will be P-Frames, which Valetudo ignores, however
                                        sometimes, they may be I-Frames as well. Usually that's right when a new map
                                        is being created, as then the map data is small enough to fit into a miio msg
                                     */
                                    this.preprocessAndParseMap(e.value).catch(err => {
                                        Logger.warn("Error while trying to parse map update", err);
                                    });
                                    break;
                            }
                            break;
                        case MIOT_SERVICES.VACUUM_1.SIID:
                        case MIOT_SERVICES.VACUUM_2.SIID:
                        case MIOT_SERVICES.BATTERY.SIID:
                        case MIOT_SERVICES.MAIN_BRUSH.SIID:
                        case MIOT_SERVICES.SIDE_BRUSH.SIID:
                        case MIOT_SERVICES.FILTER.SIID:
                        case MIOT_SERVICES.SENSOR.SIID:
                        case MIOT_SERVICES.MOP.SIID:
                        case MIOT_SERVICES.SECONDARY_FILTER.SIID:
                        case MIOT_SERVICES.DETERGENT.SIID:
                        case MIOT_SERVICES.WHEEL.SIID:
                        case MIOT_SERVICES.MOP_EXPANSION.SIID:
                        case MIOT_SERVICES.MISC_STATES.SIID:
                        case MIOT_SERVICES.AUTO_EMPTY_DOCK.SIID:
                            this.parseAndUpdateState([e]);
                            break;
                        case MIOT_SERVICES.DEVICE.SIID:
                        case 99: //This seems to be a duplicate of the device service
                            //Intentionally ignored
                            break;
                        case MIOT_SERVICES.AUDIO.SIID:
                        case MIOT_SERVICES.DND.SIID:
                        case MIOT_SERVICES.PERSISTENT_MAPS.SIID:
                            //Intentionally ignored since we only poll that info when required and therefore don't care about updates
                            break;
                        case MIOT_SERVICES.TIMERS.SIID:
                        case MIOT_SERVICES.TOTAL_STATISTICS.SIID:
                            //Intentionally left blank (for now?)
                            break;
                        case MIOT_SERVICES.SILVER_ION.SIID:
                        case 21: //Something else that also seems to be some kind of consumable?
                            //Intentionally ignored for now, because I have no idea what that should be or where it could be located
                            //TODO: figure out
                            break;
                        case 10001:
                            /*
                                Seems to have something to do with the AI camera
                                Sample value: {"operType":"properties_changed","operation":"monitor","result":0,"status":0}
                             */
                            //Intentionally ignored
                            break;
                        default:
                            Logger.warn("Unhandled property change ", e);
                    }
                });

                this.sendCloud({id: msg.id, "result":"ok"}).catch((err) => {
                    Logger.warn("Error while sending cloud ack", err);
                });
                return true;
            }
            case "props":
                if (msg.params && msg.params.ota_state) {
                    this.sendCloud({id: msg.id, "result":"ok"}).catch((err) => {
                        Logger.warn("Error while sending cloud ack", err);
                    });
                    return true;
                }
                break;
            case "event_occured": {
                const outcome = DreameGen2ValetudoRobot.PARSE_CLEANUP_OUTCOME(msg.params);
                if (outcome !== undefined && this.isCleanupOutcomeExpected()) {
                    this.ephemeralState.cleanupTaskActive = false;
                    this.ephemeralState.cleanupOutcomeExpectedUntil = 0;
                    const command = this.state.getFirstMatchingAttributeByConstructor(
                        stateAttrs.CleaningCommandStateAttribute
                    );
                    const Command = stateAttrs.CleaningCommandStateAttribute;
                    const commandOwnsOutcome = [Command.COMMAND.STOP, Command.COMMAND.HOME].includes(command?.command) &&
                        [Command.STATE.PENDING, Command.STATE.ACCEPTED].includes(command?.state);
                    if (!commandOwnsOutcome) {
                        this.emitOperationOutcome(outcome);
                    }
                } else if (outcome !== undefined) {
                    Logger.debug("Ignoring unexpected Dreame cleanup event");
                } else {
                    Logger.debug("Unable to classify Dreame cleanup event");
                }

                this.sendCloud({id: msg.id, "result":"ok"}).catch((err) => {
                    Logger.warn("Error while sending cloud ack", err);
                });
                return true;
            }
            case "ali_lic": {
                // ignore
                return true;
            }
            case "vendor_lic": {
                // ignore
                return true;
            }
            case "lwt": {
                // ignore
                return true;
            }
            case "_sync.update_vacuum_mapinfo": {
                // ignore
                return true;
            }
            case "dev_auth":
                // actually replying to it leads to timeouts for reasons I do not care enough about to debug
                // However, not replying at all will not make the firmware unhappy, so ignore it is
                return true;
        }

        return false;
    }

    isCleanupOutcomeExpected() {
        return this.ephemeralState.cleanupTaskActive === true ||
            this.ephemeralState.cleanupOutcomeExpectedUntil >= Date.now();
    }

    updateCleanupTaskStatus(taskStatusValue) {
        const taskStatus = DreameGen2ValetudoRobot.TASK_STATUS_MAP[taskStatusValue];
        if ([1, 2, 3, 4].includes(taskStatusValue)) {
            this.ephemeralState.cleanupTaskActive = true;
            this.ephemeralState.cleanupOutcomeExpectedUntil = 0;
        } else if (taskStatusValue === 0 && this.ephemeralState.cleanupTaskActive) {
            this.ephemeralState.cleanupTaskActive = false;
            this.ephemeralState.cleanupOutcomeExpectedUntil = Date.now() + CLEANUP_OUTCOME_GRACE_MS;
        } else if (taskStatus?.cleaning !== true) {
            this.ephemeralState.cleanupTaskActive = false;
            this.ephemeralState.cleanupOutcomeExpectedUntil = 0;
        }
    }

    /**
     * Parse only the terminal result from a Dreame cleanup event. Other cleanup-record fields
     * intentionally remain untouched until their local payloads and persistence model are known.
     *
     * @param {object} params
     * @returns {"completed"|"cancelled"|"stopped"|"failed"|undefined}
     */
    static PARSE_CLEANUP_OUTCOME(params) {
        if (params?.siid !== MIOT_SERVICES.VACUUM_2.SIID || !Array.isArray(params.arguments)) {
            return undefined;
        }

        const statusProperty = params.arguments.find(argument =>
            argument.piid === MIOT_SERVICES.VACUUM_2.PROPERTIES.CLEAN_LOG_STATUS.PIID);
        if (statusProperty === undefined) {
            return undefined;
        }

        const rawStatus = statusProperty.value;
        if (!Number.isInteger(rawStatus) &&
            !(typeof rawStatus === "string" && /^[0-3]$/.test(rawStatus))) {
            return undefined;
        }
        const status = Number(rawStatus);
        if (status === 1) {
            return "completed";
        }
        if (status === 2) {
            return "cancelled";
        }
        if (status === 3) {
            return "failed";
        }
        if (status !== 0) {
            return undefined;
        }

        const properties = params.arguments.find(argument =>
            argument.piid === MIOT_SERVICES.VACUUM_2.PROPERTIES.ADDITIONAL_CLEANUP_PROPERTIES.PIID)?.value;
        const abnormalEnd = DreameGen2ValetudoRobot.PARSE_ABNORMAL_END(properties);

        return abnormalEnd === undefined ? undefined : abnormalEnd ? "failed" : "completed";
    }

    /**
     * @param {object|string|undefined} value
     * @returns {boolean|undefined}
     */
    static PARSE_ABNORMAL_END(value) {
        if (value === undefined) {
            return false;
        }
        if (value === null || value === "") {
            return undefined;
        }

        try {
            const properties = typeof value === "string" ? JSON.parse(value) : value;
            if (typeof properties !== "object" || properties === null || Array.isArray(properties)) {
                return undefined;
            }
            if (properties.abnormal_end === undefined) {
                return false;
            }
            if (properties.abnormal_end === null || properties.abnormal_end === "") {
                return undefined;
            }

            const parsed = typeof properties.abnormal_end === "string" ?
                JSON.parse(properties.abnormal_end) : properties.abnormal_end;
            const reason = Array.isArray(parsed) ? parsed[0] : parsed;
            if (!Number.isInteger(reason) &&
                !(typeof reason === "string" && /^-?\d+$/.test(reason))) {
                return undefined;
            }

            return Number(reason) !== 0;
        } catch (e) {
            return undefined;
        }
    }

    get supportsExtendedStatus() {
        return false;
    }

    get carpetIdsSupported() {
        return false;
    }

    /**
     * May be extended by children
     *
     * @return {Array<{piid: number, siid: number}>}
     */
    getStatePropertiesToPoll() {
        const properties = [
            {
                siid: MIOT_SERVICES.VACUUM_2.SIID,
                piid: MIOT_SERVICES.VACUUM_2.PROPERTIES.MODE.PIID
            },
            {
                siid: MIOT_SERVICES.VACUUM_2.SIID,
                piid: MIOT_SERVICES.VACUUM_2.PROPERTIES.TASK_STATUS.PIID
            },
            {
                siid: MIOT_SERVICES.VACUUM_2.SIID,
                piid: MIOT_SERVICES.VACUUM_2.PROPERTIES.FAN_SPEED.PIID
            },
            {
                siid: MIOT_SERVICES.VACUUM_2.SIID,
                piid: MIOT_SERVICES.VACUUM_2.PROPERTIES.WATER_TANK_ATTACHMENT.PIID
            },
            {
                siid: MIOT_SERVICES.VACUUM_2.SIID,
                piid: MIOT_SERVICES.VACUUM_2.PROPERTIES.ERROR_CODE.PIID
            },
            {
                siid: MIOT_SERVICES.BATTERY.SIID,
                piid: MIOT_SERVICES.BATTERY.PROPERTIES.LEVEL.PIID
            },
            {
                siid: MIOT_SERVICES.BATTERY.SIID,
                piid: MIOT_SERVICES.BATTERY.PROPERTIES.CHARGING.PIID
            }
        ];

        if (this.highResolutionWaterGrades) {
            properties.push({
                siid: MIOT_SERVICES.MOP_EXPANSION.SIID,
                piid: MIOT_SERVICES.MOP_EXPANSION.PROPERTIES.HIGH_RES_WATER_USAGE.PIID
            });
        } else {
            properties.push({
                siid: MIOT_SERVICES.VACUUM_2.SIID,
                piid: MIOT_SERVICES.VACUUM_2.PROPERTIES.WATER_USAGE.PIID
            });
        }

        if (this.supportsExtendedStatus) {
            properties.push({
                siid: MIOT_SERVICES.VACUUM_1.SIID,
                piid: MIOT_SERVICES.VACUUM_1.PROPERTIES.STATUS.PIID
            });
        }

        return properties;
    }

    async pollState() {
        const response = await this.miotHelper.readProperties(this.statePropertiesToPoll);

        if (response) {
            this.parseAndUpdateState(response);
        }

        return this.state;
    }


    parseAndUpdateState(data) {
        if (!Array.isArray(data)) {
            Logger.error("Received non-array state", data);
            return;
        }

        let statusNeedsUpdate = false;
        let dockStatusNeedsUpdate = false;
        let dockProgressNeedsUpdate = false;

        for (const elem of data) {
            switch (elem.siid) {
                case MIOT_SERVICES.VACUUM_1.SIID: {
                    if (this.supportsExtendedStatus) {
                        switch (elem.piid) {
                            case MIOT_SERVICES.VACUUM_1.PROPERTIES.STATUS.PIID: {
                                this.ephemeralState.gen2StatusValue = elem.value;
                                if (elem.value === GEN2_STATUS_CHARGING_COMPLETED) {
                                    const battery = this.state.getFirstMatchingAttribute({
                                        attributeClass: stateAttrs.BatteryStateAttribute.name
                                    });
                                    if (battery) {
                                        this.state.upsertFirstMatchingAttribute(new stateAttrs.BatteryStateAttribute({
                                            level: battery.level,
                                            flag: stateAttrs.BatteryStateAttribute.FLAG.CHARGED
                                        }));
                                    }
                                }
                                statusNeedsUpdate = true;
                                break;
                            }
                        }
                    }
                    break;
                }

                case MIOT_SERVICES.VACUUM_2.SIID: {
                    switch (elem.piid) {
                        case MIOT_SERVICES.VACUUM_2.PROPERTIES.MODE.PIID: {
                            this.ephemeralState.mode = elem.value;

                            statusNeedsUpdate = true;
                            break;
                        }
                        case MIOT_SERVICES.VACUUM_2.PROPERTIES.ERROR_CODE.PIID: {
                            this.ephemeralState.errorCode = elem.value ?? "";

                            statusNeedsUpdate = true;
                            break;
                        }
                        case MIOT_SERVICES.VACUUM_2.PROPERTIES.TASK_STATUS.PIID: {
                            const previousTaskStatus = DreameGen2ValetudoRobot.TASK_STATUS_MAP[
                                this.ephemeralState.taskStatus
                            ];
                            const nextTaskStatus = DreameGen2ValetudoRobot.TASK_STATUS_MAP[elem.value];
                            if (nextTaskStatus?.cleaning === true && previousTaskStatus?.cleaning !== true) {
                                this.ephemeralState.cleaningProgress = undefined;
                                this.ephemeralState.cleaningElapsedSeconds = undefined;
                            } else if (nextTaskStatus?.cleaning === false) {
                                this.ephemeralState.cleaningPaused = false;
                            }
                            this.updateCleanupTaskStatus(elem.value);
                            this.ephemeralState.taskStatus = elem.value;

                            statusNeedsUpdate = true;
                            break;
                        }
                        case MIOT_SERVICES.VACUUM_2.PROPERTIES.CLEANING_PAUSED.PIID: {
                            if (elem.value === 0 || elem.value === 1) {
                                this.ephemeralState.cleaningPaused = elem.value === 1;
                                statusNeedsUpdate = true;
                            }
                            break;
                        }
                        case MIOT_SERVICES.VACUUM_2.PROPERTIES.CLEANING_TIME.PIID: {
                            if (Number.isFinite(elem.value) && elem.value >= 0) {
                                this.ephemeralState.cleaningElapsedSeconds = elem.value * 60;
                                statusNeedsUpdate = true;
                            }
                            break;
                        }
                        case MIOT_SERVICES.VACUUM_2.PROPERTIES.CLEANING_PROGRESS.PIID: {
                            if (Number.isFinite(elem.value) && elem.value >= 0 && elem.value <= 100) {
                                this.ephemeralState.cleaningProgress = elem.value;
                                statusNeedsUpdate = true;
                            }
                            break;
                        }
                        case MIOT_SERVICES.VACUUM_2.PROPERTIES.FAN_SPEED.PIID: {
                            let matchingFanSpeed = Object.keys(DreameValetudoRobot.FAN_SPEEDS).find(key => {
                                return DreameValetudoRobot.FAN_SPEEDS[key] === elem.value;
                            });

                            if (matchingFanSpeed === undefined) {
                                Logger.warn(`Received unknown fan speed ${elem.value}`);
                            }

                            this.state.upsertFirstMatchingAttribute(new stateAttrs.PresetSelectionStateAttribute({
                                metaData: {
                                    rawValue: elem.value
                                },
                                type: stateAttrs.PresetSelectionStateAttribute.TYPE.FAN_SPEED,
                                value: matchingFanSpeed
                            }));
                            break;
                        }

                        case MIOT_SERVICES.VACUUM_2.PROPERTIES.WATER_USAGE.PIID: {
                            let matchingWaterGrade = Object.keys(this.waterGrades).find(key => {
                                return this.waterGrades[key] === elem.value;
                            });

                            if (matchingWaterGrade === undefined) {
                                Logger.warn(`Received unknown water grade ${elem.value}`);
                            }

                            this.state.upsertFirstMatchingAttribute(new stateAttrs.PresetSelectionStateAttribute({
                                metaData: {
                                    rawValue: elem.value
                                },
                                type: stateAttrs.PresetSelectionStateAttribute.TYPE.WATER_GRADE,
                                value: matchingWaterGrade
                            }));
                            break;
                        }
                        case MIOT_SERVICES.VACUUM_2.PROPERTIES.WATER_TANK_ATTACHMENT.PIID: {
                            const supportedAttachments = this.getModelDetails().supportedAttachments;
                            const parsedAttachmentStates = {
                                [stateAttrs.AttachmentStateAttribute.TYPE.WATERTANK]: elem.value !== 0,
                                [stateAttrs.AttachmentStateAttribute.TYPE.MOP]: elem.value !== 0,
                            };

                            if (this.detailedAttachmentReport) {
                                parsedAttachmentStates[stateAttrs.AttachmentStateAttribute.TYPE.WATERTANK] = !!(elem.value & 0b01);
                                parsedAttachmentStates[stateAttrs.AttachmentStateAttribute.TYPE.MOP] = !!(elem.value & 0b10);
                            }


                            if (supportedAttachments.includes(stateAttrs.AttachmentStateAttribute.TYPE.WATERTANK)) {
                                this.state.upsertFirstMatchingAttribute(new stateAttrs.AttachmentStateAttribute({
                                    type: stateAttrs.AttachmentStateAttribute.TYPE.WATERTANK,
                                    attached: parsedAttachmentStates[stateAttrs.AttachmentStateAttribute.TYPE.WATERTANK]
                                }));
                            }

                            if (supportedAttachments.includes(stateAttrs.AttachmentStateAttribute.TYPE.MOP)) {
                                this.state.upsertFirstMatchingAttribute(new stateAttrs.AttachmentStateAttribute({
                                    type: stateAttrs.AttachmentStateAttribute.TYPE.MOP,
                                    attached: parsedAttachmentStates[stateAttrs.AttachmentStateAttribute.TYPE.MOP]
                                }));
                            }

                            break;
                        }
                        case MIOT_SERVICES.VACUUM_2.PROPERTIES.LOW_WATER_WARNING.PIID: {
                            const supportedDockComponents = this.getModelDetails().supportedDockComponents;
                            if (Number.isInteger(elem.value) && supportedDockComponents.includes(
                                stateAttrs.DockComponentStateAttribute.TYPE.WATER_TANK_CLEAN
                            )) {
                                let value = stateAttrs.DockComponentStateAttribute.VALUE.UNKNOWN;
                                if (elem.value === 0 || elem.value === 1) {
                                    value = stateAttrs.DockComponentStateAttribute.VALUE.OK;
                                } else if (elem.value >= 2 && elem.value <= 5) {
                                    value = stateAttrs.DockComponentStateAttribute.VALUE.EMPTY;
                                } else if (elem.value === 6) {
                                    value = stateAttrs.DockComponentStateAttribute.VALUE.MISSING;
                                }
                                this.state.upsertFirstMatchingAttribute(new stateAttrs.DockComponentStateAttribute({
                                    type: stateAttrs.DockComponentStateAttribute.TYPE.WATER_TANK_CLEAN,
                                    value: value,
                                    metaData: {rawValue: elem.value}
                                }));
                            }
                            break;
                        }
                        case MIOT_SERVICES.VACUUM_2.PROPERTIES.MOP_DOCK_STATUS.PIID: {
                            if (elem.value !== 2 && this.ephemeralState.mopDockState === 2) {
                                this.ephemeralState.dryingProgress = undefined;
                            }
                            this.ephemeralState.mopDockState = elem.value;
                            dockStatusNeedsUpdate = true;

                            break;
                        }
                        case MIOT_SERVICES.VACUUM_2.PROPERTIES.MOP_DRYING_TIME.PIID: {
                            if (Number.isFinite(elem.value) && elem.value > 0) {
                                this.ephemeralState.mopDryingTimeHours = elem.value;
                                dockProgressNeedsUpdate = true;
                            }
                            break;
                        }
                        case MIOT_SERVICES.VACUUM_2.PROPERTIES.DRYING_PROGRESS.PIID: {
                            if (Number.isFinite(elem.value) && elem.value >= 0 && elem.value <= 100) {
                                this.ephemeralState.dryingProgress = elem.value;
                                dockProgressNeedsUpdate = true;
                            }
                            break;
                        }
                        case MIOT_SERVICES.VACUUM_2.PROPERTIES.MOP_DOCK_SETTINGS.PIID: {
                            const deserializedValue = DreameUtils.DESERIALIZE_MOP_DOCK_SETTINGS(elem.value);

                            let matchingOperationMode = Object.keys(this.operationModes).find(key => {
                                return this.operationModes[key] === deserializedValue.operationMode;
                            });

                            if (matchingOperationMode === undefined) {
                                Logger.warn(`Received unknown operation mode ${elem.value}`);
                            }

                            this.state.upsertFirstMatchingAttribute(new stateAttrs.PresetSelectionStateAttribute({
                                type: stateAttrs.PresetSelectionStateAttribute.TYPE.OPERATION_MODE,
                                value: matchingOperationMode
                            }));

                            if (this.capabilities[MopDockMopCleaningFrequencyControlCapability.TYPE]) {
                                const cap = this.capabilities[MopDockMopCleaningFrequencyControlCapability.TYPE];
                                const matchingFrequency = cap.presets.find(p => p.value === deserializedValue.padCleaningFrequency);
                                this.state.upsertFirstMatchingAttribute(new stateAttrs.PresetSelectionStateAttribute({
                                    metaData: { rawValue: deserializedValue.padCleaningFrequency },
                                    type: stateAttrs.PresetSelectionStateAttribute.TYPE.MOP_DOCK_MOP_CLEANING_FREQUENCY,
                                    value: matchingFrequency?.name ?? undefined
                                }));
                            }
                            break;
                        }

                        case MIOT_SERVICES.VACUUM_2.PROPERTIES.MOP_DOCK_DETERGENT.PIID: {
                            if (this.capabilities[MopDockDetergentControlCapability.TYPE]) {
                                let detergentValue;
                                if (elem.value === 3) {
                                    // New cartridge installed sentinel: auto-reset to 1 and treat as "on"
                                    this.miotHelper.writeProperty(
                                        MIOT_SERVICES.VACUUM_2.SIID,
                                        MIOT_SERVICES.VACUUM_2.PROPERTIES.MOP_DOCK_DETERGENT.PIID,
                                        1
                                    ).catch(e => Logger.warn("Error while auto-resetting detergent sentinel", e));
                                    detergentValue = "on";
                                } else {
                                    const cap = this.capabilities[MopDockDetergentControlCapability.TYPE];
                                    const matched = cap.presets.find(p => p.value === elem.value);
                                    detergentValue = matched?.name;
                                }
                                if (detergentValue !== undefined) {
                                    this.state.upsertFirstMatchingAttribute(new stateAttrs.PresetSelectionStateAttribute({
                                        metaData: { rawValue: elem.value },
                                        type: stateAttrs.PresetSelectionStateAttribute.TYPE.MOP_DOCK_DETERGENT,
                                        value: detergentValue
                                    }));
                                }
                            }
                            break;
                        }

                        case MIOT_SERVICES.VACUUM_2.PROPERTIES.MOP_DOCK_WATER_USAGE.PIID: {
                            if (this.capabilities[MopDockMopWashIntensityControlCapability.TYPE]) {
                                const cap = this.capabilities[MopDockMopWashIntensityControlCapability.TYPE];
                                const matched = cap.presets.find(p => p.value === elem.value);
                                if (matched !== undefined) {
                                    this.state.upsertFirstMatchingAttribute(new stateAttrs.PresetSelectionStateAttribute({
                                        metaData: { rawValue: elem.value },
                                        type: stateAttrs.PresetSelectionStateAttribute.TYPE.MOP_DOCK_MOP_WASH_INTENSITY,
                                        value: matched.name
                                    }));
                                } else {
                                    Logger.warn(`Received unknown mop dock wash intensity ${elem.value}`);
                                }
                            }
                            break;
                        }

                        case DreameGen2ValetudoRobot.MIOT_SERVICES.VACUUM_2.PROPERTIES.MISC_TUNABLES.PIID: {
                            const deserializedTunables = DreameUtils.DESERIALIZE_MISC_TUNABLES(elem.value);

                            if (deserializedTunables.SmartHost > 0 && !this.capabilities[DreameAutomaticControlCapability.TYPE]) {
                                Logger.info("Disabling CleanGenius");
                                // CleanGenius breaks most controls in Valetudo without any user feedback
                                // Thus, we just automatically disable it instead of making every functionality aware of it

                                this.miotHelper.writeProperty(
                                    DreameGen2ValetudoRobot.MIOT_SERVICES.VACUUM_2.SIID,
                                    DreameGen2ValetudoRobot.MIOT_SERVICES.VACUUM_2.PROPERTIES.MISC_TUNABLES.PIID,
                                    DreameUtils.SERIALIZE_MISC_TUNABLES_SINGLE_TUNABLE({
                                        SmartHost: 0
                                    })
                                ).catch(e => {
                                    Logger.warn("Error while disabling CleanGenius", e);
                                });
                            }

                            if (this.capabilities[DreameAutomaticControlCapability.TYPE]) {
                                this.ephemeralState.cleanGeniusSmartHost = deserializedTunables.SmartHost ?? 0;
                                this._updateAutomaticControlStateAttribute();
                            }

                            if (deserializedTunables.FluctuationConfirmResult > 0) {
                                if (deserializedTunables.FluctuationTestResult !== 6) { // 6 Means success
                                    const errorString = DreameConst.WATER_HOOKUP_ERRORS[deserializedTunables.FluctuationTestResult];

                                    this.valetudoEventStore.raise(new ErrorStateValetudoEvent({
                                        message: `Water Hookup Error. ${errorString ?? "Unknown error " + deserializedTunables.FluctuationTestResult}`
                                    }));
                                }


                                this.miotHelper.writeProperty(
                                    DreameGen2ValetudoRobot.MIOT_SERVICES.VACUUM_2.SIID,
                                    DreameGen2ValetudoRobot.MIOT_SERVICES.VACUUM_2.PROPERTIES.MISC_TUNABLES.PIID,
                                    DreameUtils.SERIALIZE_MISC_TUNABLES_SINGLE_TUNABLE({
                                        FluctuationConfirmResult: 0
                                    })
                                ).catch(e => {
                                    Logger.warn("Error while confirming water hookup test result", e);
                                });
                            }

                            break;
                        }
                    }
                    break;
                }
                case MIOT_SERVICES.BATTERY.SIID: {
                    switch (elem.piid) {
                        case MIOT_SERVICES.BATTERY.PROPERTIES.LEVEL.PIID: {
                            const existingBattery = this.state.getFirstMatchingAttribute({attributeClass: stateAttrs.BatteryStateAttribute.name});
                            this.state.upsertFirstMatchingAttribute(new stateAttrs.BatteryStateAttribute({
                                level: elem.value,
                                flag: existingBattery?.flag ?? stateAttrs.BatteryStateAttribute.FLAG.NONE
                            }));
                            break;
                        }
                        case MIOT_SERVICES.BATTERY.PROPERTIES.CHARGING.PIID: {
                            /*
                                1 = On Charger
                                2 = Not on Charger
                                5 = Returning to Charger
                             */
                            this.ephemeralState.isCharging = elem.value === 1;
                            statusNeedsUpdate = true;

                            const existingBattery = this.state.getFirstMatchingAttribute({attributeClass: stateAttrs.BatteryStateAttribute.name});
                            if (existingBattery) {
                                const chargingFlag = elem.value === 1 ?
                                    this.ephemeralState.gen2StatusValue === GEN2_STATUS_CHARGING_COMPLETED ?
                                        stateAttrs.BatteryStateAttribute.FLAG.CHARGED :
                                        stateAttrs.BatteryStateAttribute.FLAG.CHARGING :
                                    stateAttrs.BatteryStateAttribute.FLAG.DISCHARGING;
                                this.state.upsertFirstMatchingAttribute(new stateAttrs.BatteryStateAttribute({
                                    level: existingBattery.level,
                                    flag: chargingFlag
                                }));
                            }
                            break;
                        }
                    }
                    break;
                }

                case MIOT_SERVICES.MAIN_BRUSH.SIID:
                case MIOT_SERVICES.SIDE_BRUSH.SIID:
                case MIOT_SERVICES.FILTER.SIID:
                case MIOT_SERVICES.SENSOR.SIID:
                case MIOT_SERVICES.MOP.SIID:
                case MIOT_SERVICES.SECONDARY_FILTER.SIID:
                case MIOT_SERVICES.DETERGENT.SIID:
                case MIOT_SERVICES.WHEEL.SIID:
                    if (this.capabilities[ConsumableMonitoringCapability.TYPE]) {
                        this.capabilities[ConsumableMonitoringCapability.TYPE].parseConsumablesMessage(elem);
                    }
                    break;
                case MIOT_SERVICES.MOP_EXPANSION.SIID: {
                    switch (elem.piid) {
                        case MIOT_SERVICES.MOP_EXPANSION.PROPERTIES.HIGH_RES_WATER_USAGE.PIID: {
                            let matchingWaterGrade = Object.keys(this.waterGrades).find(key => {
                                return this.waterGrades[key] === elem.value;
                            });

                            if (matchingWaterGrade === undefined) {
                                Logger.warn(`Received unknown water grade ${elem.value}`);
                            }

                            this.state.upsertFirstMatchingAttribute(new stateAttrs.PresetSelectionStateAttribute({
                                metaData: {
                                    rawValue: elem.value
                                },
                                type: stateAttrs.PresetSelectionStateAttribute.TYPE.WATER_GRADE,
                                value: matchingWaterGrade
                            }));
                            break;
                        }
                        case MIOT_SERVICES.MOP_EXPANSION.PROPERTIES.CLEANGENIUS_MODE.PIID: {
                            if (this.capabilities[DreameAutomaticSubModeControlCapability.TYPE]) {
                                this.ephemeralState.cleanGeniusMode = elem.value;
                                this._updateAutomaticControlStateAttribute();
                            }
                            break;
                        }
                    }
                    break;
                }
                case MIOT_SERVICES.AUTO_EMPTY_DOCK.SIID: {
                    switch (elem.piid) {
                        case MIOT_SERVICES.AUTO_EMPTY_DOCK.PROPERTIES.STATE.PIID: {
                            this.ephemeralState.autoEmptyDockState = elem.value;
                            dockStatusNeedsUpdate = true;

                            break;
                        }
                    }
                    break;
                }
                case MIOT_SERVICES.MISC_STATES.SIID: {
                    const supportedDockComponents = this.getModelDetails().supportedDockComponents;

                    switch (elem.piid) {
                        case MIOT_SERVICES.MISC_STATES.PROPERTIES.DOCK_FRESHWATER_TANK_ATTACHMENT.PIID: {
                            if (supportedDockComponents.includes(stateAttrs.DockComponentStateAttribute.TYPE.WATER_TANK_CLEAN)) {
                                let value = stateAttrs.DockComponentStateAttribute.VALUE.UNKNOWN;

                                switch (elem.value) {
                                    case 0:
                                        value = stateAttrs.DockComponentStateAttribute.VALUE.OK;
                                        break;
                                    case 1:
                                        value = stateAttrs.DockComponentStateAttribute.VALUE.MISSING;
                                        break;
                                    case 2:
                                        value = stateAttrs.DockComponentStateAttribute.VALUE.EMPTY;
                                        break;
                                    case 3: // Permanent freshwater connection (observed on the X40 Master)
                                        value = stateAttrs.DockComponentStateAttribute.VALUE.OK;
                                        break;
                                }

                                this.state.upsertFirstMatchingAttribute(new stateAttrs.DockComponentStateAttribute({
                                    type: stateAttrs.DockComponentStateAttribute.TYPE.WATER_TANK_CLEAN,
                                    value: value
                                }));
                            }


                            break;
                        }

                        case MIOT_SERVICES.MISC_STATES.PROPERTIES.DOCK_WASTEWATER_TANK_ATTACHMENT.PIID: {
                            if (supportedDockComponents.includes(stateAttrs.DockComponentStateAttribute.TYPE.WATER_TANK_DIRTY)) {
                                let value = stateAttrs.DockComponentStateAttribute.VALUE.UNKNOWN;

                                switch (elem.value) {
                                    case 0:
                                        value = stateAttrs.DockComponentStateAttribute.VALUE.OK;
                                        break;
                                    case 1:
                                        value = stateAttrs.DockComponentStateAttribute.VALUE.FULL;
                                        break;
                                }

                                this.state.upsertFirstMatchingAttribute(new stateAttrs.DockComponentStateAttribute({
                                    type: stateAttrs.DockComponentStateAttribute.TYPE.WATER_TANK_DIRTY,
                                    value: value
                                }));
                            }

                            break;
                        }

                        case MIOT_SERVICES.MISC_STATES.PROPERTIES.DOCK_DUSTBAG_ATTACHMENT.PIID: {
                            if (supportedDockComponents.includes(stateAttrs.DockComponentStateAttribute.TYPE.DUSTBAG)) {
                                let value = stateAttrs.DockComponentStateAttribute.VALUE.UNKNOWN;

                                switch (elem.value) {
                                    case 0:
                                        value = stateAttrs.DockComponentStateAttribute.VALUE.OK;
                                        break;
                                    case 1:
                                        value = stateAttrs.DockComponentStateAttribute.VALUE.MISSING;
                                        break;
                                    case 2:
                                        value = stateAttrs.DockComponentStateAttribute.VALUE.FULL;
                                        break;
                                }

                                this.state.upsertFirstMatchingAttribute(new stateAttrs.DockComponentStateAttribute({
                                    type: stateAttrs.DockComponentStateAttribute.TYPE.DUSTBAG,
                                    value: value
                                }));
                            }

                            break;
                        }

                        case MIOT_SERVICES.MISC_STATES.PROPERTIES.DOCK_DETERGENT_ATTACHMENT.PIID: {
                            if (supportedDockComponents.includes(stateAttrs.DockComponentStateAttribute.TYPE.DETERGENT)) {
                                let value = stateAttrs.DockComponentStateAttribute.VALUE.UNKNOWN;

                                switch (elem.value) {
                                    case 0:
                                        value = stateAttrs.DockComponentStateAttribute.VALUE.OK;
                                        break;
                                    case 1:
                                        value = stateAttrs.DockComponentStateAttribute.VALUE.MISSING;
                                        break;
                                    case 2:
                                        value = stateAttrs.DockComponentStateAttribute.VALUE.EMPTY;
                                        break;
                                }

                                this.state.upsertFirstMatchingAttribute(new stateAttrs.DockComponentStateAttribute({
                                    type: stateAttrs.DockComponentStateAttribute.TYPE.DETERGENT,
                                    value: value
                                }));
                            }

                            break;
                        }
                    }
                    break;
                }
                default:
                    Logger.warn("Unhandled property update", elem);
            }
        }

        if (statusNeedsUpdate === true) {
            let newState;
            let statusValue;
            let statusFlag;
            let statusError;
            let statusMetaData = {};

            /*
                Somewhere in 2022, Dreame firmwares gained the ability to report multiple error codes at once
                only separated by a comma. At the time of writing, the Valetudo abstraction does not support that.
                
                Most of the time, it's two codes with one code being a non-error reminder error code.
                Additionally, in all reported cases where there were two actual error codes, both of them mapped
                to the same error type and description in Valetudo.
                
                We can therefore simply filter the non-error codes and pick the first remaining element.
             */
            if (this.ephemeralState.errorCode.includes(",")) {
                let errorArray = this.ephemeralState.errorCode.split(",");

                errorArray = errorArray.filter(e => !["68", "114", "122"].includes(e));

                this.ephemeralState.errorCode = errorArray[0] ?? "";
            }


            if (this.ephemeralState.errorCode === "0" || this.ephemeralState.errorCode === "") {
                const gen2StatusMap = /** @type {Record<number, {value: string, flag?: string} | undefined>} */ (DreameGen2ValetudoRobot.GEN2_STATUS_MAP);
                const gen2Status = this.ephemeralState.gen2StatusValue !== undefined ? gen2StatusMap[this.ephemeralState.gen2StatusValue] : undefined;
                if (gen2Status !== undefined) {
                    statusValue = gen2Status.value;
                    statusFlag = gen2Status.flag;
                } else {
                    statusValue = DreameValetudoRobot.STATUS_MAP[this.ephemeralState.mode]?.value ?? stateAttrs.StatusStateAttribute.VALUE.IDLE;
                    statusFlag = DreameValetudoRobot.STATUS_MAP[this.ephemeralState.mode]?.flag;
                }

                const taskStatus = DreameGen2ValetudoRobot.TASK_STATUS_MAP[this.ephemeralState.taskStatus];
                if (this.ephemeralState.taskStatus !== undefined) {
                    statusMetaData.taskStatus = taskStatus?.name ?? "unknown";
                    statusMetaData.taskStatusCode = this.ephemeralState.taskStatus;
                    if (taskStatus?.target !== undefined) {
                        statusMetaData.cleaningTargetType = taskStatus.target;
                    }
                }
                const cleanupOutcomeGraceMs = this.ephemeralState.cleanupOutcomeExpectedUntil - Date.now();
                if (cleanupOutcomeGraceMs > 0) {
                    statusMetaData.operationOutcomeGraceMs = cleanupOutcomeGraceMs;
                    statusMetaData.operationOutcomeFallback = "completed";
                }
                if (this.ephemeralState.cleaningPaused !== undefined) {
                    statusMetaData.cleaningPaused = this.ephemeralState.cleaningPaused;
                }
                if (this.ephemeralState.cleaningProgress !== undefined) {
                    statusMetaData.completedPercent = this.ephemeralState.cleaningProgress;
                }
                if (this.ephemeralState.cleaningElapsedSeconds !== undefined) {
                    statusMetaData.cleaningElapsedSeconds = this.ephemeralState.cleaningElapsedSeconds;
                }

                if (statusValue === stateAttrs.StatusStateAttribute.VALUE.CLEANING && taskStatus?.flag !== undefined) {
                    statusFlag = taskStatus.flag;
                }

                if (statusValue === stateAttrs.StatusStateAttribute.VALUE.DOCKED && taskStatus?.cleaning === true) {
                    // Robot has a pending task but is charging due to low battery and will resume when battery >= 80%
                    statusFlag = stateAttrs.StatusStateAttribute.FLAG.RESUMABLE;
                } else if (
                    this.ephemeralState.cleaningPaused === true &&
                    (taskStatus === undefined || taskStatus.cleaning === true) &&
                    [stateAttrs.StatusStateAttribute.VALUE.DOCKED, stateAttrs.StatusStateAttribute.VALUE.PAUSED].includes(statusValue)
                ) {
                    statusFlag = stateAttrs.StatusStateAttribute.FLAG.RESUMABLE;
                } else if (
                    statusValue === stateAttrs.StatusStateAttribute.VALUE.IDLE &&
                    statusFlag === undefined &&
                    this.ephemeralState.isCharging === true
                ) {
                    statusValue = stateAttrs.StatusStateAttribute.VALUE.DOCKED;
                }

                if (
                    this.ephemeralState.taskStatus !== 0 &&
                    (
                        statusValue === stateAttrs.StatusStateAttribute.VALUE.DOCKED ||
                        statusValue === stateAttrs.StatusStateAttribute.VALUE.RETURNING ||
                        statusValue === stateAttrs.StatusStateAttribute.VALUE.PAUSED ||
                        statusValue === stateAttrs.StatusStateAttribute.VALUE.IDLE
                    )
                ) {
                    statusFlag = stateAttrs.StatusStateAttribute.FLAG.RESUMABLE;
                }
            } else {
                if (this.ephemeralState.errorCode === "68") { // Docked with mop still attached. For some reason, dreame decided to have this as an error
                    statusValue = stateAttrs.StatusStateAttribute.VALUE.DOCKED;

                    if (!this.hasCapability(capabilities.DreameMopDockDryManualTriggerCapability.TYPE)) {
                        this.valetudoEventStore.raise(new MopAttachmentReminderValetudoEvent({}));
                    }
                } else if (this.ephemeralState.errorCode === "114") { // Reminder message to regularly clean the mop dock
                    statusValue = stateAttrs.StatusStateAttribute.VALUE.DOCKED;
                } else if (this.ephemeralState.errorCode === "122") { // Apparently just an info that the water hookup (kit) worked successfully?
                    statusValue = stateAttrs.StatusStateAttribute.VALUE.DOCKED;
                } else {
                    statusValue = stateAttrs.StatusStateAttribute.VALUE.ERROR;

                    statusError = DreameValetudoRobot.MAP_ERROR_CODE(this.ephemeralState.errorCode);
                }

            }

            newState = new stateAttrs.StatusStateAttribute({
                value: statusValue,
                flag: statusFlag,
                metaData: statusMetaData,
                error: statusError
            });

            this.state.upsertFirstMatchingAttribute(newState);

            if (newState.isActiveState) {
                this.pollMap();
            }
        }

        if (dockStatusNeedsUpdate === true || dockProgressNeedsUpdate === true) {
            let fullDockState;
            if (dockStatusNeedsUpdate) {
                const mappedMopDockState = DreameValetudoRobot.MOP_DOCK_STATUS_MAP[this.ephemeralState.mopDockState];
                const mappedAutoEmptyDockState = DreameValetudoRobot.AUTO_EMPTY_DOCK_STATUS_MAP[
                    this.ephemeralState.autoEmptyDockState
                ];

                fullDockState = mappedMopDockState ?? stateAttrs.DockStatusStateAttribute.VALUE.IDLE;
                if (mappedAutoEmptyDockState && mappedAutoEmptyDockState !== stateAttrs.DockStatusStateAttribute.VALUE.IDLE) {
                    fullDockState = mappedAutoEmptyDockState;
                }
            } else {
                fullDockState = this.state.getFirstMatchingAttributeByConstructor(
                    stateAttrs.DockStatusStateAttribute
                )?.value;
            }

            const dockMetaData = {};
            if (
                fullDockState === stateAttrs.DockStatusStateAttribute.VALUE.DRYING &&
                this.ephemeralState.dryingProgress !== undefined
            ) {
                dockMetaData.percent = this.ephemeralState.dryingProgress;
                if (this.ephemeralState.mopDryingTimeHours !== undefined) {
                    dockMetaData.remainingSeconds = Math.max(0, Math.round(
                        this.ephemeralState.mopDryingTimeHours * 60 * 60 *
                        (1 - this.ephemeralState.dryingProgress / 100)
                    ));
                }
            }

            if (dockStatusNeedsUpdate || fullDockState === stateAttrs.DockStatusStateAttribute.VALUE.DRYING) {
                this.state.upsertFirstMatchingAttribute(new stateAttrs.DockStatusStateAttribute({
                    value: fullDockState,
                    metaData: dockMetaData
                }));
            }
        }



        this.emitStateAttributesUpdated();
    }

    startup() {
        super.startup();

        if (this.config.get("embedded") === true) {
            try {
                const parsedCmdline = LinuxTools.READ_PROC_CMDLINE();

                if (parsedCmdline.partitions[parsedCmdline.root]) {
                    Logger.info(`Current rootfs: ${parsedCmdline.partitions[parsedCmdline.root]} (${parsedCmdline.root})`);
                }
            } catch (e) {
                Logger.warn("Unable to read /proc/cmdline", e);
            }
        }
    }

    _updateAutomaticControlStateAttribute() {
        const smartHost = this.ephemeralState.cleanGeniusSmartHost;
        const levelName = smartHost === 0 ? "off" : smartHost === 1 ? "routine" : "deep";

        this.state.upsertFirstMatchingAttribute(new stateAttrs.PresetSelectionStateAttribute({
            type: stateAttrs.PresetSelectionStateAttribute.TYPE.AUTOMATIC_CONTROL,
            value: levelName
        }));

        if (smartHost > 0) {
            const subModeName = this.ephemeralState.cleanGeniusMode === 3 ? "vacuum_then_mop" : "vacuum_and_mop";
            this.state.upsertFirstMatchingAttribute(new stateAttrs.PresetSelectionStateAttribute({
                type: stateAttrs.PresetSelectionStateAttribute.TYPE.AUTOMATIC_SUB_MODE,
                value: subModeName
            }));
        }
    }
}

DreameGen2ValetudoRobot.MIOT_SERVICES = MIOT_SERVICES;

DreameGen2ValetudoRobot.GEN2_STATUS_MAP = Object.freeze({
    1: { value: stateAttrs.StatusStateAttribute.VALUE.CLEANING, flag: stateAttrs.StatusStateAttribute.FLAG.VACUUMING },              // SWEEPING
    2: { value: stateAttrs.StatusStateAttribute.VALUE.IDLE },                                                                          // IDLE
    3: { value: stateAttrs.StatusStateAttribute.VALUE.PAUSED, flag: stateAttrs.StatusStateAttribute.FLAG.RESUMABLE },                  // PAUSED
    4: { value: stateAttrs.StatusStateAttribute.VALUE.ERROR },                                                                         // ERROR
    5: { value: stateAttrs.StatusStateAttribute.VALUE.RETURNING },                                                                     // RETURNING
    6: { value: stateAttrs.StatusStateAttribute.VALUE.DOCKED },                                                                        // CHARGING
    7: { value: stateAttrs.StatusStateAttribute.VALUE.CLEANING, flag: stateAttrs.StatusStateAttribute.FLAG.MOPPING },                  // MOPPING
    8: { value: stateAttrs.StatusStateAttribute.VALUE.DOCKED, flag: stateAttrs.StatusStateAttribute.FLAG.DRYING },                     // DRYING
    9: { value: stateAttrs.StatusStateAttribute.VALUE.DOCKED, flag: stateAttrs.StatusStateAttribute.FLAG.WASHING },                    // WASHING
    10: { value: stateAttrs.StatusStateAttribute.VALUE.RETURNING, flag: stateAttrs.StatusStateAttribute.FLAG.TO_WASH },                // RETURNING_TO_WASH
    11: { value: stateAttrs.StatusStateAttribute.VALUE.MOVING, flag: stateAttrs.StatusStateAttribute.FLAG.MAPPING },                   // BUILDING
    12: { value: stateAttrs.StatusStateAttribute.VALUE.CLEANING, flag: stateAttrs.StatusStateAttribute.FLAG.VACUUMING_AND_MOPPING },   // SWEEPING_AND_MOPPING
    13: { value: stateAttrs.StatusStateAttribute.VALUE.DOCKED },                                                                       // CHARGING_COMPLETED
    14: { value: stateAttrs.StatusStateAttribute.VALUE.IDLE },                                                                         // UPGRADING
    15: { value: stateAttrs.StatusStateAttribute.VALUE.CLEANING, flag: stateAttrs.StatusStateAttribute.FLAG.VACUUMING },               // CLEAN_SUMMON
    16: { value: stateAttrs.StatusStateAttribute.VALUE.DOCKED },                                                                       // STATION_RESET
    17: { value: stateAttrs.StatusStateAttribute.VALUE.RETURNING, flag: stateAttrs.StatusStateAttribute.FLAG.INSTALL_MOP },            // RETURNING_INSTALL_MOP
    18: { value: stateAttrs.StatusStateAttribute.VALUE.RETURNING, flag: stateAttrs.StatusStateAttribute.FLAG.REMOVE_MOP },             // RETURNING_REMOVE_MOP
    19: { value: stateAttrs.StatusStateAttribute.VALUE.DOCKED, flag: stateAttrs.StatusStateAttribute.FLAG.ADD_WATER },                 // WATER_CHECK
    20: { value: stateAttrs.StatusStateAttribute.VALUE.DOCKED, flag: stateAttrs.StatusStateAttribute.FLAG.ADD_WATER },                 // CLEAN_ADD_WATER
    21: { value: stateAttrs.StatusStateAttribute.VALUE.PAUSED, flag: stateAttrs.StatusStateAttribute.FLAG.RESUMABLE },                 // WASHING_PAUSED
    22: { value: stateAttrs.StatusStateAttribute.VALUE.DOCKED, flag: stateAttrs.StatusStateAttribute.FLAG.EMPTYING },                  // AUTO_EMPTYING
    23: { value: stateAttrs.StatusStateAttribute.VALUE.MANUAL_CONTROL },                                                               // REMOTE_CONTROL
    24: { value: stateAttrs.StatusStateAttribute.VALUE.DOCKED },                                                                       // SMART_CHARGING
    25: { value: stateAttrs.StatusStateAttribute.VALUE.CLEANING, flag: stateAttrs.StatusStateAttribute.FLAG.AUTO_RECLEANING },         // SECOND_CLEANING
    26: { value: stateAttrs.StatusStateAttribute.VALUE.MANUAL_CONTROL },                                                               // HUMAN_FOLLOWING
    27: { value: stateAttrs.StatusStateAttribute.VALUE.CLEANING, flag: stateAttrs.StatusStateAttribute.FLAG.SPOT },                    // SPOT_CLEANING
    28: { value: stateAttrs.StatusStateAttribute.VALUE.RETURNING, flag: stateAttrs.StatusStateAttribute.FLAG.TO_EMPTY },               // RETURNING_AUTO_EMPTY
    29: { value: stateAttrs.StatusStateAttribute.VALUE.IDLE },                                                                         // WAITING_FOR_TASK
    30: { value: stateAttrs.StatusStateAttribute.VALUE.DOCKED, flag: stateAttrs.StatusStateAttribute.FLAG.WASHING },                   // STATION_CLEANING
    31: { value: stateAttrs.StatusStateAttribute.VALUE.RETURNING, flag: stateAttrs.StatusStateAttribute.FLAG.TO_DRAIN },               // RETURNING_TO_DRAIN
    32: { value: stateAttrs.StatusStateAttribute.VALUE.DOCKED, flag: stateAttrs.StatusStateAttribute.FLAG.DRAINING },                  // DRAINING
    33: { value: stateAttrs.StatusStateAttribute.VALUE.DOCKED, flag: stateAttrs.StatusStateAttribute.FLAG.DRAINING },                  // AUTO_WATER_DRAINING
    34: { value: stateAttrs.StatusStateAttribute.VALUE.DOCKED, flag: stateAttrs.StatusStateAttribute.FLAG.EMPTYING },                  // EMPTYING
    35: { value: stateAttrs.StatusStateAttribute.VALUE.DOCKED, flag: stateAttrs.StatusStateAttribute.FLAG.DRYING },                    // DUST_BAG_DRYING
    36: { value: stateAttrs.StatusStateAttribute.VALUE.PAUSED, flag: stateAttrs.StatusStateAttribute.FLAG.RESUMABLE },                 // DUST_BAG_DRYING_PAUSED
    37: { value: stateAttrs.StatusStateAttribute.VALUE.RETURNING, flag: stateAttrs.StatusStateAttribute.FLAG.AUTO_RECLEANING },        // HEADING_TO_EXTRA_CLEANING
    38: { value: stateAttrs.StatusStateAttribute.VALUE.CLEANING, flag: stateAttrs.StatusStateAttribute.FLAG.AUTO_RECLEANING },         // EXTRA_CLEANING
    95: { value: stateAttrs.StatusStateAttribute.VALUE.PAUSED, flag: stateAttrs.StatusStateAttribute.FLAG.RESUMABLE },                 // FINDING_PET_PAUSED
    96: { value: stateAttrs.StatusStateAttribute.VALUE.MOVING },                                                                       // FINDING_PET
    97: { value: stateAttrs.StatusStateAttribute.VALUE.CLEANING, flag: stateAttrs.StatusStateAttribute.FLAG.VACUUMING },               // SHORTCUT
    98: { value: stateAttrs.StatusStateAttribute.VALUE.IDLE },                                                                         // MONITORING
    99: { value: stateAttrs.StatusStateAttribute.VALUE.PAUSED, flag: stateAttrs.StatusStateAttribute.FLAG.RESUMABLE },                 // MONITORING_PAUSED
    101: { value: stateAttrs.StatusStateAttribute.VALUE.CLEANING, flag: stateAttrs.StatusStateAttribute.FLAG.VACUUMING },              // INITIAL_DEEP_CLEANING
    102: { value: stateAttrs.StatusStateAttribute.VALUE.PAUSED, flag: stateAttrs.StatusStateAttribute.FLAG.RESUMABLE },                // INITIAL_DEEP_CLEANING_PAUSED
    103: { value: stateAttrs.StatusStateAttribute.VALUE.CLEANING, flag: stateAttrs.StatusStateAttribute.FLAG.VACUUMING },              // SANITIZING
    104: { value: stateAttrs.StatusStateAttribute.VALUE.CLEANING, flag: stateAttrs.StatusStateAttribute.FLAG.VACUUMING },              // SANITIZING_WITH_DRY
    105: { value: stateAttrs.StatusStateAttribute.VALUE.DOCKED, flag: stateAttrs.StatusStateAttribute.FLAG.CHANGING_MOP },             // CHANGING_MOP
    106: { value: stateAttrs.StatusStateAttribute.VALUE.PAUSED, flag: stateAttrs.StatusStateAttribute.FLAG.RESUMABLE },                // CHANGING_MOP_PAUSED
    107: { value: stateAttrs.StatusStateAttribute.VALUE.CLEANING, flag: stateAttrs.StatusStateAttribute.FLAG.VACUUMING },              // FLOOR_MAINTAINING
    108: { value: stateAttrs.StatusStateAttribute.VALUE.PAUSED, flag: stateAttrs.StatusStateAttribute.FLAG.RESUMABLE },                // FLOOR_MAINTAINING_PAUSED
});

DreameGen2ValetudoRobot.TASK_STATUS_MAP = Object.freeze({
    0: {name: "completed", cleaning: false},
    1: {name: "auto_cleaning", cleaning: true, target: "all"},
    2: {name: "zone_cleaning", cleaning: true, target: "zones", flag: stateAttrs.StatusStateAttribute.FLAG.ZONE},
    3: {name: "segment_cleaning", cleaning: true, target: "segments", flag: stateAttrs.StatusStateAttribute.FLAG.SEGMENT},
    4: {name: "spot_cleaning", cleaning: true, target: "spot", flag: stateAttrs.StatusStateAttribute.FLAG.SPOT},
    5: {name: "fast_mapping", cleaning: false},
    6: {name: "auto_cleaning_paused", cleaning: true, target: "all"},
    7: {name: "zone_cleaning_paused", cleaning: true, target: "zones"},
    8: {name: "segment_cleaning_paused", cleaning: true, target: "segments"},
    9: {name: "spot_cleaning_paused", cleaning: true, target: "spot"},
    10: {name: "map_cleaning_paused", cleaning: false},
    11: {name: "docking_paused", cleaning: false},
    12: {name: "mopping_paused", cleaning: true, target: "all"},
    13: {name: "segment_mopping_paused", cleaning: true, target: "segments"},
    14: {name: "zone_mopping_paused", cleaning: true, target: "zones"},
    15: {name: "auto_mopping_paused", cleaning: true, target: "all"},
    16: {name: "auto_docking_paused", cleaning: true, target: "all"},
    17: {name: "segment_docking_paused", cleaning: true, target: "segments"},
    18: {name: "zone_docking_paused", cleaning: true, target: "zones"},
    31: {name: "auto_cleaning_washing_paused", cleaning: true, target: "all"},
    32: {name: "area_cleaning_washing_paused", cleaning: true, target: "segments"},
    33: {name: "custom_cleaning_washing_paused", cleaning: true, target: "all"}
});

DreameGen2ValetudoRobot.OPERATION_MODES = Object.freeze({
    [stateAttrs.PresetSelectionStateAttribute.MODE.VACUUM]: 0,
    [stateAttrs.PresetSelectionStateAttribute.MODE.MOP]: 1,
    [stateAttrs.PresetSelectionStateAttribute.MODE.VACUUM_AND_MOP]: 2,
});

DreameGen2ValetudoRobot.HIGH_RESOLUTION_WATER_GRADES = Object.freeze({
    [stateAttrs.PresetSelectionStateAttribute.INTENSITY.MIN]: 1,
    [stateAttrs.PresetSelectionStateAttribute.INTENSITY.LOW]: 8,
    [stateAttrs.PresetSelectionStateAttribute.INTENSITY.MEDIUM]: 16,
    [stateAttrs.PresetSelectionStateAttribute.INTENSITY.HIGH]: 24,
    [stateAttrs.PresetSelectionStateAttribute.INTENSITY.MAX]: 32,
});


module.exports = DreameGen2ValetudoRobot;
