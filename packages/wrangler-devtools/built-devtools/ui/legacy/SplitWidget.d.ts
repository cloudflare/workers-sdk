import * as Common from '../../core/common/common.js';
import * as Platform from '../../core/platform/platform.js';
import { Constraints } from './Geometry.js';
import { ToolbarButton } from './Toolbar.js';
import { Widget } from './Widget.js';
declare const SplitWidget_base: (new (...args: any[]) => {
    "__#6@#events": Common.ObjectWrapper.ObjectWrapper<EventTypes>;
    addEventListener<T extends keyof EventTypes>(eventType: T, listener: (arg0: Common.EventTarget.EventTargetEvent<EventTypes[T]>) => void, thisObject?: Object | undefined): Common.EventTarget.EventDescriptor<EventTypes, T>;
    once<T_1 extends keyof EventTypes>(eventType: T_1): Promise<EventTypes[T_1]>;
    removeEventListener<T_2 extends keyof EventTypes>(eventType: T_2, listener: (arg0: Common.EventTarget.EventTargetEvent<EventTypes[T_2]>) => void, thisObject?: Object | undefined): void;
    hasEventListeners(eventType: keyof EventTypes): boolean;
    dispatchEventToListeners<T_3 extends keyof EventTypes>(eventType: Platform.TypeScriptUtilities.NoUnion<T_3>, ...eventData: Common.EventTarget.EventPayloadToRestParameters<EventTypes, T_3>): void;
}) & typeof Widget;
export declare class SplitWidget extends SplitWidget_base {
    private sidebarElementInternal;
    private mainElement;
    private resizerElementInternal;
    private resizerElementSize;
    private readonly resizerWidget;
    private defaultSidebarWidth;
    private defaultSidebarHeight;
    private readonly constraintsInDip;
    private resizeStartSizeDIP;
    private setting;
    private totalSizeCSS;
    private totalSizeOtherDimensionCSS;
    private mainWidgetInternal;
    private sidebarWidgetInternal;
    private animationFrameHandle;
    private animationCallback;
    private showSidebarButtonTitle;
    private hideSidebarButtonTitle;
    private shownSidebarString;
    private hiddenSidebarString;
    private showHideSidebarButton;
    private isVerticalInternal;
    private sidebarMinimized;
    private detaching;
    private sidebarSizeDIP;
    private savedSidebarSizeDIP;
    private secondIsSidebar;
    private shouldSaveShowMode;
    private savedVerticalMainSize;
    private savedHorizontalMainSize;
    private showModeInternal;
    private savedShowMode;
    constructor(isVertical: boolean, secondIsSidebar: boolean, settingName?: string, defaultSidebarWidth?: number, defaultSidebarHeight?: number, constraintsInDip?: boolean);
    isVertical(): boolean;
    setVertical(isVertical: boolean): void;
    private innerSetVertical;
    private updateLayout;
    setMainWidget(widget: Widget): void;
    setSidebarWidget(widget: Widget): void;
    mainWidget(): Widget | null;
    sidebarWidget(): Widget | null;
    sidebarElement(): HTMLElement;
    childWasDetached(widget: Widget): void;
    isSidebarSecond(): boolean;
    enableShowModeSaving(): void;
    showMode(): string;
    setSecondIsSidebar(secondIsSidebar: boolean): void;
    sidebarSide(): string | null;
    resizerElement(): Element;
    hideMain(animate?: boolean): void;
    hideSidebar(animate?: boolean): void;
    setSidebarMinimized(minimized: boolean): void;
    isSidebarMinimized(): boolean;
    private showOnly;
    private showFinishedForTest;
    private removeAllLayoutProperties;
    showBoth(animate?: boolean): void;
    setResizable(resizable: boolean): void;
    isResizable(): boolean;
    setSidebarSize(size: number): void;
    sidebarSize(): number;
    /**
     * Returns total size in DIP.
     */
    private totalSizeDIP;
    private updateShowMode;
    private innerSetSidebarSizeDIP;
    private animate;
    private cancelAnimation;
    private applyConstraints;
    wasShown(): void;
    willHide(): void;
    onResize(): void;
    onLayout(): void;
    calculateConstraints(): Constraints;
    private onResizeStart;
    private onResizeUpdate;
    private onResizeEnd;
    hideDefaultResizer(noSplitter?: boolean): void;
    installResizer(resizerElement: Element): void;
    uninstallResizer(resizerElement: Element): void;
    hasCustomResizer(): boolean;
    toggleResizer(resizer: Element, on: boolean): void;
    private settingForOrientation;
    private preferredSidebarSizeDIP;
    private restoreSidebarSizeFromSettings;
    private restoreAndApplyShowModeFromSettings;
    private saveShowModeToSettings;
    private saveSetting;
    private forceUpdateLayout;
    private onZoomChanged;
    createShowHideSidebarButton(showTitle: Common.UIString.LocalizedString, hideTitle: Common.UIString.LocalizedString, shownString: Common.UIString.LocalizedString, hiddenString: Common.UIString.LocalizedString): ToolbarButton;
    toggleSidebar(): void;
    private updateShowHideSidebarButton;
}
export declare enum ShowMode {
    Both = "Both",
    OnlyMain = "OnlyMain",
    OnlySidebar = "OnlySidebar"
}
export declare enum Events {
    SidebarSizeChanged = "SidebarSizeChanged",
    ShowModeChanged = "ShowModeChanged"
}
export declare type EventTypes = {
    [Events.SidebarSizeChanged]: number;
    [Events.ShowModeChanged]: string;
};
export interface SettingForOrientation {
    showMode: string;
    size: number;
}
export {};
