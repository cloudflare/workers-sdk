import * as TextUtils from '../../models/text_utils/text_utils.js';
import * as Common from '../common/common.js';
import * as Platform from '../platform/platform.js';
import type * as ProtocolProxyApi from '../../generated/protocol-proxy-api.js';
import type * as Protocol from '../../generated/protocol.js';
import { CSSFontFace } from './CSSFontFace.js';
import { CSSMatchedStyles } from './CSSMatchedStyles.js';
import { CSSMedia } from './CSSMedia.js';
import { CSSStyleRule } from './CSSRule.js';
import { CSSStyleDeclaration } from './CSSStyleDeclaration.js';
import { CSSStyleSheetHeader } from './CSSStyleSheetHeader.js';
import type { DOMNode } from './DOMModel.js';
import { DOMModel } from './DOMModel.js';
import type { Target } from './Target.js';
import { SDKModel } from './SDKModel.js';
import { SourceMapManager } from './SourceMapManager.js';
export declare class CSSModel extends SDKModel<EventTypes> {
    #private;
    readonly agent: ProtocolProxyApi.CSSApi;
    constructor(target: Target);
    headersForSourceURL(sourceURL: Platform.DevToolsPath.UrlString): CSSStyleSheetHeader[];
    createRawLocationsByURL(sourceURL: Platform.DevToolsPath.UrlString, lineNumber: number, columnNumber?: number | undefined): CSSLocation[];
    sourceMapManager(): SourceMapManager<CSSStyleSheetHeader>;
    static readableLayerName(text: string): string;
    static trimSourceURL(text: string): string;
    domModel(): DOMModel;
    setStyleText(styleSheetId: Protocol.CSS.StyleSheetId, range: TextUtils.TextRange.TextRange, text: string, majorChange: boolean): Promise<boolean>;
    setSelectorText(styleSheetId: Protocol.CSS.StyleSheetId, range: TextUtils.TextRange.TextRange, text: string): Promise<boolean>;
    setKeyframeKey(styleSheetId: Protocol.CSS.StyleSheetId, range: TextUtils.TextRange.TextRange, text: string): Promise<boolean>;
    startCoverage(): Promise<Protocol.ProtocolResponseWithError>;
    takeCoverageDelta(): Promise<{
        timestamp: number;
        coverage: Array<Protocol.CSS.RuleUsage>;
    }>;
    setLocalFontsEnabled(enabled: boolean): Promise<Protocol.ProtocolResponseWithError>;
    stopCoverage(): Promise<void>;
    getMediaQueries(): Promise<CSSMedia[]>;
    getRootLayer(nodeId: Protocol.DOM.NodeId): Promise<Protocol.CSS.CSSLayerData>;
    isEnabled(): boolean;
    private enable;
    getMatchedStyles(nodeId: Protocol.DOM.NodeId): Promise<CSSMatchedStyles | null>;
    getClassNames(styleSheetId: Protocol.CSS.StyleSheetId): Promise<string[]>;
    getComputedStyle(nodeId: Protocol.DOM.NodeId): Promise<Map<string, string> | null>;
    getBackgroundColors(nodeId: Protocol.DOM.NodeId): Promise<ContrastInfo | null>;
    getPlatformFonts(nodeId: Protocol.DOM.NodeId): Promise<Protocol.CSS.PlatformFontUsage[] | null>;
    allStyleSheets(): CSSStyleSheetHeader[];
    getInlineStyles(nodeId: Protocol.DOM.NodeId): Promise<InlineStyleResult | null>;
    forcePseudoState(node: DOMNode, pseudoClass: string, enable: boolean): boolean;
    pseudoState(node: DOMNode): string[] | null;
    setMediaText(styleSheetId: Protocol.CSS.StyleSheetId, range: TextUtils.TextRange.TextRange, newMediaText: string): Promise<boolean>;
    setContainerQueryText(styleSheetId: Protocol.CSS.StyleSheetId, range: TextUtils.TextRange.TextRange, newContainerQueryText: string): Promise<boolean>;
    setSupportsText(styleSheetId: Protocol.CSS.StyleSheetId, range: TextUtils.TextRange.TextRange, newSupportsText: string): Promise<boolean>;
    setScopeText(styleSheetId: Protocol.CSS.StyleSheetId, range: TextUtils.TextRange.TextRange, newScopeText: string): Promise<boolean>;
    addRule(styleSheetId: Protocol.CSS.StyleSheetId, ruleText: string, ruleLocation: TextUtils.TextRange.TextRange): Promise<CSSStyleRule | null>;
    requestViaInspectorStylesheet(node: DOMNode): Promise<CSSStyleSheetHeader | null>;
    mediaQueryResultChanged(): void;
    fontsUpdated(fontFace?: Protocol.CSS.FontFace | null): void;
    fontFaces(): CSSFontFace[];
    fontFaceForSource(src: string): CSSFontFace | undefined;
    styleSheetHeaderForId(id: Protocol.CSS.StyleSheetId): CSSStyleSheetHeader | null;
    styleSheetHeaders(): CSSStyleSheetHeader[];
    fireStyleSheetChanged(styleSheetId: Protocol.CSS.StyleSheetId, edit?: Edit): void;
    private ensureOriginalStyleSheetText;
    private originalContentRequestedForTest;
    originalStyleSheetText(header: CSSStyleSheetHeader): Promise<string | null>;
    getAllStyleSheetHeaders(): Iterable<CSSStyleSheetHeader>;
    styleSheetAdded(header: Protocol.CSS.CSSStyleSheetHeader): void;
    styleSheetRemoved(id: Protocol.CSS.StyleSheetId): void;
    getStyleSheetIdsForURL(url: Platform.DevToolsPath.UrlString): Protocol.CSS.StyleSheetId[];
    setStyleSheetText(styleSheetId: Protocol.CSS.StyleSheetId, newText: string, majorChange: boolean): Promise<string | null>;
    getStyleSheetText(styleSheetId: Protocol.CSS.StyleSheetId): Promise<string | null>;
    private onMainFrameNavigated;
    private resetStyleSheets;
    private resetFontFaces;
    suspendModel(): Promise<void>;
    resumeModel(): Promise<void>;
    setEffectivePropertyValueForNode(nodeId: Protocol.DOM.NodeId, propertyName: string, value: string): void;
    cachedMatchedCascadeForNode(node: DOMNode): Promise<CSSMatchedStyles | null>;
    discardCachedMatchedCascade(): void;
    createCSSPropertyTracker(propertiesToTrack: Protocol.CSS.CSSComputedStyleProperty[]): CSSPropertyTracker;
    enableCSSPropertyTracker(cssPropertyTracker: CSSPropertyTracker): void;
    disableCSSPropertyTracker(): void;
    private pollComputedStyleUpdates;
    dispose(): void;
    getAgent(): ProtocolProxyApi.CSSApi;
}
export declare enum Events {
    FontsUpdated = "FontsUpdated",
    MediaQueryResultChanged = "MediaQueryResultChanged",
    ModelWasEnabled = "ModelWasEnabled",
    PseudoStateForced = "PseudoStateForced",
    StyleSheetAdded = "StyleSheetAdded",
    StyleSheetChanged = "StyleSheetChanged",
    StyleSheetRemoved = "StyleSheetRemoved"
}
export interface StyleSheetChangedEvent {
    styleSheetId: Protocol.CSS.StyleSheetId;
    edit?: Edit;
}
export interface PseudoStateForcedEvent {
    node: DOMNode;
    pseudoClass: string;
    enable: boolean;
}
export declare type EventTypes = {
    [Events.FontsUpdated]: void;
    [Events.MediaQueryResultChanged]: void;
    [Events.ModelWasEnabled]: void;
    [Events.PseudoStateForced]: PseudoStateForcedEvent;
    [Events.StyleSheetAdded]: CSSStyleSheetHeader;
    [Events.StyleSheetChanged]: StyleSheetChangedEvent;
    [Events.StyleSheetRemoved]: CSSStyleSheetHeader;
};
export declare class Edit {
    styleSheetId: string;
    oldRange: TextUtils.TextRange.TextRange;
    newRange: TextUtils.TextRange.TextRange;
    newText: string;
    payload: Object | null;
    constructor(styleSheetId: string, oldRange: TextUtils.TextRange.TextRange, newText: string, payload: Object | null);
}
export declare class CSSLocation {
    #private;
    styleSheetId: Protocol.CSS.StyleSheetId;
    url: Platform.DevToolsPath.UrlString;
    lineNumber: number;
    columnNumber: number;
    constructor(header: CSSStyleSheetHeader, lineNumber: number, columnNumber?: number);
    cssModel(): CSSModel;
    header(): CSSStyleSheetHeader | null;
}
export declare class InlineStyleResult {
    inlineStyle: CSSStyleDeclaration | null;
    attributesStyle: CSSStyleDeclaration | null;
    constructor(inlineStyle: CSSStyleDeclaration | null, attributesStyle: CSSStyleDeclaration | null);
}
export declare class CSSPropertyTracker extends Common.ObjectWrapper.ObjectWrapper<CSSPropertyTrackerEventTypes> {
    #private;
    constructor(cssModel: CSSModel, propertiesToTrack: Protocol.CSS.CSSComputedStyleProperty[]);
    start(): void;
    stop(): void;
    getTrackedProperties(): Protocol.CSS.CSSComputedStyleProperty[];
}
export declare enum CSSPropertyTrackerEvents {
    TrackedCSSPropertiesUpdated = "TrackedCSSPropertiesUpdated"
}
export declare type CSSPropertyTrackerEventTypes = {
    [CSSPropertyTrackerEvents.TrackedCSSPropertiesUpdated]: (DOMNode | null)[];
};
export interface ContrastInfo {
    backgroundColors: string[] | null;
    computedFontSize: string;
    computedFontWeight: string;
}
