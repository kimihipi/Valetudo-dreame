import { RawMapData } from "./RawMapData";

export interface RawRobotState {
    metaData: RawRobotStateMetaData;
    attributes: RobotAttribute[];
    map: RawMapData;
}

export interface RawRobotStateMetaData {
    version: number;
}

export enum RobotAttributeClass {
    ActiveCleaningTaskState = "ActiveCleaningTaskStateAttribute",
    StatusState = "StatusStateAttribute",
    BatteryState = "BatteryStateAttribute",
    PresetSelectionState = "PresetSelectionStateAttribute",
    AttachmentState = "AttachmentStateAttribute",
    DockStatusState = "DockStatusStateAttribute",
    DockComponentState = "DockComponentStateAttribute",
    CleaningTargetState = "CleaningTargetStateAttribute",
    CleaningCommandState = "CleaningCommandStateAttribute",
}

export interface ActiveCleaningTaskState {
    __class: RobotAttributeClass.ActiveCleaningTaskState;
    metaData: Record<string, never>;
    id: string;
    state: "running" | "paused" | "returning" | "completed" | "cancelled" | "stopped" | "failed";
    source: string;
    startedAt: string;
    target: {
        type: "all" | "automatic" | "segments" | "zones" | "spot";
        segmentIds: string[];
        segmentNames: string[];
        currentSegmentId?: string | null;
    };
    profile: {
        operationMode?: string | null;
        fanPreset?: string | null;
        waterPreset?: string | null;
        cleanRoute?: string | null;
        iterations?: number
    };
    progress: {
        completedRooms?: number;
        completedSegmentIds?: string[];
        currentRoomNumber?: number | null;
        totalRooms?: number;
        sequential?: boolean;
        completedPercent?: number;
        estimatedRemainingSeconds?: number | null;
        estimatedCompletionTime?: string | null;
    };
    outcome: string | null;
    revision: number;
}

export interface StatusState {
    __class: RobotAttributeClass.StatusState;
    metaData: Record<string, never>;
    value:
        | "error"
        | "docked"
        | "idle"
        | "returning"
        | "cleaning"
        | "paused"
        | "manual_control"
        | "moving";
    flag: string;
}

export interface BatteryState {
    __class: RobotAttributeClass.BatteryState;
    metaData: Record<string, never>;
    level: number;
    flag: "none" | "charged" | "charging" | "discharging";
}

export type PresetValue = string;

export interface PresetSelectionState {
    __class: RobotAttributeClass.PresetSelectionState;
    metaData: Record<string, never>;
    type: "fan_speed" | "water_grade" | "operation_mode" | "mop_dock_mop_cleaning_frequency" | "mop_dock_detergent" | "mop_dock_mop_wash_intensity" | "automatic_control" | "automatic_sub_mode" | "clean_route";
    value: PresetValue;
    customValue?: number;
}

export type AttachmentStateAttributeType = "dustbin" | "watertank" | "mop";

export interface AttachmentState {
    __class: RobotAttributeClass.AttachmentState;
    type: AttachmentStateAttributeType;
    attached: boolean;
}

export interface DockStatusState {
    __class: RobotAttributeClass.DockStatusState;
    metaData: Record<string, never>;
    value:
        | "error"
        | "idle"
        | "pause"
        | "emptying"
        | "cleaning"
        | "drying";
}

export type DockComponentStateAttributeType = "water_tank_clean" | "water_tank_dirty" | "dustbag" | "detergent";
export type DockComponentStateAttributeValue = "ok" | "missing" | "empty" | "full" | "unknown";

export interface DockComponentState {
    __class: RobotAttributeClass.DockComponentState;
    metaData: Record<string, never>;
    type: DockComponentStateAttributeType;
    value: DockComponentStateAttributeValue;
}

export interface CleaningTargetState {
    __class: RobotAttributeClass.CleaningTargetState;
    metaData: Record<string, never>;
    value: "none" | "all" | "segments" | "zones" | "automatic";
    segmentIds: string[];
    zones: Array<{
        points: {
            pA: {x: number; y: number};
            pB: {x: number; y: number};
            pC: {x: number; y: number};
            pD: {x: number; y: number};
        };
    }>;
    iterations: number;
    mapId: string | null;
    mapVersion: string | number | null;
    profile: Record<string, string | number | boolean | null>;
    source: string;
    active: boolean;
    revision: number;
    updatedAt: string;
}

export interface CleaningCommandState {
    __class: RobotAttributeClass.CleaningCommandState;
    metaData: Record<string, never>;
    id: string;
    command: "home" | "pause" | "resume" | "start_all" | "start_segments" | "start_zones" | "stop";
    state: "pending" | "accepted" | "verified" | "failed" | "uncertain";
    source: string;
    targetRevision: number | null;
    createdAt: string;
    updatedAt: string;
    error: string | null;
    revision: number;
}


export type RobotAttribute =
    | ActiveCleaningTaskState
    | StatusState
    | BatteryState
    | PresetSelectionState
    | AttachmentState
    | DockStatusState
    | DockComponentState
    | CleaningCommandState
    | CleaningTargetState;
