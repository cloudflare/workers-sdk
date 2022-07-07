import * as Protocol from '../../generated/protocol.js';
import * as TextUtils from '../../models/text_utils/text_utils.js';
import * as Platform from '../platform/platform.js';
import { CSSContainerQuery } from './CSSContainerQuery.js';
import { CSSLayer } from './CSSLayer.js';
import { CSSMedia } from './CSSMedia.js';
import { CSSScope } from './CSSScope.js';
import { CSSSupports } from './CSSSupports.js';
import type { CSSModel, Edit } from './CSSModel.js';
import { CSSStyleDeclaration } from './CSSStyleDeclaration.js';
import type { CSSStyleSheetHeader } from './CSSStyleSheetHeader.js';
export declare class CSSRule {
    readonly cssModelInternal: CSSModel;
    styleSheetId: Protocol.CSS.StyleSheetId | undefined;
    sourceURL: string | undefined;
    origin: Protocol.CSS.StyleSheetOrigin;
    style: CSSStyleDeclaration;
    constructor(cssModel: CSSModel, payload: {
        style: Protocol.CSS.CSSStyle;
        styleSheetId: Protocol.CSS.StyleSheetId | undefined;
        origin: Protocol.CSS.StyleSheetOrigin;
    });
    rebase(edit: Edit): void;
    resourceURL(): Platform.DevToolsPath.UrlString;
    isUserAgent(): boolean;
    isInjected(): boolean;
    isViaInspector(): boolean;
    isRegular(): boolean;
    cssModel(): CSSModel;
    getStyleSheetHeader(styleSheetId: Protocol.CSS.StyleSheetId): CSSStyleSheetHeader;
}
declare class CSSValue {
    text: string;
    range: TextUtils.TextRange.TextRange | undefined;
    constructor(payload: Protocol.CSS.Value);
    rebase(edit: Edit): void;
}
export declare class CSSStyleRule extends CSSRule {
    selectors: CSSValue[];
    media: CSSMedia[];
    containerQueries: CSSContainerQuery[];
    supports: CSSSupports[];
    scopes: CSSScope[];
    layers: CSSLayer[];
    wasUsed: boolean;
    constructor(cssModel: CSSModel, payload: Protocol.CSS.CSSRule, wasUsed?: boolean);
    static createDummyRule(cssModel: CSSModel, selectorText: string): CSSStyleRule;
    private reinitializeSelectors;
    setSelectorText(newSelector: string): Promise<boolean>;
    selectorText(): string;
    selectorRange(): TextUtils.TextRange.TextRange | null;
    lineNumberInSource(selectorIndex: number): number;
    columnNumberInSource(selectorIndex: number): number | undefined;
    rebase(edit: Edit): void;
}
export declare class CSSKeyframesRule {
    #private;
    constructor(cssModel: CSSModel, payload: Protocol.CSS.CSSKeyframesRule);
    name(): CSSValue;
    keyframes(): CSSKeyframeRule[];
}
export declare class CSSKeyframeRule extends CSSRule {
    #private;
    constructor(cssModel: CSSModel, payload: Protocol.CSS.CSSKeyframeRule);
    key(): CSSValue;
    private reinitializeKey;
    rebase(edit: Edit): void;
    setKeyText(newKeyText: string): Promise<boolean>;
}
export {};
