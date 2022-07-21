import * as Common from '../../../../core/common/common.js';
import * as Platform from '../../../../core/platform/platform.js';
import type * as SDK from '../../../../core/sdk/sdk.js';
import * as UI from '../../legacy.js';
declare const FilmStripView_base: (new (...args: any[]) => {
    "__#6@#events": Common.ObjectWrapper.ObjectWrapper<EventTypes>;
    addEventListener<T extends keyof EventTypes>(eventType: T, listener: (arg0: Common.EventTarget.EventTargetEvent<EventTypes[T]>) => void, thisObject?: Object | undefined): Common.EventTarget.EventDescriptor<EventTypes, T>;
    once<T_1 extends keyof EventTypes>(eventType: T_1): Promise<EventTypes[T_1]>;
    removeEventListener<T_2 extends keyof EventTypes>(eventType: T_2, listener: (arg0: Common.EventTarget.EventTargetEvent<EventTypes[T_2]>) => void, thisObject?: Object | undefined): void;
    hasEventListeners(eventType: keyof EventTypes): boolean;
    dispatchEventToListeners<T_3 extends keyof EventTypes>(eventType: Platform.TypeScriptUtilities.NoUnion<T_3>, ...eventData: Common.EventTarget.EventPayloadToRestParameters<EventTypes, T_3>): void;
}) & typeof UI.Widget.HBox;
export declare class FilmStripView extends FilmStripView_base {
    private statusLabel;
    private zeroTime;
    private spanTime;
    private model;
    private mode?;
    constructor();
    static setImageData(imageElement: HTMLImageElement, data: string | null): void;
    setMode(mode: string): void;
    setModel(filmStripModel: SDK.FilmStripModel.FilmStripModel, zeroTime: number, spanTime: number): void;
    createFrameElement(frame: SDK.FilmStripModel.Frame): Promise<Element>;
    frameByTime(time: number): SDK.FilmStripModel.Frame;
    update(): void;
    onResize(): void;
    private onMouseEvent;
    private onDoubleClick;
    reset(): void;
    setStatusText(text: string): void;
}
export declare enum Events {
    FrameSelected = "FrameSelected",
    FrameEnter = "FrameEnter",
    FrameExit = "FrameExit"
}
export declare type EventTypes = {
    [Events.FrameSelected]: number;
    [Events.FrameEnter]: number;
    [Events.FrameExit]: number;
};
export declare const Modes: {
    TimeBased: string;
    FrameBased: string;
};
export declare class Dialog {
    private fragment;
    private readonly widget;
    private frames;
    private index;
    private zeroTime;
    private dialog;
    constructor(filmStripFrame: SDK.FilmStripModel.Frame, zeroTime?: number);
    private resize;
    private keyDown;
    private onPrevFrame;
    private onNextFrame;
    private onFirstFrame;
    private onLastFrame;
    private render;
}
export {};
