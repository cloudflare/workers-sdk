import * as Common from '../../../../core/common/common.js';
import * as Platform from '../../../../core/platform/platform.js';
import * as UI from '../../legacy.js';
import type { CSSShadowModel } from './CSSShadowModel.js';
declare const CSSShadowEditor_base: (new (...args: any[]) => {
    "__#6@#events": Common.ObjectWrapper.ObjectWrapper<EventTypes>;
    addEventListener<T extends Events.ShadowChanged>(eventType: T, listener: (arg0: Common.EventTarget.EventTargetEvent<EventTypes[T]>) => void, thisObject?: Object | undefined): Common.EventTarget.EventDescriptor<EventTypes, T>;
    once<T_1 extends Events.ShadowChanged>(eventType: T_1): Promise<EventTypes[T_1]>;
    removeEventListener<T_2 extends Events.ShadowChanged>(eventType: T_2, listener: (arg0: Common.EventTarget.EventTargetEvent<EventTypes[T_2]>) => void, thisObject?: Object | undefined): void;
    hasEventListeners(eventType: Events.ShadowChanged): boolean;
    dispatchEventToListeners<T_3 extends Events.ShadowChanged>(eventType: Platform.TypeScriptUtilities.NoUnion<T_3>, ...eventData: Common.EventTarget.EventPayloadToRestParameters<EventTypes, T_3>): void;
}) & typeof UI.Widget.VBox;
export declare class CSSShadowEditor extends CSSShadowEditor_base {
    private readonly typeField;
    private readonly outsetButton;
    private readonly insetButton;
    private xInput;
    private yInput;
    private xySlider;
    private halfCanvasSize;
    private readonly innerCanvasSize;
    private blurInput;
    private blurSlider;
    private readonly spreadField;
    private spreadInput;
    private spreadSlider;
    private model;
    private canvasOrigin;
    private changedElement?;
    constructor();
    private createTextInput;
    private createSlider;
    wasShown(): void;
    setModel(model: CSSShadowModel): void;
    private updateUI;
    private updateButtons;
    private updateCanvas;
    private onButtonClick;
    private handleValueModification;
    private onTextInput;
    private onTextBlur;
    private onSliderInput;
    private dragStart;
    private dragMove;
    private onCanvasBlur;
    private onCanvasArrowKey;
    private constrainPoint;
    private snapToClosestDirection;
    private sliderThumbPosition;
}
export declare enum Events {
    ShadowChanged = "ShadowChanged"
}
export declare type EventTypes = {
    [Events.ShadowChanged]: CSSShadowModel;
};
export {};
