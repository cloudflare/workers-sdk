import * as Protocol from '../../generated/protocol.js';
import type { CSSModel } from './CSSModel.js';
import type { CSSProperty } from './CSSProperty.js';
import { CSSKeyframesRule, CSSStyleRule } from './CSSRule.js';
import { CSSStyleDeclaration } from './CSSStyleDeclaration.js';
import type { DOMNode } from './DOMModel.js';
export declare class CSSMatchedStyles {
    #private;
    constructor(cssModel: CSSModel, node: DOMNode, inlinePayload: Protocol.CSS.CSSStyle | null, attributesPayload: Protocol.CSS.CSSStyle | null, matchedPayload: Protocol.CSS.RuleMatch[], pseudoPayload: Protocol.CSS.PseudoElementMatches[], inheritedPayload: Protocol.CSS.InheritedStyleEntry[], inheritedPseudoPayload: Protocol.CSS.InheritedPseudoElementMatches[], animationsPayload: Protocol.CSS.CSSKeyframesRule[]);
    private buildMainCascade;
    /**
     * Pseudo rule matches received via the inspector protocol are grouped by pseudo type.
     * For custom highlight pseudos, we need to instead group the rule matches by highlight
     * name in order to produce separate cascades for each highlight name. This is necessary
     * so that styles of ::highlight(foo) are not shown as overriding styles of ::highlight(bar).
     *
     * This helper function takes a list of rule matches and generates separate NodeCascades
     * for each custom highlight name that was matched.
     */
    private buildSplitCustomHighlightCascades;
    /**
     * Return a mapping of the highlight names in the specified RuleMatch to
     * the indices of selectors in that selector list with that highlight name.
     *
     * For example, consider the following ruleset:
     * span::highlight(foo), div, #mySpan::highlight(bar), .highlighted::highlight(foo) {
     *   color: blue;
     * }
     *
     * For a <span id="mySpan" class="highlighted"></span>, a RuleMatch for that span
     * would have matchingSelectors [0, 2, 3] indicating that the span
     * matches all of the highlight selectors.
     *
     * For that RuleMatch, this function would produce the following map:
     * {
     *  "foo": [0, 3],
     *  "bar": [2]
     * }
     *
     * @param ruleMatch
     * @returns A mapping of highlight names to lists of indices into the selector
     * list associated with ruleMatch. The indices correspond to the selectors in the rule
     * associated with the key's highlight name.
     */
    private customHighlightNamesToMatchingSelectorIndices;
    private buildPseudoCascades;
    private addMatchingSelectors;
    node(): DOMNode;
    cssModel(): CSSModel;
    hasMatchingSelectors(rule: CSSStyleRule): boolean;
    getMatchingSelectors(rule: CSSStyleRule): number[];
    recomputeMatchingSelectors(rule: CSSStyleRule): Promise<void>;
    addNewRule(rule: CSSStyleRule, node: DOMNode): Promise<void>;
    private setSelectorMatches;
    queryMatches(style: CSSStyleDeclaration): boolean;
    nodeStyles(): CSSStyleDeclaration[];
    keyframes(): CSSKeyframesRule[];
    pseudoStyles(pseudoType: Protocol.DOM.PseudoType): CSSStyleDeclaration[];
    pseudoTypes(): Set<Protocol.DOM.PseudoType>;
    customHighlightPseudoStyles(highlightName: string): CSSStyleDeclaration[];
    customHighlightPseudoNames(): Set<string>;
    private containsInherited;
    nodeForStyle(style: CSSStyleDeclaration): DOMNode | null;
    availableCSSVariables(style: CSSStyleDeclaration): string[];
    computeCSSVariable(style: CSSStyleDeclaration, variableName: string): string | null;
    computeValue(style: CSSStyleDeclaration, value: string): string | null;
    /**
     * Same as computeValue, but to be used for `var(--#name [,...])` values only
     */
    computeSingleVariableValue(style: CSSStyleDeclaration, cssVariableValue: string): {
        computedValue: string | null;
        fromFallback: boolean;
    } | null;
    isInherited(style: CSSStyleDeclaration): boolean;
    propertyState(property: CSSProperty): PropertyState | null;
    resetActiveProperties(): void;
}
export declare enum PropertyState {
    Active = "Active",
    Overloaded = "Overloaded"
}
