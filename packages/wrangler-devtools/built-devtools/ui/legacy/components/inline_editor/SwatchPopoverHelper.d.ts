import * as Common from '../../../../core/common/common.js';
import * as UI from '../../legacy.js';
export declare class SwatchPopoverHelper extends Common.ObjectWrapper.ObjectWrapper<EventTypes> {
    private readonly popover;
    private readonly hideProxy;
    private readonly boundOnKeyDown;
    private readonly boundFocusOut;
    private isHidden;
    private anchorElement;
    private view?;
    private hiddenCallback?;
    private focusRestorer?;
    constructor();
    private onFocusOut;
    setAnchorElement(anchorElement: Element): void;
    isShowing(view?: UI.Widget.Widget): boolean;
    show(view: UI.Widget.Widget, anchorElement: Element, hiddenCallback?: ((arg0: boolean) => void)): void;
    reposition(): void;
    hide(commitEdit?: boolean): void;
    private onKeyDown;
}
export declare enum Events {
    WillShowPopover = "WillShowPopover"
}
export declare type EventTypes = {
    [Events.WillShowPopover]: void;
};
