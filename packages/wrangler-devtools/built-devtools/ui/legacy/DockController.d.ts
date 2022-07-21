import * as Common from '../../core/common/common.js';
import type { ActionDelegate } from './ActionRegistration.js';
import type { Context } from './Context.js';
import type { Provider, ToolbarItem } from './Toolbar.js';
import { ToolbarButton } from './Toolbar.js';
export declare class DockController extends Common.ObjectWrapper.ObjectWrapper<EventTypes> {
    private canDockInternal;
    readonly closeButton: ToolbarButton;
    private readonly currentDockStateSetting;
    private readonly lastDockStateSetting;
    private dockSideInternal;
    private titles?;
    private savedFocus?;
    constructor(canDock: boolean);
    static instance(opts?: {
        forceNew: boolean | null;
        canDock: boolean;
    }): DockController;
    initialize(): void;
    private dockSideChanged;
    dockSide(): DockState | undefined;
    canDock(): boolean;
    isVertical(): boolean;
    setDockSide(dockSide: DockState): void;
    private setIsDockedResponse;
    toggleDockSide(): void;
}
export declare const enum DockState {
    BOTTOM = "bottom",
    RIGHT = "right",
    LEFT = "left",
    UNDOCKED = "undocked"
}
export declare const enum Events {
    BeforeDockSideChanged = "BeforeDockSideChanged",
    DockSideChanged = "DockSideChanged",
    AfterDockSideChanged = "AfterDockSideChanged"
}
export interface ChangeEvent {
    from: DockState | undefined;
    to: DockState;
}
export declare type EventTypes = {
    [Events.BeforeDockSideChanged]: ChangeEvent;
    [Events.DockSideChanged]: ChangeEvent;
    [Events.AfterDockSideChanged]: ChangeEvent;
};
export declare class ToggleDockActionDelegate implements ActionDelegate {
    static instance(opts?: {
        forceNew: boolean | null;
    }): ToggleDockActionDelegate;
    handleAction(_context: Context, _actionId: string): boolean;
}
export declare class CloseButtonProvider implements Provider {
    static instance(opts?: {
        forceNew: boolean | null;
    }): CloseButtonProvider;
    item(): ToolbarItem | null;
}
