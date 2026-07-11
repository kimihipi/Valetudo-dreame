const child_process = require("child_process");
const env = require("../../../res/env");
const fs = require("fs");
const Logger = require("../../../Logger");
const os = require("os");
const path = require("path");
const SpeakerPlayAudioCapability = require("../../../core/capabilities/SpeakerPlayAudioCapability");
const util = require("util");
const ValetudoAudioEntry = require("../../../entities/core/ValetudoAudioEntry");

const statPromise = util.promisify(fs.stat);
const readdirPromise = util.promisify(fs.readdir);

/**
 * Decode an ogg file with oggdec and pipe raw PCM into aplay.
 * Uses spawn with argv arrays so the audio path is never interpreted by a shell.
 *
 * @param {string} audioPath
 * @returns {Promise<void>}
 */
function playOggFile(audioPath) {
    return new Promise((resolve, reject) => {
        const oggdec = child_process.spawn("oggdec", [audioPath, "-Q", "-o", "-"]);
        const aplay = child_process.spawn("aplay", ["-D", "hw"]);

        /** @type {number|null} */
        let oggdecCode = null;
        /** @type {number|null} */
        let aplayCode = null;
        let oggdecStderr = "";
        let aplayStderr = "";

        oggdec.stderr.on("data", (chunk) => {
            oggdecStderr += chunk.toString();
        });
        aplay.stderr.on("data", (chunk) => {
            aplayStderr += chunk.toString();
        });

        oggdec.on("error", reject);
        aplay.on("error", reject);

        // If aplay dies first, stop feeding it to avoid EPIPE crashing oggdec.
        oggdec.stdout.on("error", () => { /* ignore EPIPE */ });
        oggdec.stdout.pipe(aplay.stdin);

        const finish = () => {
            if (oggdecCode === null || aplayCode === null) {
                return;
            }
            if (oggdecCode !== 0) {
                reject(new Error(`oggdec exited with code ${oggdecCode}: ${oggdecStderr.trim()}`));
            } else if (aplayCode !== 0) {
                reject(new Error(`aplay exited with code ${aplayCode}: ${aplayStderr.trim()}`));
            } else {
                resolve();
            }
        };

        oggdec.on("close", (code) => {
            oggdecCode = code ?? 0;
            finish();
        });
        aplay.on("close", (code) => {
            aplayCode = code ?? 0;
            finish();
        });
    });
}

/**
 * @extends SpeakerPlayAudioCapability<import("../DreameValetudoRobot")>
 */
class DreameSpeakerPlayAudioCapability extends SpeakerPlayAudioCapability {
    /**
     * @param {object} options
     * @param {import("../DreameValetudoRobot")} options.robot
     */
    constructor(options) {
        super(options);

        if (this.robot.config.get("embedded") && !fs.existsSync(this.audioDirPath)) {
            fs.mkdirSync(this.audioDirPath);
        }
    }

    /**
     * @returns {Promise<Array<ValetudoAudioEntry>>}
     */
    async getAudioList() {
        if (!this.robot.config.get("embedded")) {
            Logger.warn("Can't get audio list as we're not embedded");
            return [];
        }

        const audioList = [];

        try {
            const audioFiles = await readdirPromise(this.audioDirPath);

            const allFilesList = audioFiles
                .filter(fileName => fileName.endsWith(".ogg"))
                .map(fileName => path.basename(fileName, ".ogg"))
                .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

            // Do some creative file ordering
            const numberFilesList = allFilesList.filter(name => /[0-9]/.test(name.substring(0, 1)));
            const otherFilesList = allFilesList.filter(name => /[^0-9]/.test(name.substring(0, 1)));
            const combinedFilesList = [...otherFilesList, ...numberFilesList];

            for (const name of combinedFilesList) {
                audioList.push(new ValetudoAudioEntry({
                    id: name,
                    name: name
                }));
            }
        } catch (err) {
            Logger.error("Failed to get audio list: ", err);
        }

        return audioList;
    }

    /**
     * @param {string} id
     * @returns {Promise<void>}
     */
    async playAudio(id) {
        if (!this.robot.config.get("embedded")) {
            Logger.warn("Can't play audio as we're not embedded");
            return;
        }

        Logger.debug(`Playing audio ${id}`);

        const fileName = `${id}.ogg`;
        if (fileName !== path.basename(fileName)) {
            throw new Error("Failed to play audio as the name was invalid");
        }

        try {
            const audioPath = path.join(this.audioDirPath, fileName);

            if (!(await statPromise(audioPath))) {
                throw new Error("Failed to play audio as the file doesn't exist");
            }

            await playOggFile(audioPath);
            Logger.debug(`Completed playback of audio ${id}`);
        } catch (err) {
            Logger.error("Failed to play audio: ", err);
            throw new Error("Failed to play audio");
        }
    }

    get audioDirPath() {
        return path.join(process.env[env.DataPath] ?? os.tmpdir(), "audio");
    }
}

module.exports = DreameSpeakerPlayAudioCapability;
