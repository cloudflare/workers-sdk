import * as SDK from '../../core/sdk/sdk.js';
export declare class InputModel extends SDK.SDKModel.SDKModel<void> {
    private readonly inputAgent;
    private eventDispatchTimer;
    private dispatchEventDataList;
    private finishCallback;
    private dispatchingIndex;
    private lastEventTime?;
    private replayPaused?;
    constructor(target: SDK.Target.Target);
    private reset;
    setEvents(tracingModel: SDK.TracingModel.TracingModel): void;
    startReplay(finishCallback: (() => void) | null): void;
    pause(): void;
    resume(): void;
    private processThreadEvents;
    private isValidInputEvent;
    private isMouseEvent;
    private isKeyboardEvent;
    private dispatchNextEvent;
    private dispatchMouseEvent;
    private dispatchKeyEvent;
    private replayStopped;
}
export interface MouseEventData {
    type: string;
    modifiers: number;
    timestamp: number;
    x: number;
    y: number;
    button: number;
    buttons: number;
    clickCount: number;
    deltaX: number;
    deltaY: number;
}
export interface KeyboardEventData {
    type: string;
    modifiers: number;
    timestamp: number;
    code: string;
    key: string;
}
export declare type EventData = MouseEventData | KeyboardEventData;
