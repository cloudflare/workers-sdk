import * as Common from '../../core/common/common.js';
import * as UI from '../../ui/legacy/legacy.js';
export declare class TransformController extends Common.ObjectWrapper.ObjectWrapper<EventTypes> {
    private mode;
    private scaleInternal;
    private offsetXInternal;
    private offsetYInternal;
    private rotateXInternal;
    private rotateYInternal;
    private oldRotateX;
    private oldRotateY;
    private originX;
    private originY;
    element: HTMLElement;
    private minScale;
    private maxScale;
    private readonly controlPanelToolbar;
    private readonly modeButtons;
    constructor(element: HTMLElement, disableRotate?: boolean);
    toolbar(): UI.Toolbar.Toolbar;
    private registerShortcuts;
    private postChangeEvent;
    private reset;
    private setMode;
    private updateModeButtons;
    resetAndNotify(event?: Event): void;
    setScaleConstraints(minScale: number, maxScale: number): void;
    clampOffsets(minX: number, maxX: number, minY: number, maxY: number): void;
    scale(): number;
    offsetX(): number;
    offsetY(): number;
    rotateX(): number;
    rotateY(): number;
    private onScale;
    private onPan;
    private onRotate;
    private onKeyboardZoom;
    private onKeyboardPanOrRotate;
    private onMouseWheel;
    private onDrag;
    private onDragStart;
    private onDragEnd;
}
export declare enum Events {
    TransformChanged = "TransformChanged"
}
export declare type EventTypes = {
    [Events.TransformChanged]: void;
};
export declare const enum Modes {
    Pan = "Pan",
    Rotate = "Rotate"
}
