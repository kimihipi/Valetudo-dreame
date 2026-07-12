const matter = require("../../lib/matter/MatterRuntime.generated");

describe("MatterRuntime", function() {
    const integrationIt = process.env.MATTER_INTEGRATION_TEST === "1" ? it : it.skip;

    integrationIt("should initialize RVC filter and water resource monitoring", async function() {
        matter.Environment.default.vars.set("storage.path", "/tmp/valetudo-matter-runtime-test");
        const device = matter.createRoboticVacuumCleanerDevice({
            resetFilter: async () => {},
            refreshWaterTank: async () => {}
        });
        const node = await matter.ServerNode.create({
            id: "valetudo-matter-runtime-test",
            productDescription: {name: "Test RVC", deviceType: matter.RoboticVacuumCleanerDevice.deviceType},
            commissioning: {passcode: 20202021, discriminator: 3840},
            productDescriptor: {vendorId: matter.VendorId(65521), productId: 32768},
            basicInformation: {
                vendorName: "Valetudo",
                productName: "Test RVC",
                productLabel: "Test RVC",
                nodeLabel: "Test RVC",
                vendorId: matter.VendorId(65521),
                productId: 32768,
                serialNumber: "matter-runtime-test",
                softwareVersion: 1,
                softwareVersionString: "1"
            },
            network: {port: 0}
        });

        try {
            const rvc = await node.add(device, {
                id: "rvc",
                rvcRunMode: {
                    supportedModes: [
                        {label: "Idle", mode: 0, modeTags: [{value: matter.RvcRunMode.ModeTag.Idle}]},
                        {label: "Cleaning", mode: 1, modeTags: [{value: matter.RvcRunMode.ModeTag.Cleaning}]}
                    ],
                    currentMode: 0
                },
                rvcOperationalState: {
                    phaseList: ["Cleaning"],
                    currentPhase: null,
                    operationalStateList: [
                        {operationalStateId: matter.RvcOperationalState.OperationalState.Stopped},
                        {operationalStateId: matter.RvcOperationalState.OperationalState.Running},
                        {operationalStateId: matter.RvcOperationalState.OperationalState.Paused},
                        {operationalStateId: matter.RvcOperationalState.OperationalState.Error}
                    ],
                    operationalState: matter.RvcOperationalState.OperationalState.Stopped,
                    countdownTime: null
                },
                hepaFilterMonitoring: {
                    condition: 75,
                    degradationDirection: matter.ResourceMonitoring.DegradationDirection.Down,
                    changeIndication: matter.ResourceMonitoring.ChangeIndication.Ok,
                    inPlaceIndicator: true
                },
                waterTankLevelMonitoring: {
                    condition: 100,
                    degradationDirection: matter.ResourceMonitoring.DegradationDirection.Down,
                    changeIndication: matter.ResourceMonitoring.ChangeIndication.Ok,
                    inPlaceIndicator: true
                }
            });
            await node.add(matter.BatteryPowerSourceEndpoint, {
                id: "battery",
                powerSource: {
                    status: matter.PowerSource.PowerSourceStatus.Active,
                    order: 0,
                    description: "Robot battery",
                    endpointList: [rvc.number],
                    batChargeLevel: matter.PowerSource.BatChargeLevel.Ok,
                    batReplacementNeeded: false,
                    batReplaceability: matter.PowerSource.BatReplaceability.NotReplaceable,
                    batPercentRemaining: 200,
                    batPresent: true,
                    activeBatFaults: [],
                    batChargeState: matter.PowerSource.BatChargeState.IsAtFullCharge,
                    batFunctionalWhileCharging: true,
                    activeBatChargeFaults: []
                }
            });
        } finally {
            await node.close();
        }
    });
});
