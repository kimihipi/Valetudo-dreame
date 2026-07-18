const should = require("should");

const CleaningTaskService = require("../../../lib/core/CleaningTaskService");
const RobotState = require("../../../lib/entities/state/RobotState");
const stateAttrs = require("../../../lib/entities/state/attributes");

describe("CleaningTaskService", function() {
    const createRobot = () => {
        const robot = {
            state: new RobotState({
                map: {
                    metaData: {id: "map-1", version: 2},
                    layers: [
                        {type: "segment", metaData: {segmentId: "2"}},
                        {type: "segment", metaData: {segmentId: "4"}},
                        {type: "segment", metaData: {segmentId: "9", hidden: true}}
                    ]
                }
            }),
            capabilities: {},
            reportOperationOutcome: outcome => {
                robot.lastOperationOutcome = outcome;
            },
            publishCleaningCommandState: attribute => {
                robot.state.upsertFirstMatchingAttribute(attribute);
            }
        };
        robot.setCleaningTarget = target => {
            const previous = robot.state.getFirstMatchingAttributeByConstructor(
                stateAttrs.CleaningTargetStateAttribute
            );
            if (target.expectedRevision !== undefined && target.expectedRevision !== previous?.revision) {
                return null;
            }
            const published = {...target};
            delete published.expectedRevision;
            const attribute = new stateAttrs.CleaningTargetStateAttribute({
                ...published,
                revision: (previous?.revision ?? 0) + 1
            });
            robot.state.upsertFirstMatchingAttribute(attribute);
            return attribute;
        };
        return robot;
    };

    it("should seed a process-local whole-home target", function() {
        const robot = createRobot();

        const service = new CleaningTaskService({robot: robot});

        service.getTarget().should.match({value: "all", segmentIds: [], source: "system", active: false});
    });

    it("should seed automatic only when firmware reports it enabled", function() {
        const robot = createRobot();
        robot.state.upsertFirstMatchingAttribute(new stateAttrs.PresetSelectionStateAttribute({
            type: stateAttrs.PresetSelectionStateAttribute.TYPE.AUTOMATIC_CONTROL,
            value: "routine"
        }));

        const service = new CleaningTaskService({robot: robot});

        service.getTarget().value.should.equal("automatic");
    });

    it("should accept the first late firmware automatic mode without replacing a user draft", function() {
        const robot = createRobot();
        robot.capabilities.AutomaticControlCapability = {};
        const service = new CleaningTaskService({robot: robot});

        robot.state.upsertFirstMatchingAttribute(new stateAttrs.PresetSelectionStateAttribute({
            type: stateAttrs.PresetSelectionStateAttribute.TYPE.AUTOMATIC_CONTROL,
            value: "routine"
        }));
        service.getTarget().value.should.equal("automatic");

        const secondRobot = createRobot();
        secondRobot.capabilities.AutomaticControlCapability = {};
        const secondService = new CleaningTaskService({robot: secondRobot});
        secondService.stageTarget({value: "segments", segmentIds: []});
        secondRobot.state.upsertFirstMatchingAttribute(new stateAttrs.PresetSelectionStateAttribute({
            type: stateAttrs.PresetSelectionStateAttribute.TYPE.AUTOMATIC_CONTROL,
            value: "deep"
        }));
        secondService.getTarget().value.should.equal("segments");
    });

    it("should stage a normalized, map-bound cleaning draft", function() {
        const robot = createRobot();
        robot.state.upsertFirstMatchingAttribute(new stateAttrs.PresetSelectionStateAttribute({
            type: stateAttrs.PresetSelectionStateAttribute.TYPE.FAN_SPEED,
            value: "medium"
        }));
        robot.capabilities.MapSegmentationCapability = {
            getProperties: () => ({iterationCount: {min: 1, max: 3}})
        };
        const service = new CleaningTaskService({robot: robot});

        const target = service.stageTarget({
            value: "segments",
            segmentIds: ["4", 2, "4"],
            iterations: 2,
            source: "webui"
        });

        target.should.match({
            value: "segments",
            segmentIds: ["4", "2"],
            iterations: 2,
            mapId: "map-1",
            mapVersion: 2,
            active: false
        });
        target.profile.fanPreset.should.equal("medium");
    });

    it("should allow an empty segment draft but reject starting it", async function() {
        const robot = createRobot();
        robot.capabilities.MapSegmentationCapability = {
            getProperties: () => ({iterationCount: {min: 1, max: 3}}),
            executeSegmentAction: async () => {}
        };
        const service = new CleaningTaskService({robot: robot});

        service.stageTarget({value: "segments", segmentIds: []})
            .should.match({value: "segments", segmentIds: [], active: false});
        await should(service.startSegments({segmentIds: []})).be.rejectedWith("At least one room must be selected");
    });

    it("should promote and execute a segment draft", async function() {
        const robot = createRobot();
        let executed;
        robot.capabilities.MapSegmentationCapability = {
            getProperties: () => ({iterationCount: {min: 1, max: 3}}),
            executeSegmentAction: async (segments, options) => {
                executed = {ids: segments.map(segment => segment.id), options: options};
            }
        };
        const service = new CleaningTaskService({robot: robot});
        const staged = service.stageTarget({value: "segments", segmentIds: ["4", "2"], iterations: 2});

        const result = await service.startSegments({
            segmentIds: ["4", "2"],
            iterations: 2,
            customOrder: true,
            expectedRevision: staged.revision
        });

        result.target.active.should.equal(true);
        result.commandId.should.match(/^[0-9a-f-]{36}$/);
        executed.should.deepEqual({ids: ["4", "2"], options: {iterations: 2, customOrder: true}});
    });

    it("should disable firmware automatic control before starting a manual segment target", async function() {
        const robot = createRobot();
        const calls = [];
        robot.state.upsertFirstMatchingAttribute(new stateAttrs.PresetSelectionStateAttribute({
            type: stateAttrs.PresetSelectionStateAttribute.TYPE.AUTOMATIC_CONTROL,
            value: "routine"
        }));
        robot.capabilities.AutomaticControlCapability = {
            selectPreset: async preset => calls.push(`automatic:${preset}`)
        };
        robot.capabilities.MapSegmentationCapability = {
            getProperties: () => ({iterationCount: {min: 1, max: 3}}),
            executeSegmentAction: async () => calls.push("start:segments")
        };
        const service = new CleaningTaskService({robot: robot});

        await service.startSegments({segmentIds: ["2"], source: "matter"});

        calls.should.deepEqual(["automatic:off", "start:segments"]);
    });

    it("should start the exact staged segment-target revision", async function() {
        const robot = createRobot();
        let executed;
        robot.capabilities.MapSegmentationCapability = {
            getProperties: () => ({
                customOrderSupport: true,
                iterationCount: {min: 1, max: 3}
            }),
            executeSegmentAction: async (segments, options) => {
                executed = {ids: segments.map(segment => segment.id), options: options};
            }
        };
        const service = new CleaningTaskService({robot: robot});
        service.stageTarget({value: "segments", segmentIds: ["2", "4"], iterations: 2, source: "matter"});

        const target = service.getTarget();
        const result = await service.startTarget({source: "webui", expectedRevision: target.revision});

        result.target.should.match({
            value: "segments", segmentIds: ["2", "4"], source: "webui", active: true
        });
        result.target.revision.should.equal(target.revision + 1);
        executed.should.deepEqual({ids: ["2", "4"], options: {iterations: 2, customOrder: true}});
    });

    it("should reject a staged room that disappeared instead of rewriting the draft", async function() {
        const robot = createRobot();
        robot.capabilities.MapSegmentationCapability = {
            getProperties: () => ({customOrderSupport: true, iterationCount: {min: 1, max: 3}}),
            executeSegmentAction: async () => {}
        };
        const service = new CleaningTaskService({robot: robot});
        const target = service.stageTarget({value: "segments", segmentIds: ["2"], iterations: 1});
        robot.state.map.layers = [{type: "segment", metaData: {segmentId: "4"}}];

        await should(service.startTarget({expectedRevision: target.revision}))
            .be.rejectedWith("One or more selected rooms are no longer available");
        service.getTarget().should.match({
            value: "segments", segmentIds: ["2"], active: false, revision: target.revision
        });
    });

    it("should gate and execute the currently staged zone draft", async function() {
        const robot = createRobot();
        let executed;
        robot.capabilities.ZoneCleaningCapability = {
            getProperties: () => ({zoneCount: {min: 1, max: 3}, iterationCount: {min: 1, max: 2}}),
            start: async options => {
                executed = options;
            }
        };
        const service = new CleaningTaskService({robot: robot});
        const zone = {points: {
            pA: {x: 0, y: 0}, pB: {x: 100, y: 0}, pC: {x: 100, y: 100}, pD: {x: 0, y: 100}
        }};

        service.stageTarget({value: "zones", zones: [], segmentIds: []})
            .should.match({value: "zones", zones: [], active: false});
        await should(service.startTarget({expectedRevision: service.getTarget().revision}))
            .be.rejectedWith("At least one zone must be selected");
        service.stageTarget({value: "zones", zones: [zone], segmentIds: [], iterations: 2});
        const result = await service.startTarget({
            source: "webui",
            expectedRevision: service.getTarget().revision
        });

        result.target.should.match({value: "zones", iterations: 2, active: true});
        executed.iterations.should.equal(2);
        executed.zones.should.have.length(1);
        executed.zones[0].points.should.deepEqual(zone.points);
        robot.state.getFirstMatchingAttributeByConstructor(
            stateAttrs.CleaningCommandStateAttribute
        ).command.should.equal("start_zones");
    });

    it("should execute whole-home cleaning through the same target lifecycle", async function() {
        const robot = createRobot();
        let starts = 0;
        robot.capabilities.BasicControlCapability = {
            start: async () => {
                starts++;
            }
        };
        const service = new CleaningTaskService({robot: robot});

        const result = await service.startAll({source: "webui"});

        starts.should.equal(1);
        result.target.should.match({value: "all", segmentIds: [], iterations: 1, source: "webui", active: true});
    });

    it("should reject Web and Matter starts while dock maintenance is active", async function() {
        for (const source of ["webui", "matter"]) {
            for (const dockState of ["cleaning", "emptying", "pause"]) {
                const robot = createRobot();
                robot.capabilities.BasicControlCapability = {start: async () => {}};
                robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({value: "docked"}));
                robot.state.upsertFirstMatchingAttribute(new stateAttrs.DockStatusStateAttribute({value: dockState}));
                const service = new CleaningTaskService({robot: robot});
                const targetBefore = service.getTarget();

                let error;
                try {
                    await service.startAll({source: source});
                } catch (e) {
                    error = e;
                }

                error.should.match({name: "CleaningStartBlockedError", statusCode: 409});
                service.getTarget().should.match({revision: targetBefore.revision, active: false});
                should(robot.state.getFirstMatchingAttributeByConstructor(
                    stateAttrs.CleaningCommandStateAttribute
                )).equal(null);
            }
        }
    });

    it("should reject maintenance flags and nonterminal tasks before publishing a start command", async function() {
        const maintenanceFlags = [
            "washing", "to_wash", "emptying", "to_empty", "draining", "to_drain", "add_water",
            "changing_mop", "install_mop", "remove_mop", "auto_recleaning"
        ];
        for (const flag of maintenanceFlags) {
            const robot = createRobot();
            robot.capabilities.BasicControlCapability = {start: async () => {}};
            robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({value: "docked", flag: flag}));
            const service = new CleaningTaskService({robot: robot});

            await should(service.startAll({source: "webui"})).be.rejectedWith({
                name: "CleaningStartBlockedError",
                statusCode: 409
            });
            should(robot.state.getFirstMatchingAttributeByConstructor(
                stateAttrs.CleaningCommandStateAttribute
            )).equal(null);
        }

        const robot = createRobot();
        robot.capabilities.BasicControlCapability = {start: async () => {}};
        robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({value: "docked"}));
        robot.state.upsertFirstMatchingAttribute(new stateAttrs.ActiveCleaningTaskStateAttribute({
            id: "task-at-dock", state: "running", source: "matter", startedAt: new Date().toISOString()
        }));
        const service = new CleaningTaskService({robot: robot});

        await should(service.startAll({source: "matter"})).be.rejectedWith({
            name: "CleaningStartBlockedError",
            statusCode: 409
        });
    });

    it("should allow a new cleaning while docked, charging or drying", async function() {
        for (const dockState of ["idle", "drying"]) {
            const robot = createRobot();
            let starts = 0;
            robot.capabilities.BasicControlCapability = {
                start: async () => {
                    starts++;
                }
            };
            robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({value: "docked"}));
            robot.state.upsertFirstMatchingAttribute(new stateAttrs.DockStatusStateAttribute({value: dockState}));
            const service = new CleaningTaskService({robot: robot});

            await service.startAll({source: "webui"});

            starts.should.equal(1);
        }
    });

    it("should reject docked-resumable Start while mop cleaning is active", async function() {
        const robot = createRobot();
        let starts = 0;
        robot.capabilities.BasicControlCapability = {
            start: async () => {
                starts++;
                robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({value: "cleaning"}));
            }
        };
        robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({
            value: "docked", flag: "resumable"
        }));
        robot.state.upsertFirstMatchingAttribute(new stateAttrs.DockStatusStateAttribute({value: "cleaning"}));
        robot.state.upsertFirstMatchingAttribute(new stateAttrs.ActiveCleaningTaskStateAttribute({
            id: "resumable-task", state: "paused", source: "matter", startedAt: new Date().toISOString()
        }));
        const service = new CleaningTaskService({robot: robot, verificationTimeoutMs: 10});

        await should(service.startAll({source: "matter"})).be.rejectedWith({
            name: "CleaningStartBlockedError",
            statusCode: 409
        });

        starts.should.equal(0);
        should(robot.state.getFirstMatchingAttributeByConstructor(
            stateAttrs.CleaningCommandStateAttribute
        )).equal(null);
    });

    it("should preserve firmware automatic mode for Basic whole-home Start", async function() {
        const robot = createRobot();
        robot.state.upsertFirstMatchingAttribute(new stateAttrs.PresetSelectionStateAttribute({
            type: stateAttrs.PresetSelectionStateAttribute.TYPE.AUTOMATIC_CONTROL,
            value: "routine"
        }));
        robot.capabilities.BasicControlCapability = {start: async () => {}};
        const service = new CleaningTaskService({robot: robot});

        const result = await service.startAll({source: "webui"});

        result.target.should.match({value: "automatic", segmentIds: [], source: "webui", active: true});
    });

    it("should keep Basic Start as whole-home even when another draft was staged", async function() {
        const robot = createRobot();
        robot.capabilities.BasicControlCapability = {start: async () => {}};
        const service = new CleaningTaskService({robot: robot});
        service.stageTarget({value: "segments", segmentIds: [], source: "webui"});

        const result = await service.startAll({source: "webui"});

        result.target.should.match({value: "all", segmentIds: [], source: "webui", active: true});
    });

    it("should reject a staged-target Start when its revision changed", async function() {
        const robot = createRobot();
        robot.capabilities.BasicControlCapability = {start: async () => {}};
        const service = new CleaningTaskService({robot: robot});
        const target = service.stageTarget({value: "all", segmentIds: [], source: "webui"});
        service.stageTarget({value: "all", segmentIds: [], source: "matter"});

        await should(service.startTarget({expectedRevision: target.revision}))
            .be.rejectedWith("The cleaning target changed before the operation could be applied");
    });

    it("should treat Web UI Start while paused as resume", async function() {
        const robot = createRobot();
        robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({value: "paused"}));
        robot.setCleaningTarget({value: "segments", segmentIds: ["4"], source: "webui", active: true});
        robot.capabilities.BasicControlCapability = {
            start: async () => {
                robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({value: "cleaning"}));
            }
        };
        const service = new CleaningTaskService({robot: robot, verificationTimeoutMs: 10});

        const result = await service.startAll({source: "webui"});
        await new Promise(resolve => setImmediate(resolve));

        result.target.should.match({value: "segments", segmentIds: ["4"], active: true});
        robot.state.getFirstMatchingAttributeByConstructor(
            stateAttrs.CleaningCommandStateAttribute
        ).should.match({command: "resume", state: "verified", source: "webui"});
    });

    it("should publish an identifiable accepted and verified command lifecycle", async function() {
        const robot = createRobot();
        robot.capabilities.BasicControlCapability = {
            start: async () => {
                robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({value: "cleaning"}));
            }
        };
        const service = new CleaningTaskService({robot: robot, verificationTimeoutMs: 10});

        await service.startAll({source: "webui"});
        await new Promise(resolve => setImmediate(resolve));

        const command = robot.state.getFirstMatchingAttributeByConstructor(
            stateAttrs.CleaningCommandStateAttribute
        );
        command.id.should.match(/^[0-9a-f-]{36}$/);
        command.should.match({command: "start_all", state: "verified", source: "webui"});
        command.targetRevision.should.be.above(0);
    });

    it("should serialize competing physical commands", async function() {
        const robot = createRobot();
        let executions = 0;
        let inFlight = 0;
        let maximumInFlight = 0;
        robot.capabilities.MapSegmentationCapability = {
            getProperties: () => ({iterationCount: {min: 1, max: 3}}),
            executeSegmentAction: async () => {
                executions++;
                inFlight++;
                maximumInFlight = Math.max(maximumInFlight, inFlight);
                await new Promise(resolve => setImmediate(resolve));
                inFlight--;
                throw new Error("rejected for test");
            }
        };
        const service = new CleaningTaskService({robot: robot, verificationTimeoutMs: 10});

        await Promise.allSettled([
            service.startSegments({segmentIds: ["2"]}),
            service.startSegments({segmentIds: ["4"]})
        ]);

        executions.should.equal(2);
        maximumInFlight.should.equal(1);
    });

    it("should retain an active target and report uncertainty after a command timeout", async function() {
        const robot = createRobot();
        robot.capabilities.MapSegmentationCapability = {
            getProperties: () => ({iterationCount: {min: 1, max: 3}}),
            executeSegmentAction: async () => {
                throw new Error("request timed out");
            }
        };
        const service = new CleaningTaskService({robot: robot, verificationTimeoutMs: 10});

        await should(service.startSegments({segmentIds: ["2"]})).be.rejectedWith("request timed out");

        service.getTarget().active.should.equal(true);
        robot.state.getFirstMatchingAttributeByConstructor(
            stateAttrs.CleaningCommandStateAttribute
        ).should.match({command: "start_segments", state: "uncertain", error: "request timed out"});
    });

    it("should report cancellation only when Home interrupts a task", async function() {
        const robot = createRobot();
        robot.capabilities.BasicControlCapability = {home: async () => {
            robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({value: "returning"}));
        }};
        const service = new CleaningTaskService({robot: robot, verificationTimeoutMs: 10});

        await service.home({source: "webui"});
        should(robot.lastOperationOutcome).equal(undefined);
        robot.state.upsertFirstMatchingAttribute(new stateAttrs.ActiveCleaningTaskStateAttribute({
            id: "task-1", state: "running", source: "webui", startedAt: new Date().toISOString(), revision: 1
        }));
        const result = await service.home({source: "matter"});

        robot.lastOperationOutcome.should.equal("cancelled");
        result.commandId.should.match(/^[0-9a-f-]{36}$/);
        robot.state.getFirstMatchingAttributeByConstructor(
            stateAttrs.CleaningCommandStateAttribute
        ).should.match({command: "home", state: "verified", source: "matter"});
    });

    it("should discard a paused resumable task before sending it to the dock", async function() {
        const robot = createRobot();
        const calls = [];
        robot.capabilities.BasicControlCapability = {
            stop: async () => {
                calls.push("stop");
                robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({value: "idle"}));
            },
            home: async () => {
                calls.push("home");
                robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({value: "returning"}));
            }
        };
        robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({
            value: "paused", flag: "resumable"
        }));
        robot.state.upsertFirstMatchingAttribute(new stateAttrs.ActiveCleaningTaskStateAttribute({
            id: "task-1", state: "paused", source: "matter", startedAt: new Date().toISOString(), revision: 1
        }));
        const service = new CleaningTaskService({robot: robot, verificationTimeoutMs: 10});

        await service.home({source: "matter"});

        calls.should.deepEqual(["stop", "home"]);
        robot.lastOperationOutcome.should.equal("cancelled");
    });

    it("should run pause, resume and stop through the shared command lifecycle", async function() {
        const robot = createRobot();
        robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({value: "cleaning"}));
        robot.capabilities.BasicControlCapability = {
            pause: async () => {
                robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({value: "paused"}));
            },
            start: async () => {
                robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({value: "cleaning"}));
            },
            stop: async () => {
                robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({value: "idle"}));
            }
        };
        const service = new CleaningTaskService({robot: robot, verificationTimeoutMs: 10});

        const paused = await service.pause({source: "matter"});
        await new Promise(resolve => setImmediate(resolve));
        paused.commandId.should.match(/^[0-9a-f-]{36}$/);
        robot.state.getFirstMatchingAttributeByConstructor(
            stateAttrs.CleaningCommandStateAttribute
        ).should.match({command: "pause", state: "verified", source: "matter"});

        await service.resume({source: "matter"});
        await new Promise(resolve => setImmediate(resolve));
        robot.state.getFirstMatchingAttributeByConstructor(
            stateAttrs.CleaningCommandStateAttribute
        ).should.match({command: "resume", state: "verified", source: "matter"});

        await service.stop({source: "matter"});
        await new Promise(resolve => setImmediate(resolve));
        robot.lastOperationOutcome.should.equal("stopped");
        robot.state.getFirstMatchingAttributeByConstructor(
            stateAttrs.CleaningCommandStateAttribute
        ).should.match({command: "stop", state: "verified", source: "matter"});
    });

    it("should not publish a terminal stop outcome without firmware verification", async function() {
        const robot = createRobot();
        robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({value: "cleaning"}));
        robot.capabilities.BasicControlCapability = {stop: async () => {}};
        const service = new CleaningTaskService({robot: robot, verificationTimeoutMs: 10});

        await should(service.stop({source: "matter"})).be.rejectedWith("Robot stop verification timed out");

        should(robot.lastOperationOutcome).equal(undefined);
        robot.state.getFirstMatchingAttributeByConstructor(
            stateAttrs.CleaningCommandStateAttribute
        ).should.match({command: "stop", state: "uncertain", source: "matter"});
    });

    it("should reject resume when the robot has no resumable operation", async function() {
        const robot = createRobot();
        robot.state.upsertFirstMatchingAttribute(new stateAttrs.StatusStateAttribute({value: "idle"}));
        robot.capabilities.BasicControlCapability = {start: async () => {}};
        const service = new CleaningTaskService({robot: robot});

        await should(service.resume({source: "webui"})).be.rejectedWith(
            "Robot has no paused operation to resume"
        );
    });

    it("should report an ambiguous control failure and retain its command id", async function() {
        const robot = createRobot();
        robot.capabilities.BasicControlCapability = {
            pause: async () => {
                throw new Error("request timed out");
            }
        };
        const service = new CleaningTaskService({robot: robot, verificationTimeoutMs: 10});

        let thrown;
        try {
            await service.pause({source: "webui"});
        } catch (error) {
            thrown = error;
        }

        thrown.commandId.should.match(/^[0-9a-f-]{36}$/);
        robot.state.getFirstMatchingAttributeByConstructor(
            stateAttrs.CleaningCommandStateAttribute
        ).should.match({command: "pause", state: "uncertain", error: "request timed out"});
    });

    it("should roll back a failed start without overwriting a newer target", async function() {
        const robot = createRobot();
        robot.capabilities.MapSegmentationCapability = {
            getProperties: () => ({iterationCount: {min: 1, max: 3}}),
            executeSegmentAction: async () => {
                robot.setCleaningTarget({value: "all", segmentIds: [], source: "system", active: false});
                throw new Error("firmware rejected command");
            }
        };
        const service = new CleaningTaskService({robot: robot});

        await should(service.startSegments({segmentIds: ["2"]})).be.rejectedWith("firmware rejected command");

        service.getTarget().should.match({value: "all", source: "system", active: false});
        robot.state.getFirstMatchingAttributeByConstructor(
            stateAttrs.CleaningCommandStateAttribute
        ).error.should.match(/rollback skipped/);
    });

    it("should restore the staged draft when its firmware command fails", async function() {
        const robot = createRobot();
        robot.capabilities.MapSegmentationCapability = {
            getProperties: () => ({iterationCount: {min: 1, max: 3}}),
            executeSegmentAction: async () => {
                throw new Error("firmware rejected command");
            }
        };
        const service = new CleaningTaskService({robot: robot});

        await should(service.startSegments({segmentIds: ["4"], iterations: 2}))
            .be.rejectedWith("firmware rejected command");

        service.getTarget().should.match({
            value: "segments", segmentIds: ["4"], iterations: 2, active: false
        });
    });

    it("should reject stale and active target replacements", function() {
        const robot = createRobot();
        robot.capabilities.MapSegmentationCapability = {
            getProperties: () => ({iterationCount: {min: 1, max: 1}})
        };
        const service = new CleaningTaskService({robot: robot});
        const target = service.stageTarget({value: "segments", segmentIds: ["2"]});

        should.throws(() => service.stageTarget({
            value: "all", segmentIds: [], expectedRevision: target.revision - 1
        }), /changed before/);
        robot.setCleaningTarget({...target, active: true, expectedRevision: target.revision});
        should.throws(() => service.stageTarget({value: "all", segmentIds: []}), /cannot be replaced/);
    });
});
