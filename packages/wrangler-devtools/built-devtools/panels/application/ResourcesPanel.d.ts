import * as Common from '../../core/common/common.js';
import type * as Platform from '../../core/platform/platform.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as UI from '../../ui/legacy/legacy.js';
import { ApplicationPanelSidebar } from './ApplicationPanelSidebar.js';
import type { DOMStorage } from './DOMStorageModel.js';
export declare class ResourcesPanel extends UI.Panel.PanelWithSidebar {
    private readonly resourcesLastSelectedItemSetting;
    visibleView: UI.Widget.Widget | null;
    private pendingViewPromise;
    private categoryView;
    storageViews: HTMLElement;
    private readonly storageViewToolbar;
    private domStorageView;
    private cookieView;
    private readonly emptyWidget;
    private readonly sidebar;
    private constructor();
    static instance(opts?: {
        forceNew: boolean | null;
    }): ResourcesPanel;
    private static shouldCloseOnReset;
    static showAndGetSidebar(): Promise<ApplicationPanelSidebar>;
    focus(): void;
    lastSelectedItemPath(): Platform.DevToolsPath.UrlString[];
    setLastSelectedItemPath(path: Platform.DevToolsPath.UrlString[]): void;
    resetView(): void;
    showView(view: UI.Widget.Widget | null): void;
    scheduleShowView(viewPromise: Promise<UI.Widget.Widget>): Promise<UI.Widget.Widget | null>;
    showCategoryView(categoryName: string, categoryLink: Platform.DevToolsPath.UrlString | null): void;
    showDOMStorage(domStorage: DOMStorage): void;
    showCookies(cookieFrameTarget: SDK.Target.Target, cookieDomain: string): void;
    clearCookies(target: SDK.Target.Target, cookieDomain: string): void;
    wasShown(): void;
}
export declare class ResourceRevealer implements Common.Revealer.Revealer {
    static instance(opts?: {
        forceNew: boolean | null;
    }): ResourceRevealer;
    reveal(resource: Object): Promise<void>;
}
export declare class FrameDetailsRevealer implements Common.Revealer.Revealer {
    static instance(opts?: {
        forceNew: boolean | null;
    }): FrameDetailsRevealer;
    reveal(frame: Object): Promise<void>;
}
