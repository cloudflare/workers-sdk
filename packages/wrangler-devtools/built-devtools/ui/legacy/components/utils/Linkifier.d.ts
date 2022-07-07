import * as Common from '../../../../core/common/common.js';
import * as Platform from '../../../../core/platform/platform.js';
import * as SDK from '../../../../core/sdk/sdk.js';
import * as Bindings from '../../../../models/bindings/bindings.js';
import * as TextUtils from '../../../../models/text_utils/text_utils.js';
import * as Workspace from '../../../../models/workspace/workspace.js';
import type * as Protocol from '../../../../generated/protocol.js';
import * as UI from '../../legacy.js';
export declare class Linkifier implements SDK.TargetManager.Observer {
    private readonly maxLength;
    private readonly anchorsByTarget;
    private readonly locationPoolByTarget;
    private onLiveLocationUpdate;
    private useLinkDecorator;
    constructor(maxLengthForDisplayedURLs?: number, useLinkDecorator?: boolean, onLiveLocationUpdate?: (() => void));
    static setLinkDecorator(linkDecorator: LinkDecorator): void;
    private updateAllAnchorDecorations;
    private static bindUILocation;
    private static unbindUILocation;
    targetAdded(target: SDK.Target.Target): void;
    targetRemoved(target: SDK.Target.Target): void;
    maybeLinkifyScriptLocation(target: SDK.Target.Target | null, scriptId: Protocol.Runtime.ScriptId | null, sourceURL: Platform.DevToolsPath.UrlString, lineNumber: number | undefined, options?: LinkifyOptions): HTMLElement | null;
    linkifyScriptLocation(target: SDK.Target.Target | null, scriptId: Protocol.Runtime.ScriptId | null, sourceURL: Platform.DevToolsPath.UrlString, lineNumber: number | undefined, options?: LinkifyOptions): HTMLElement;
    linkifyRawLocation(rawLocation: SDK.DebuggerModel.Location, fallbackUrl: Platform.DevToolsPath.UrlString, className?: string): Element;
    maybeLinkifyConsoleCallFrame(target: SDK.Target.Target | null, callFrame: Protocol.Runtime.CallFrame, options?: LinkifyOptions): HTMLElement | null;
    linkifyStackTraceTopFrame(target: SDK.Target.Target, stackTrace: Protocol.Runtime.StackTrace, className?: string): HTMLElement;
    linkifyCSSLocation(rawLocation: SDK.CSSModel.CSSLocation, classes?: string): Element;
    reset(): void;
    dispose(): void;
    private updateAnchor;
    setLiveLocationUpdateCallback(callback: () => void): void;
    private static updateLinkDecorations;
    static linkifyURL(url: Platform.DevToolsPath.UrlString, options?: LinkifyURLOptions): HTMLElement;
    static linkifyRevealable(revealable: Object, text: string | HTMLElement, fallbackHref?: Platform.DevToolsPath.UrlString, title?: string, className?: string): HTMLElement;
    private static createLink;
    private static setTrimmedText;
    private static appendTextWithoutHashes;
    private static appendHiddenText;
    static untruncatedNodeText(node: Node): string;
    static linkInfo(link: Element | null): _LinkInfo | null;
    private static handleClick;
    static handleClickFromNewComponentLand(linkInfo: _LinkInfo): void;
    static invokeFirstAction(linkInfo: _LinkInfo): boolean;
    static linkHandlerSetting(): Common.Settings.Setting<string>;
    static registerLinkHandler(title: string, handler: LinkHandler): void;
    static unregisterLinkHandler(title: string): void;
    static uiLocation(link: Element): Workspace.UISourceCode.UILocation | null;
    static linkActions(info: _LinkInfo): {
        section: string;
        title: string;
        handler: () => Promise<void> | void;
    }[];
}
export interface LinkDecorator extends Common.EventTarget.EventTarget<LinkDecorator.EventTypes> {
    linkIcon(uiSourceCode: Workspace.UISourceCode.UISourceCode): UI.Icon.Icon | null;
}
export declare namespace LinkDecorator {
    enum Events {
        LinkIconChanged = "LinkIconChanged"
    }
    type EventTypes = {
        [Events.LinkIconChanged]: Workspace.UISourceCode.UISourceCode;
    };
}
export declare class LinkContextMenuProvider implements UI.ContextMenu.Provider {
    static instance(opts?: {
        forceNew: boolean | null;
    }): LinkContextMenuProvider;
    appendApplicableItems(event: Event, contextMenu: UI.ContextMenu.ContextMenu, target: Object): void;
}
export declare class LinkHandlerSettingUI implements UI.SettingsUI.SettingUI {
    private element;
    private constructor();
    static instance(opts?: {
        forceNew: boolean | null;
    }): LinkHandlerSettingUI;
    update(): void;
    private onChange;
    settingElement(): Element | null;
}
export declare class ContentProviderContextMenuProvider implements UI.ContextMenu.Provider {
    static instance(opts?: {
        forceNew: boolean | null;
    }): ContentProviderContextMenuProvider;
    appendApplicableItems(event: Event, contextMenu: UI.ContextMenu.ContextMenu, target: Object): void;
}
export interface _LinkInfo {
    icon: UI.Icon.Icon | null;
    enableDecorator: boolean;
    uiLocation: Workspace.UISourceCode.UILocation | null;
    liveLocation: Bindings.LiveLocation.LiveLocation | null;
    url: Platform.DevToolsPath.UrlString | null;
    lineNumber: number | null;
    columnNumber: number | null;
    inlineFrameIndex: number;
    revealable: Object | null;
    fallback: Element | null;
}
export interface LinkifyURLOptions {
    text?: string;
    className?: string;
    lineNumber?: number;
    columnNumber?: number;
    showColumnNumber: boolean;
    inlineFrameIndex: number;
    preventClick?: boolean;
    maxLength?: number;
    tabStop?: boolean;
    bypassURLTrimming?: boolean;
}
export interface LinkifyOptions {
    className?: string;
    columnNumber?: number;
    showColumnNumber?: boolean;
    inlineFrameIndex: number;
    tabStop?: boolean;
}
export interface _CreateLinkOptions {
    maxLength?: number;
    title?: string;
    href?: Platform.DevToolsPath.UrlString;
    preventClick?: boolean;
    tabStop?: boolean;
    bypassURLTrimming?: boolean;
}
export declare type LinkHandler = (arg0: TextUtils.ContentProvider.ContentProvider, arg1: number) => void;
