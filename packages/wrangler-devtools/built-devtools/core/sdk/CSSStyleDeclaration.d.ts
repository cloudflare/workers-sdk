import * as TextUtils from '../../models/text_utils/text_utils.js';
import type * as Protocol from '../../generated/protocol.js';
import type { CSSModel, Edit } from './CSSModel.js';
import { CSSProperty } from './CSSProperty.js';
import type { CSSRule } from './CSSRule.js';
import type { Target } from './Target.js';
export declare class CSSStyleDeclaration {
    #private;
    parentRule: CSSRule | null;
    styleSheetId: Protocol.CSS.StyleSheetId | undefined;
    range: TextUtils.TextRange.TextRange | null;
    cssText: string | undefined;
    type: Type;
    constructor(cssModel: CSSModel, parentRule: CSSRule | null, payload: Protocol.CSS.CSSStyle, type: Type);
    rebase(edit: Edit): void;
    private reinitialize;
    private generateSyntheticPropertiesIfNeeded;
    private computeLeadingProperties;
    leadingProperties(): CSSProperty[];
    target(): Target;
    cssModel(): CSSModel;
    private computeInactiveProperties;
    allProperties(): CSSProperty[];
    hasActiveProperty(name: string): boolean;
    getPropertyValue(name: string): string;
    isPropertyImplicit(name: string): boolean;
    longhandProperties(name: string): CSSProperty[];
    propertyAt(index: number): CSSProperty | null;
    pastLastSourcePropertyIndex(): number;
    private insertionRange;
    newBlankProperty(index?: number): CSSProperty;
    setText(text: string, majorChange: boolean): Promise<boolean>;
    insertPropertyAt(index: number, name: string, value: string, userCallback?: ((arg0: boolean) => void)): void;
    appendProperty(name: string, value: string, userCallback?: ((arg0: boolean) => void)): void;
}
export declare enum Type {
    Regular = "Regular",
    Inline = "Inline",
    Attributes = "Attributes"
}
