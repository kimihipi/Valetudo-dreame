/* eslint-disable max-classes-per-file */
import "@matter/nodejs";

import {PowerSourceServer} from "@matter/node/behaviors/power-source";
import {HepaFilterMonitoringServer} from "@matter/node/behaviors/hepa-filter-monitoring";
import {OperationalStateUtils} from "@matter/node/behaviors/operational-state";
import {WaterTankLevelMonitoringServer} from "@matter/node/behaviors/water-tank-level-monitoring";
import {
    RoboticVacuumCleanerDevice,
    RoboticVacuumCleanerRequirements
} from "@matter/node/devices/robotic-vacuum-cleaner";
import {PowerSourceEndpoint} from "@matter/node/endpoints/power-source";
import {PowerSource} from "@matter/types/clusters/power-source";
import {ModeBase} from "@matter/types/clusters/mode-base";
import {OperationalState} from "@matter/types/clusters/operational-state";
import {RvcOperationalState} from "@matter/types/clusters/rvc-operational-state";
import {ServiceArea} from "@matter/types/clusters/service-area";
import {HepaFilterMonitoring} from "@matter/types/clusters/hepa-filter-monitoring";
import {ResourceMonitoring} from "@matter/types/clusters/resource-monitoring";
import {WaterTankLevelMonitoring} from "@matter/types/clusters/water-tank-level-monitoring";

export const BatteryPowerSourceEndpoint = PowerSourceEndpoint.with(
    PowerSourceServer.with(PowerSource.Feature.Battery, PowerSource.Feature.Rechargeable)
);

/**
 * Adds Valetudo's locate action to the Matter Identify cluster required by the
 * Robot Vacuum Cleaner device type.
 *
 * @param {object} handlers
 * @param {(() => Promise<void>)|undefined} handlers.locate
 * @param {((mode: number) => Promise<void>)|undefined} handlers.changeCleanMode
 * @param {((mode: number) => Promise<void>)|undefined} handlers.changeRunMode
 * @param {(() => Promise<void>)|undefined} handlers.pause
 * @param {(() => Promise<void>)|undefined} handlers.resume
 * @param {(() => Promise<void>)|undefined} handlers.goHome
 * @param {boolean|undefined} handlers.serviceArea
 * @param {((areaIds: Array<number>) => void)|undefined} handlers.selectAreas
 * @param {(() => Promise<void>)|undefined} handlers.resetFilter
 * @param {(() => Promise<void>)|undefined} handlers.refreshWaterTank
 */
export function createRoboticVacuumCleanerDevice({
    locate,
    changeCleanMode,
    changeRunMode,
    pause,
    resume,
    goHome,
    serviceArea,
    selectAreas,
    resetFilter,
    refreshWaterTank
}) {
    const behaviors = [];

    if (locate) {
        class ValetudoIdentifyServer extends RoboticVacuumCleanerRequirements.IdentifyServer {
            async identify(request) {
                await super.identify(request);

                if (request.identifyTime > 0) {
                    await locate();
                }
            }

            async triggerEffect(request) {
                await super.triggerEffect(request);
                await locate();
            }
        }

        behaviors.push(ValetudoIdentifyServer);
    }

    if (changeCleanMode) {
        class ValetudoRvcCleanModeServer extends RoboticVacuumCleanerRequirements.RvcCleanModeServer {
            async changeToMode(request) {
                const previousMode = this.state.currentMode;
                const result = await super.changeToMode(request);

                if (result.status === ModeBase.ModeChangeStatus.Success && request.newMode !== previousMode) {
                    try {
                        await changeCleanMode(request.newMode);
                    } catch (e) {
                        this.state.currentMode = previousMode;
                        return {
                            status: ModeBase.ModeChangeStatus.GenericFailure,
                            statusText: e?.message ?? "Unable to change robot clean mode"
                        };
                    }
                }

                return result;
            }
        }

        behaviors.push(ValetudoRvcCleanModeServer);
    }

    if (changeRunMode) {
        class ValetudoRvcRunModeServer extends RoboticVacuumCleanerRequirements.RvcRunModeServer {
            async changeToMode(request) {
                const previousMode = this.state.currentMode;
                const result = await super.changeToMode(request);

                if (result.status === ModeBase.ModeChangeStatus.Success && request.newMode !== previousMode) {
                    try {
                        await changeRunMode(request.newMode);
                    } catch (e) {
                        this.state.currentMode = previousMode;
                        return {
                            status: ModeBase.ModeChangeStatus.GenericFailure,
                            statusText: e?.message ?? "Unable to change robot run mode"
                        };
                    }
                }

                return result;
            }
        }

        behaviors.push(ValetudoRvcRunModeServer);
    }

    class ValetudoRvcOperationalStateServer extends RoboticVacuumCleanerRequirements.RvcOperationalStateServer {
        reportOperationCompletion(event) {
            this.events.operationCompletion.emit(event, this.context);
        }

        async pause() {
            const result = OperationalStateUtils.assertRvcPause(this.state.operationalState);

            if (
                result.commandResponseState.errorStateId === OperationalState.ErrorState.NoError &&
                    this.state.operationalState !== OperationalState.OperationalStateEnum.Paused
            ) {
                if (!pause) {
                    return {
                        commandResponseState: {
                            errorStateId: OperationalState.ErrorState.UnableToCompleteOperation
                        }
                    };
                }
                try {
                    await pause();
                    this.state.operationalState = OperationalState.OperationalStateEnum.Paused;
                } catch (e) {
                    return {
                        commandResponseState: {
                            errorStateId: OperationalState.ErrorState.UnableToCompleteOperation,
                            errorStateDetails: e?.message ?? "Unable to pause robot"
                        }
                    };
                }
            }

            return result;
        }

        async resume() {
            const result = OperationalStateUtils.assertRvcResume(this.state.operationalState);

            if (
                result.commandResponseState.errorStateId === OperationalState.ErrorState.NoError &&
                    this.state.operationalState !== OperationalState.OperationalStateEnum.Running
            ) {
                if (!resume) {
                    return {
                        commandResponseState: {
                            errorStateId: OperationalState.ErrorState.UnableToStartOrResume
                        }
                    };
                }
                try {
                    await resume();
                    this.state.operationalState = OperationalState.OperationalStateEnum.Running;
                } catch (e) {
                    return {
                        commandResponseState: {
                            errorStateId: OperationalState.ErrorState.UnableToStartOrResume,
                            errorStateDetails: e?.message ?? "Unable to resume robot"
                        }
                    };
                }
            }

            return result;
        }

        async goHome() {
            const result = OperationalStateUtils.assertRvcGoHome(this.state.operationalState);

            if (
                result.commandResponseState.errorStateId === OperationalState.ErrorState.NoError &&
                    this.state.operationalState !== RvcOperationalState.OperationalState.SeekingCharger
            ) {
                if (!goHome) {
                    return {
                        commandResponseState: {
                            errorStateId: OperationalState.ErrorState.UnableToCompleteOperation
                        }
                    };
                }
                try {
                    await goHome();
                    this.state.operationalState = RvcOperationalState.OperationalState.SeekingCharger;
                } catch (e) {
                    return {
                        commandResponseState: {
                            errorStateId: OperationalState.ErrorState.UnableToCompleteOperation,
                            errorStateDetails: e?.message ?? "Unable to send robot home"
                        }
                    };
                }
            }

            return result;
        }
    }

    behaviors.push(ValetudoRvcOperationalStateServer);

    if (resetFilter) {
        class ValetudoHepaFilterMonitoringServer extends HepaFilterMonitoringServer.with(
            HepaFilterMonitoring.Feature.Condition,
            HepaFilterMonitoring.Feature.Warning
        ) {
            async resetCondition() {
                await resetFilter();
                this.state.condition = 100;
                this.state.changeIndication = ResourceMonitoring.ChangeIndication.Ok;
            }
        }
        behaviors.push(ValetudoHepaFilterMonitoringServer);
    }

    if (refreshWaterTank) {
        class ValetudoWaterTankLevelMonitoringServer extends WaterTankLevelMonitoringServer.with(
            WaterTankLevelMonitoring.Feature.Condition,
            WaterTankLevelMonitoring.Feature.Warning
        ) {
            async resetCondition() {
                await refreshWaterTank();
            }
        }
        behaviors.push(ValetudoWaterTankLevelMonitoringServer);
    }

    if (serviceArea) {
        class ValetudoServiceAreaServer extends RoboticVacuumCleanerRequirements.ServiceAreaServer.with(
            ServiceArea.Feature.Maps,
            ServiceArea.Feature.ProgressReporting
        ) {
            selectAreas(request) {
                const result = super.selectAreas(request);
                if (result.status === ServiceArea.SelectAreasStatus.Success) {
                    const selectedAreas = [...this.state.selectedAreas];
                    // A new selection invalidates the previous area's runtime
                    // context even before a new cleaning operation starts.
                    this.state.currentArea = null;
                    this.state.estimatedEndTime = null;
                    if (selectedAreas.length === 0) {
                        // An empty SelectedAreas list means whole-home cleaning.
                        // Clear the old per-room progress in the same Matter
                        // transaction so commissioners do not keep displaying
                        // the previous selection while waiting for another sync.
                        this.state.progress = [];
                    }
                    // Finish the Matter command transaction before notifying
                    // Valetudo. Emitting robot state synchronously here can
                    // contend with the cluster write and delay commissioners.
                    setImmediate(() => selectAreas?.(selectedAreas));
                }
                return result;
            }

        }

        behaviors.push(ValetudoServiceAreaServer);
    }

    return RoboticVacuumCleanerDevice.with(...behaviors);
}

export {Environment} from "@matter/general";
export {ServerNode} from "@matter/node";
export {RoboticVacuumCleanerDevice};
export {VendorId} from "@matter/types/datatype";
export {RvcCleanMode} from "@matter/types/clusters/rvc-clean-mode";
export {RvcOperationalState};
export {RvcRunMode} from "@matter/types/clusters/rvc-run-mode";
export {OperationalState, PowerSource, ResourceMonitoring, ServiceArea};
