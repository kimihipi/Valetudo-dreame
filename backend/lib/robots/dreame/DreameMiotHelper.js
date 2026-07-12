const RobotFirmwareError = require("../../core/RobotFirmwareError");
const {sleep} = require("../../utils/misc");

const READ_BATCH_WINDOW_MS = 20;
const READ_CACHE_TTL_MS = 500;
const MAX_PROPERTIES_PER_READ = 20;

class DreameMiotHelper {
    /**
     * @param {object} options
     * @param {import("./DreameValetudoRobot")} options.robot
     * @param {number} [options.postWriteDelay]
     */
    constructor(options) {
        this.robot = options.robot;
        this.postWriteDelay = options.postWriteDelay ?? null;
        this.propertyReadCache = new Map();
        this.pendingPropertyReads = new Map();
        this.propertyReadBatchTimer = null;
    }

    /**
     * @param {Array<{siid: number, piid: number}>} properties
     * @returns {Promise<Array<*>>}
     */
    async readProperties(properties) {
        const now = Date.now();
        const entries = properties.map(property => {
            const key = `${property.siid}:${property.piid}`;
            let entry = this.propertyReadCache.get(key);
            if (entry && entry.expiresAt <= now && !this.pendingPropertyReads.has(key)) {
                this.propertyReadCache.delete(key);
                entry = undefined;
            }
            if (!entry) {
                let resolve;
                let reject;
                const promise = new Promise((res, rej) => {
                    resolve = res;
                    reject = rej;
                });
                entry = {
                    key: key,
                    property: property,
                    promise: promise,
                    resolve: resolve,
                    reject: reject,
                    expiresAt: Infinity
                };
                this.propertyReadCache.set(key, entry);
                this.pendingPropertyReads.set(key, entry);
            }
            return entry;
        });
        if (this.pendingPropertyReads.size > 0 && this.propertyReadBatchTimer === null) {
            this.propertyReadBatchTimer = setTimeout(() => this.flushPropertyReads(), READ_BATCH_WINDOW_MS);
        }
        return Promise.all(entries.map(entry => entry.promise));
    }

    /** @private */
    async flushPropertyReads() {
        if (this.propertyReadBatchTimer !== null) {
            clearTimeout(this.propertyReadBatchTimer);
            this.propertyReadBatchTimer = null;
        }
        const entries = [...this.pendingPropertyReads.values()];
        this.pendingPropertyReads.clear();
        if (entries.length === 0) {
            return;
        }
        try {
            for (let offset = 0; offset < entries.length; offset += MAX_PROPERTIES_PER_READ) {
                const chunk = entries.slice(offset, offset + MAX_PROPERTIES_PER_READ);
                const result = await this.robot.sendCommand("get_properties", chunk.map(entry => ({
                    did: this.robot.deviceId,
                    siid: entry.property.siid,
                    piid: entry.property.piid
                })));
                if (!result || result.length !== chunk.length) {
                    throw new Error("Received invalid response");
                }
                const expiresAt = Date.now() + READ_CACHE_TTL_MS;
                chunk.forEach((entry, index) => {
                    entry.expiresAt = expiresAt;
                    entry.resolve(result[index]);
                });
            }
        } catch (e) {
            entries.forEach(entry => {
                this.propertyReadCache.delete(entry.key);
                entry.reject(e);
            });
        }
    }

    /**
     * @param {number} siid
     * @param {number} piid
     * @returns {Promise<*>}
     */
    async readProperty(siid, piid) {
        const res = await this.readProperties([{ siid: siid, piid: piid }]);

        if (res[0].code === 0) {
            return res[0].value;
        } else {
            throw new RobotFirmwareError("Error code " + res[0].code);
        }
    }

    /**
     * @param {Array<{siid: number, piid: number, value: *}>} properties
     * @param {object} [options]
     * @param {number|null} [options.postWriteDelay]
     * @returns {Promise<void>}
     */
    async writeProperties(properties, options) {
        properties.forEach(property => this.propertyReadCache.delete(`${property.siid}:${property.piid}`));
        const postWriteDelay = options?.postWriteDelay ?? this.postWriteDelay;
        const res = await this.robot.sendCommand("set_properties", properties.map(p => {
            return {
                did: this.robot.deviceId,
                siid: p.siid,
                piid: p.piid,
                value: p.value
            };
        }));

        if (res && res.length === properties.length) {
            const errorItem = res.find(r => r.code !== 0);
            if (errorItem) {
                throw new RobotFirmwareError("Error code " + errorItem.code);
            }

            if (postWriteDelay) {
                await sleep(postWriteDelay); // Give the firmware some time to think
            }
            properties.forEach(property => this.propertyReadCache.delete(`${property.siid}:${property.piid}`));
        } else {
            throw new Error("Received invalid response");
        }
    }

    /**
     *
     * @param {number} siid
     * @param {number} piid
     * @param {*} value
     * @param {object} [options]
     * @param {number|null} [options.postWriteDelay]
     * @returns {Promise<void>}
     */
    async writeProperty(siid, piid, value, options) {
        await this.writeProperties([
            {
                siid: siid,
                piid: piid,
                value: value
            }
        ], options);
    }

    /**
     *
     * @param {number} siid
     * @param {number} aiid
     * @param {Array<*>} [additionalParameters]
     * @returns {Promise<void>}
     */
    async executeAction(siid, aiid, additionalParameters) {
        this.propertyReadCache.clear();
        const res = await this.robot.sendCommand("action", {
            did: this.robot.deviceId,
            siid: siid,
            aiid: aiid,
            in: additionalParameters ?? []
        });
        this.propertyReadCache.clear();

        if (res.code !== 0) {
            throw new RobotFirmwareError("Error code " + res.code);
        }
    }
}

module.exports = DreameMiotHelper;
