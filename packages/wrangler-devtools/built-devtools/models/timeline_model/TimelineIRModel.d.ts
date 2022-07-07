import * as Common from '../../core/common/common.js';
import type * as SDK from '../../core/sdk/sdk.js';
export declare class TimelineIRModel {
    private segments;
    private drags;
    private cssAnimations;
    private responses;
    private scrolls;
    constructor();
    static phaseForEvent(event: SDK.TracingModel.Event): Phases | undefined;
    populate(inputLatencies: SDK.TracingModel.AsyncEvent[] | null, animations: SDK.TracingModel.AsyncEvent[] | null): void;
    private processInputLatencies;
    private processAnimations;
    private segmentForEvent;
    private segmentForEventRange;
    private setPhaseForEvent;
    interactionRecords(): Common.SegmentedRange.Segment<Phases>[];
    reset(): void;
    private inputEventType;
}
export declare enum Phases {
    Idle = "Idle",
    Response = "Response",
    Scroll = "Scroll",
    Fling = "Fling",
    Drag = "Drag",
    Animation = "Animation",
    Uncategorized = "Uncategorized"
}
export declare enum InputEvents {
    Char = "Char",
    Click = "GestureClick",
    ContextMenu = "ContextMenu",
    FlingCancel = "GestureFlingCancel",
    FlingStart = "GestureFlingStart",
    ImplSideFling = "InputHandlerProxy::HandleGestureFling::started",
    KeyDown = "KeyDown",
    KeyDownRaw = "RawKeyDown",
    KeyUp = "KeyUp",
    LatencyScrollUpdate = "ScrollUpdate",
    MouseDown = "MouseDown",
    MouseMove = "MouseMove",
    MouseUp = "MouseUp",
    MouseWheel = "MouseWheel",
    PinchBegin = "GesturePinchBegin",
    PinchEnd = "GesturePinchEnd",
    PinchUpdate = "GesturePinchUpdate",
    ScrollBegin = "GestureScrollBegin",
    ScrollEnd = "GestureScrollEnd",
    ScrollUpdate = "GestureScrollUpdate",
    ScrollUpdateRenderer = "ScrollUpdate",
    ShowPress = "GestureShowPress",
    Tap = "GestureTap",
    TapCancel = "GestureTapCancel",
    TapDown = "GestureTapDown",
    TouchCancel = "TouchCancel",
    TouchEnd = "TouchEnd",
    TouchMove = "TouchMove",
    TouchStart = "TouchStart"
}
export declare namespace TimelineIRModel {
    const _mergeThresholdsMs: {
        animation: number;
        mouse: number;
    };
    const _eventIRPhase: unique symbol;
}
