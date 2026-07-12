require("should");

const DreameMiotHelper = require("../../../../lib/robots/dreame/DreameMiotHelper");
const READ_BATCH_WAIT_MS = 30;

describe("DreameMiotHelper", function() {
    const createHelper = () => {
        const commands = [];
        const robot = {
            deviceId: 123,
            sendCommand: async (method, params) => {
                commands.push({method: method, params: params});
                if (method === "get_properties") {
                    return params.map(property => ({...property, value: property.piid, code: 0}));
                }
                if (method === "action") {
                    return {code: 0};
                }
                return params.map(property => ({...property, code: 0}));
            }
        };
        return {helper: new DreameMiotHelper({robot: robot}), commands: commands};
    };

    it("should batch distinct reads and deduplicate identical reads", async function() {
        const {helper, commands} = createHelper();
        const first = helper.readProperty(4, 50);
        const duplicate = helper.readProperty(4, 50);
        const other = helper.readProperty(4, 22);

        (await first).should.equal(50);
        (await duplicate).should.equal(50);
        (await other).should.equal(22);
        commands.should.have.length(1);
        commands[0].method.should.equal("get_properties");
        commands[0].params.should.have.length(2);
    });

    it("should reuse briefly cached reads and invalidate them after writes", async function() {
        const {helper, commands} = createHelper();
        await helper.readProperty(4, 50);
        await helper.readProperty(4, 50);
        commands.should.have.length(1);

        await helper.writeProperty(4, 50, "updated");
        await helper.readProperty(4, 50);

        commands.filter(command => command.method === "get_properties").should.have.length(2);
        commands.filter(command => command.method === "set_properties").should.have.length(1);
    });

    it("should preserve request ordering when some properties are cached", async function() {
        const {helper} = createHelper();
        await helper.readProperty(4, 50);

        const result = await helper.readProperties([{siid: 4, piid: 22}, {siid: 4, piid: 50}]);

        result.map(property => property.value).should.deepEqual([22, 50]);
    });

    it("should not delay actions behind pending property reads", async function() {
        let resolveRead;
        const commands = [];
        const robot = {
            deviceId: 123,
            sendCommand: async (method, params) => {
                commands.push(method);
                if (method === "get_properties") {
                    return new Promise(resolve => {
                        resolveRead = () => resolve(params.map(property => ({...property, code: 0})));
                    });
                }
                return {code: 0};
            }
        };
        const helper = new DreameMiotHelper({robot: robot});
        const read = helper.readProperty(4, 50);

        await new Promise(resolve => setTimeout(resolve, READ_BATCH_WAIT_MS));
        await helper.executeAction(4, 1);

        commands.should.deepEqual(["get_properties", "action"]);
        resolveRead();
        await read;
    });
});
