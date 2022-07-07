import type * as TextUtils from '../../models/text_utils/text_utils.js';
import type * as Protocol from '../../generated/protocol.js';
import type { CSSModel, Edit } from './CSSModel.js';
import { CSSLocation } from './CSSModel.js';
import type { CSSStyleSheetHeader } from './CSSStyleSheetHeader.js';
declare type CSSQueryPayload = Protocol.CSS.CSSMedia | Protocol.CSS.CSSContainerQuery | Protocol.CSS.CSSSupports | Protocol.CSS.CSSScope;
export declare abstract class CSSQuery {
    text: string;
    range?: TextUtils.TextRange.TextRange | null;
    styleSheetId?: Protocol.CSS.StyleSheetId;
    protected cssModel: CSSModel;
    constructor(cssModel: CSSModel);
    protected abstract reinitialize(payload: CSSQueryPayload): void;
    abstract active(): boolean;
    rebase(edit: Edit): void;
    equal(other: CSSQuery): boolean;
    lineNumberInSource(): number | undefined;
    columnNumberInSource(): number | undefined;
    header(): CSSStyleSheetHeader | null;
    rawLocation(): CSSLocation | null;
}
export {};
