// Copyright 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as TextUtils from '../../models/text_utils/text_utils.js';
import { cssMetadata, CustomVariableRegex, VariableRegex } from './CSSMetadata.js';
import { CSSKeyframesRule, CSSStyleRule } from './CSSRule.js';
import { CSSStyleDeclaration, Type } from './CSSStyleDeclaration.js';
export class CSSMatchedStyles {
    #cssModelInternal;
    #nodeInternal;
    #addedStyles;
    #matchingSelectors;
    #keyframesInternal;
    #nodeForStyleInternal;
    #inheritedStyles;
    #mainDOMCascade;
    #pseudoDOMCascades;
    #customHighlightPseudoDOMCascades;
    #styleToDOMCascade;
    constructor(cssModel, node, inlinePayload, attributesPayload, matchedPayload, pseudoPayload, inheritedPayload, inheritedPseudoPayload, animationsPayload) {
        this.#cssModelInternal = cssModel;
        this.#nodeInternal = node;
        this.#addedStyles = new Map();
        this.#matchingSelectors = new Map();
        this.#keyframesInternal = [];
        if (animationsPayload) {
            this.#keyframesInternal = animationsPayload.map(rule => new CSSKeyframesRule(cssModel, rule));
        }
        this.#nodeForStyleInternal = new Map();
        this.#inheritedStyles = new Set();
        matchedPayload = cleanUserAgentPayload(matchedPayload);
        for (const inheritedResult of inheritedPayload) {
            inheritedResult.matchedCSSRules = cleanUserAgentPayload(inheritedResult.matchedCSSRules);
        }
        this.#mainDOMCascade = this.buildMainCascade(inlinePayload, attributesPayload, matchedPayload, inheritedPayload);
        [this.#pseudoDOMCascades, this.#customHighlightPseudoDOMCascades] =
            this.buildPseudoCascades(pseudoPayload, inheritedPseudoPayload);
        this.#styleToDOMCascade = new Map();
        for (const domCascade of Array.from(this.#customHighlightPseudoDOMCascades.values())
            .concat(Array.from(this.#pseudoDOMCascades.values()))
            .concat(this.#mainDOMCascade)) {
            for (const style of domCascade.styles()) {
                this.#styleToDOMCascade.set(style, domCascade);
            }
        }
        function cleanUserAgentPayload(payload) {
            for (const ruleMatch of payload) {
                cleanUserAgentSelectors(ruleMatch);
            }
            // Merge UA rules that are sequential and have similar selector/media.
            const cleanMatchedPayload = [];
            for (const ruleMatch of payload) {
                const lastMatch = cleanMatchedPayload[cleanMatchedPayload.length - 1];
                if (!lastMatch || ruleMatch.rule.origin !== 'user-agent' || lastMatch.rule.origin !== 'user-agent' ||
                    ruleMatch.rule.selectorList.text !== lastMatch.rule.selectorList.text ||
                    mediaText(ruleMatch) !== mediaText(lastMatch)) {
                    cleanMatchedPayload.push(ruleMatch);
                    continue;
                }
                mergeRule(ruleMatch, lastMatch);
            }
            return cleanMatchedPayload;
            function mergeRule(from, to) {
                const shorthands = new Map();
                const properties = new Map();
                for (const entry of to.rule.style.shorthandEntries) {
                    shorthands.set(entry.name, entry.value);
                }
                for (const entry of to.rule.style.cssProperties) {
                    properties.set(entry.name, entry.value);
                }
                for (const entry of from.rule.style.shorthandEntries) {
                    shorthands.set(entry.name, entry.value);
                }
                for (const entry of from.rule.style.cssProperties) {
                    properties.set(entry.name, entry.value);
                }
                to.rule.style.shorthandEntries = [...shorthands.entries()].map(([name, value]) => ({ name, value }));
                to.rule.style.cssProperties = [...properties.entries()].map(([name, value]) => ({ name, value }));
            }
            function mediaText(ruleMatch) {
                if (!ruleMatch.rule.media) {
                    return null;
                }
                return ruleMatch.rule.media.map(media => media.text).join(', ');
            }
            function cleanUserAgentSelectors(ruleMatch) {
                const { matchingSelectors, rule } = ruleMatch;
                if (rule.origin !== 'user-agent' || !matchingSelectors.length) {
                    return;
                }
                rule.selectorList.selectors = rule.selectorList.selectors.filter((item, i) => matchingSelectors.includes(i));
                rule.selectorList.text = rule.selectorList.selectors.map(item => item.text).join(', ');
                ruleMatch.matchingSelectors = matchingSelectors.map((item, i) => i);
            }
        }
    }
    buildMainCascade(inlinePayload, attributesPayload, matchedPayload, inheritedPayload) {
        const nodeCascades = [];
        const nodeStyles = [];
        function addAttributesStyle() {
            if (!attributesPayload) {
                return;
            }
            const style = new CSSStyleDeclaration(this.#cssModelInternal, null, attributesPayload, Type.Attributes);
            this.#nodeForStyleInternal.set(style, this.#nodeInternal);
            nodeStyles.push(style);
        }
        // Inline style has the greatest specificity.
        if (inlinePayload && this.#nodeInternal.nodeType() === Node.ELEMENT_NODE) {
            const style = new CSSStyleDeclaration(this.#cssModelInternal, null, inlinePayload, Type.Inline);
            this.#nodeForStyleInternal.set(style, this.#nodeInternal);
            nodeStyles.push(style);
        }
        // Add rules in reverse order to match the cascade order.
        let addedAttributesStyle;
        for (let i = matchedPayload.length - 1; i >= 0; --i) {
            const rule = new CSSStyleRule(this.#cssModelInternal, matchedPayload[i].rule);
            if ((rule.isInjected() || rule.isUserAgent()) && !addedAttributesStyle) {
                // Show element's Style Attributes after all author rules.
                addedAttributesStyle = true;
                addAttributesStyle.call(this);
            }
            this.#nodeForStyleInternal.set(rule.style, this.#nodeInternal);
            nodeStyles.push(rule.style);
            this.addMatchingSelectors(this.#nodeInternal, rule, matchedPayload[i].matchingSelectors);
        }
        if (!addedAttributesStyle) {
            addAttributesStyle.call(this);
        }
        nodeCascades.push(new NodeCascade(this, nodeStyles, false /* #isInherited */));
        // Walk the node structure and identify styles with inherited properties.
        let parentNode = this.#nodeInternal.parentNode;
        for (let i = 0; parentNode && inheritedPayload && i < inheritedPayload.length; ++i) {
            const inheritedStyles = [];
            const entryPayload = inheritedPayload[i];
            const inheritedInlineStyle = entryPayload.inlineStyle ?
                new CSSStyleDeclaration(this.#cssModelInternal, null, entryPayload.inlineStyle, Type.Inline) :
                null;
            if (inheritedInlineStyle && this.containsInherited(inheritedInlineStyle)) {
                this.#nodeForStyleInternal.set(inheritedInlineStyle, parentNode);
                inheritedStyles.push(inheritedInlineStyle);
                this.#inheritedStyles.add(inheritedInlineStyle);
            }
            const inheritedMatchedCSSRules = entryPayload.matchedCSSRules || [];
            for (let j = inheritedMatchedCSSRules.length - 1; j >= 0; --j) {
                const inheritedRule = new CSSStyleRule(this.#cssModelInternal, inheritedMatchedCSSRules[j].rule);
                this.addMatchingSelectors(parentNode, inheritedRule, inheritedMatchedCSSRules[j].matchingSelectors);
                if (!this.containsInherited(inheritedRule.style)) {
                    continue;
                }
                if (containsStyle(nodeStyles, inheritedRule.style) ||
                    containsStyle(this.#inheritedStyles, inheritedRule.style)) {
                    continue;
                }
                this.#nodeForStyleInternal.set(inheritedRule.style, parentNode);
                inheritedStyles.push(inheritedRule.style);
                this.#inheritedStyles.add(inheritedRule.style);
            }
            parentNode = parentNode.parentNode;
            nodeCascades.push(new NodeCascade(this, inheritedStyles, true /* #isInherited */));
        }
        return new DOMInheritanceCascade(nodeCascades);
        function containsStyle(styles, query) {
            if (!query.styleSheetId || !query.range) {
                return false;
            }
            for (const style of styles) {
                if (query.styleSheetId === style.styleSheetId && style.range && query.range.equal(style.range)) {
                    return true;
                }
            }
            return false;
        }
    }
    /**
     * Pseudo rule matches received via the inspector protocol are grouped by pseudo type.
     * For custom highlight pseudos, we need to instead group the rule matches by highlight
     * name in order to produce separate cascades for each highlight name. This is necessary
     * so that styles of ::highlight(foo) are not shown as overriding styles of ::highlight(bar).
     *
     * This helper function takes a list of rule matches and generates separate NodeCascades
     * for each custom highlight name that was matched.
     */
    buildSplitCustomHighlightCascades(rules, node, isInherited, pseudoCascades) {
        const splitHighlightRules = new Map();
        for (let j = rules.length - 1; j >= 0; --j) {
            const highlightNamesToMatchingSelectorIndices = this.customHighlightNamesToMatchingSelectorIndices(rules[j]);
            for (const [highlightName, matchingSelectors] of highlightNamesToMatchingSelectorIndices) {
                const pseudoRule = new CSSStyleRule(this.#cssModelInternal, rules[j].rule);
                this.#nodeForStyleInternal.set(pseudoRule.style, node);
                if (isInherited) {
                    this.#inheritedStyles.add(pseudoRule.style);
                }
                this.addMatchingSelectors(node, pseudoRule, matchingSelectors);
                const ruleListForHighlightName = splitHighlightRules.get(highlightName);
                if (ruleListForHighlightName) {
                    ruleListForHighlightName.push(pseudoRule.style);
                }
                else {
                    splitHighlightRules.set(highlightName, [pseudoRule.style]);
                }
            }
        }
        for (const [highlightName, highlightStyles] of splitHighlightRules) {
            const nodeCascade = new NodeCascade(this, highlightStyles, isInherited, true /* #isHighlightPseudoCascade*/);
            const cascadeListForHighlightName = pseudoCascades.get(highlightName);
            if (cascadeListForHighlightName) {
                cascadeListForHighlightName.push(nodeCascade);
            }
            else {
                pseudoCascades.set(highlightName, [nodeCascade]);
            }
        }
    }
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
    customHighlightNamesToMatchingSelectorIndices(ruleMatch) {
        const highlightNamesToMatchingSelectors = new Map();
        for (let i = 0; i < ruleMatch.matchingSelectors.length; i++) {
            const matchingSelectorIndex = ruleMatch.matchingSelectors[i];
            const selectorText = ruleMatch.rule.selectorList.selectors[matchingSelectorIndex].text;
            const highlightNameMatch = selectorText.match(/::highlight\((.*)\)/);
            if (highlightNameMatch) {
                const highlightName = highlightNameMatch[1];
                const selectorsForName = highlightNamesToMatchingSelectors.get(highlightName);
                if (selectorsForName) {
                    selectorsForName.push(matchingSelectorIndex);
                }
                else {
                    highlightNamesToMatchingSelectors.set(highlightName, [matchingSelectorIndex]);
                }
            }
        }
        return highlightNamesToMatchingSelectors;
    }
    buildPseudoCascades(pseudoPayload, inheritedPseudoPayload) {
        const pseudoInheritanceCascades = new Map();
        const customHighlightPseudoInheritanceCascades = new Map();
        if (!pseudoPayload) {
            return [pseudoInheritanceCascades, customHighlightPseudoInheritanceCascades];
        }
        const pseudoCascades = new Map();
        const customHighlightPseudoCascades = new Map();
        for (let i = 0; i < pseudoPayload.length; ++i) {
            const entryPayload = pseudoPayload[i];
            // PseudoElement nodes are not created unless "content" css property is set.
            const pseudoElement = this.#nodeInternal.pseudoElements().get(entryPayload.pseudoType)?.at(-1) || null;
            const pseudoStyles = [];
            const rules = entryPayload.matches || [];
            if (entryPayload.pseudoType === "highlight" /* Highlight */) {
                this.buildSplitCustomHighlightCascades(rules, this.#nodeInternal, false /* #isInherited */, customHighlightPseudoCascades);
            }
            else {
                for (let j = rules.length - 1; j >= 0; --j) {
                    const pseudoRule = new CSSStyleRule(this.#cssModelInternal, rules[j].rule);
                    pseudoStyles.push(pseudoRule.style);
                    const nodeForStyle = cssMetadata().isHighlightPseudoType(entryPayload.pseudoType) ? this.#nodeInternal : pseudoElement;
                    this.#nodeForStyleInternal.set(pseudoRule.style, nodeForStyle);
                    if (nodeForStyle) {
                        this.addMatchingSelectors(nodeForStyle, pseudoRule, rules[j].matchingSelectors);
                    }
                }
                const isHighlightPseudoCascade = cssMetadata().isHighlightPseudoType(entryPayload.pseudoType);
                const nodeCascade = new NodeCascade(this, pseudoStyles, false /* #isInherited */, isHighlightPseudoCascade /* #isHighlightPseudoCascade*/);
                pseudoCascades.set(entryPayload.pseudoType, [nodeCascade]);
            }
        }
        if (inheritedPseudoPayload) {
            let parentNode = this.#nodeInternal.parentNode;
            for (let i = 0; parentNode && i < inheritedPseudoPayload.length; ++i) {
                const inheritedPseudoMatches = inheritedPseudoPayload[i].pseudoElements;
                for (let j = 0; j < inheritedPseudoMatches.length; ++j) {
                    const inheritedEntryPayload = inheritedPseudoMatches[j];
                    const rules = inheritedEntryPayload.matches || [];
                    if (inheritedEntryPayload.pseudoType === "highlight" /* Highlight */) {
                        this.buildSplitCustomHighlightCascades(rules, parentNode, true /* #isInherited */, customHighlightPseudoCascades);
                    }
                    else {
                        const pseudoStyles = [];
                        for (let k = rules.length - 1; k >= 0; --k) {
                            const pseudoRule = new CSSStyleRule(this.#cssModelInternal, rules[k].rule);
                            pseudoStyles.push(pseudoRule.style);
                            this.#nodeForStyleInternal.set(pseudoRule.style, parentNode);
                            this.#inheritedStyles.add(pseudoRule.style);
                            this.addMatchingSelectors(parentNode, pseudoRule, rules[k].matchingSelectors);
                        }
                        const isHighlightPseudoCascade = cssMetadata().isHighlightPseudoType(inheritedEntryPayload.pseudoType);
                        const nodeCascade = new NodeCascade(this, pseudoStyles, true /* #isInherited */, isHighlightPseudoCascade /* #isHighlightPseudoCascade*/);
                        const cascadeListForPseudoType = pseudoCascades.get(inheritedEntryPayload.pseudoType);
                        if (cascadeListForPseudoType) {
                            cascadeListForPseudoType.push(nodeCascade);
                        }
                        else {
                            pseudoCascades.set(inheritedEntryPayload.pseudoType, [nodeCascade]);
                        }
                    }
                }
                parentNode = parentNode.parentNode;
            }
        }
        // Now that we've built the arrays of NodeCascades for each pseudo type, convert them into
        // DOMInheritanceCascades.
        for (const [pseudoType, nodeCascade] of pseudoCascades.entries()) {
            pseudoInheritanceCascades.set(pseudoType, new DOMInheritanceCascade(nodeCascade));
        }
        for (const [highlightName, nodeCascade] of customHighlightPseudoCascades.entries()) {
            customHighlightPseudoInheritanceCascades.set(highlightName, new DOMInheritanceCascade(nodeCascade));
        }
        return [pseudoInheritanceCascades, customHighlightPseudoInheritanceCascades];
    }
    addMatchingSelectors(node, rule, matchingSelectorIndices) {
        for (const matchingSelectorIndex of matchingSelectorIndices) {
            const selector = rule.selectors[matchingSelectorIndex];
            this.setSelectorMatches(node, selector.text, true);
        }
    }
    node() {
        return this.#nodeInternal;
    }
    cssModel() {
        return this.#cssModelInternal;
    }
    hasMatchingSelectors(rule) {
        const matchingSelectors = this.getMatchingSelectors(rule);
        return matchingSelectors.length > 0 && this.queryMatches(rule.style);
    }
    getMatchingSelectors(rule) {
        const node = this.nodeForStyle(rule.style);
        if (!node || typeof node.id !== 'number') {
            return [];
        }
        const map = this.#matchingSelectors.get(node.id);
        if (!map) {
            return [];
        }
        const result = [];
        for (let i = 0; i < rule.selectors.length; ++i) {
            if (map.get(rule.selectors[i].text)) {
                result.push(i);
            }
        }
        return result;
    }
    async recomputeMatchingSelectors(rule) {
        const node = this.nodeForStyle(rule.style);
        if (!node) {
            return;
        }
        const promises = [];
        for (const selector of rule.selectors) {
            promises.push(querySelector.call(this, node, selector.text));
        }
        await Promise.all(promises);
        async function querySelector(node, selectorText) {
            const ownerDocument = node.ownerDocument;
            if (!ownerDocument) {
                return;
            }
            // We assume that "matching" property does not ever change during the
            // MatchedStyleResult's lifetime.
            if (typeof node.id === 'number') {
                const map = this.#matchingSelectors.get(node.id);
                if (map && map.has(selectorText)) {
                    return;
                }
            }
            if (typeof ownerDocument.id !== 'number') {
                return;
            }
            const matchingNodeIds = await this.#nodeInternal.domModel().querySelectorAll(ownerDocument.id, selectorText);
            if (matchingNodeIds) {
                if (typeof node.id === 'number') {
                    this.setSelectorMatches(node, selectorText, matchingNodeIds.indexOf(node.id) !== -1);
                }
                else {
                    this.setSelectorMatches(node, selectorText, false);
                }
            }
        }
    }
    addNewRule(rule, node) {
        this.#addedStyles.set(rule.style, node);
        return this.recomputeMatchingSelectors(rule);
    }
    setSelectorMatches(node, selectorText, value) {
        if (typeof node.id !== 'number') {
            return;
        }
        let map = this.#matchingSelectors.get(node.id);
        if (!map) {
            map = new Map();
            this.#matchingSelectors.set(node.id, map);
        }
        map.set(selectorText, value);
    }
    queryMatches(style) {
        if (!style.parentRule) {
            return true;
        }
        const parentRule = style.parentRule;
        const queries = [...parentRule.media, ...parentRule.containerQueries, ...parentRule.supports, ...parentRule.scopes];
        for (const query of queries) {
            if (!query.active()) {
                return false;
            }
        }
        return true;
    }
    nodeStyles() {
        return this.#mainDOMCascade.styles();
    }
    keyframes() {
        return this.#keyframesInternal;
    }
    pseudoStyles(pseudoType) {
        const domCascade = this.#pseudoDOMCascades.get(pseudoType);
        return domCascade ? domCascade.styles() : [];
    }
    pseudoTypes() {
        return new Set(this.#pseudoDOMCascades.keys());
    }
    customHighlightPseudoStyles(highlightName) {
        const domCascade = this.#customHighlightPseudoDOMCascades.get(highlightName);
        return domCascade ? domCascade.styles() : [];
    }
    customHighlightPseudoNames() {
        return new Set(this.#customHighlightPseudoDOMCascades.keys());
    }
    containsInherited(style) {
        const properties = style.allProperties();
        for (let i = 0; i < properties.length; ++i) {
            const property = properties[i];
            // Does this style contain non-overridden inherited property?
            if (property.activeInStyle() && cssMetadata().isPropertyInherited(property.name)) {
                return true;
            }
        }
        return false;
    }
    nodeForStyle(style) {
        return this.#addedStyles.get(style) || this.#nodeForStyleInternal.get(style) || null;
    }
    availableCSSVariables(style) {
        const domCascade = this.#styleToDOMCascade.get(style) || null;
        return domCascade ? domCascade.findAvailableCSSVariables(style) : [];
    }
    computeCSSVariable(style, variableName) {
        const domCascade = this.#styleToDOMCascade.get(style) || null;
        return domCascade ? domCascade.computeCSSVariable(style, variableName) : null;
    }
    computeValue(style, value) {
        const domCascade = this.#styleToDOMCascade.get(style) || null;
        return domCascade ? domCascade.computeValue(style, value) : null;
    }
    /**
     * Same as computeValue, but to be used for `var(--#name [,...])` values only
     */
    computeSingleVariableValue(style, cssVariableValue) {
        const domCascade = this.#styleToDOMCascade.get(style) || null;
        const cssVariableValueNoSpaces = cssVariableValue.replace(/\s/g, '');
        return domCascade ? domCascade.computeSingleVariableValue(style, cssVariableValueNoSpaces) : null;
    }
    isInherited(style) {
        return this.#inheritedStyles.has(style);
    }
    propertyState(property) {
        const domCascade = this.#styleToDOMCascade.get(property.ownerStyle);
        return domCascade ? domCascade.propertyState(property) : null;
    }
    resetActiveProperties() {
        this.#mainDOMCascade.reset();
        for (const domCascade of this.#pseudoDOMCascades.values()) {
            domCascade.reset();
        }
        for (const domCascade of this.#customHighlightPseudoDOMCascades.values()) {
            domCascade.reset();
        }
    }
}
class NodeCascade {
    #matchedStyles;
    styles;
    #isInherited;
    #isHighlightPseudoCascade;
    propertiesState;
    activeProperties;
    constructor(matchedStyles, styles, isInherited, isHighlightPseudoCascade = false) {
        this.#matchedStyles = matchedStyles;
        this.styles = styles;
        this.#isInherited = isInherited;
        this.#isHighlightPseudoCascade = isHighlightPseudoCascade;
        this.propertiesState = new Map();
        this.activeProperties = new Map();
    }
    computeActiveProperties() {
        this.propertiesState.clear();
        this.activeProperties.clear();
        for (const style of this.styles) {
            const rule = style.parentRule;
            // Compute cascade for CSSStyleRules only.
            if (rule && !(rule instanceof CSSStyleRule)) {
                continue;
            }
            if (rule && !this.#matchedStyles.hasMatchingSelectors(rule)) {
                continue;
            }
            for (const property of style.allProperties()) {
                // Do not pick non-inherited properties from inherited styles.
                const metadata = cssMetadata();
                // All properties are inherited for highlight pseudos.
                if (this.#isInherited && !this.#isHighlightPseudoCascade && !metadata.isPropertyInherited(property.name)) {
                    continue;
                }
                if (!property.activeInStyle()) {
                    this.propertiesState.set(property, PropertyState.Overloaded);
                    continue;
                }
                const canonicalName = metadata.canonicalPropertyName(property.name);
                const isPropShorthand = Boolean(metadata.getLonghands(canonicalName));
                if (isPropShorthand) {
                    const longhandsFromShort = (property.value.match(CustomVariableRegex) || []).map(e => e.replace(CustomVariableRegex, '$2'));
                    longhandsFromShort.forEach(longhandProperty => {
                        if (metadata.isCSSPropertyName(longhandProperty)) {
                            const activeProperty = this.activeProperties.get(longhandProperty);
                            if (!activeProperty) {
                                this.activeProperties.set(longhandProperty, property);
                            }
                            else {
                                this.propertiesState.set(activeProperty, PropertyState.Overloaded);
                                this.activeProperties.set(longhandProperty, property);
                            }
                        }
                    });
                }
                const activeProperty = this.activeProperties.get(canonicalName);
                if (activeProperty && (activeProperty.important || !property.important)) {
                    this.propertiesState.set(property, PropertyState.Overloaded);
                    continue;
                }
                if (activeProperty) {
                    this.propertiesState.set(activeProperty, PropertyState.Overloaded);
                }
                this.propertiesState.set(property, PropertyState.Active);
                this.activeProperties.set(canonicalName, property);
            }
        }
    }
}
class DOMInheritanceCascade {
    #nodeCascades;
    #propertiesState;
    #availableCSSVariables;
    #computedCSSVariables;
    #initialized;
    #styleToNodeCascade;
    constructor(nodeCascades) {
        this.#nodeCascades = nodeCascades;
        this.#propertiesState = new Map();
        this.#availableCSSVariables = new Map();
        this.#computedCSSVariables = new Map();
        this.#initialized = false;
        this.#styleToNodeCascade = new Map();
        for (const nodeCascade of nodeCascades) {
            for (const style of nodeCascade.styles) {
                this.#styleToNodeCascade.set(style, nodeCascade);
            }
        }
    }
    findAvailableCSSVariables(style) {
        const nodeCascade = this.#styleToNodeCascade.get(style);
        if (!nodeCascade) {
            return [];
        }
        this.ensureInitialized();
        const availableCSSVariables = this.#availableCSSVariables.get(nodeCascade);
        if (!availableCSSVariables) {
            return [];
        }
        return Array.from(availableCSSVariables.keys());
    }
    computeCSSVariable(style, variableName) {
        const nodeCascade = this.#styleToNodeCascade.get(style);
        if (!nodeCascade) {
            return null;
        }
        this.ensureInitialized();
        const availableCSSVariables = this.#availableCSSVariables.get(nodeCascade);
        const computedCSSVariables = this.#computedCSSVariables.get(nodeCascade);
        if (!availableCSSVariables || !computedCSSVariables) {
            return null;
        }
        return this.innerComputeCSSVariable(availableCSSVariables, computedCSSVariables, variableName);
    }
    computeValue(style, value) {
        const nodeCascade = this.#styleToNodeCascade.get(style);
        if (!nodeCascade) {
            return null;
        }
        this.ensureInitialized();
        const availableCSSVariables = this.#availableCSSVariables.get(nodeCascade);
        const computedCSSVariables = this.#computedCSSVariables.get(nodeCascade);
        if (!availableCSSVariables || !computedCSSVariables) {
            return null;
        }
        return this.innerComputeValue(availableCSSVariables, computedCSSVariables, value);
    }
    computeSingleVariableValue(style, cssVariableValue) {
        const nodeCascade = this.#styleToNodeCascade.get(style);
        if (!nodeCascade) {
            return null;
        }
        this.ensureInitialized();
        const availableCSSVariables = this.#availableCSSVariables.get(nodeCascade);
        const computedCSSVariables = this.#computedCSSVariables.get(nodeCascade);
        if (!availableCSSVariables || !computedCSSVariables) {
            return null;
        }
        const computedValue = this.innerComputeValue(availableCSSVariables, computedCSSVariables, cssVariableValue);
        const { variableName } = this.getCSSVariableNameAndFallback(cssVariableValue);
        return { computedValue, fromFallback: variableName !== null && !availableCSSVariables.has(variableName) };
    }
    getCSSVariableNameAndFallback(cssVariableValue) {
        const match = cssVariableValue.match(/^var\((--[a-zA-Z0-9-_]+)[,]?\s*(.*)\)$/);
        return { variableName: match && match[1], fallback: match && match[2] };
    }
    innerComputeCSSVariable(availableCSSVariables, computedCSSVariables, variableName) {
        if (!availableCSSVariables.has(variableName)) {
            return null;
        }
        if (computedCSSVariables.has(variableName)) {
            return computedCSSVariables.get(variableName) || null;
        }
        // Set dummy value to avoid infinite recursion.
        computedCSSVariables.set(variableName, null);
        const definedValue = availableCSSVariables.get(variableName);
        if (definedValue === undefined || definedValue === null) {
            return null;
        }
        const computedValue = this.innerComputeValue(availableCSSVariables, computedCSSVariables, definedValue);
        computedCSSVariables.set(variableName, computedValue);
        return computedValue;
    }
    innerComputeValue(availableCSSVariables, computedCSSVariables, value) {
        const results = TextUtils.TextUtils.Utils.splitStringByRegexes(value, [VariableRegex]);
        const tokens = [];
        for (const result of results) {
            if (result.regexIndex === -1) {
                tokens.push(result.value);
                continue;
            }
            // process var() function
            const { variableName, fallback } = this.getCSSVariableNameAndFallback(result.value);
            if (!variableName) {
                return null;
            }
            const computedValue = this.innerComputeCSSVariable(availableCSSVariables, computedCSSVariables, variableName);
            if (computedValue === null && !fallback) {
                return null;
            }
            if (computedValue === null) {
                tokens.push(fallback);
            }
            else {
                tokens.push(computedValue);
            }
        }
        return tokens.map(token => token ? token.trim() : '').join(' ');
    }
    styles() {
        return Array.from(this.#styleToNodeCascade.keys());
    }
    propertyState(property) {
        this.ensureInitialized();
        return this.#propertiesState.get(property) || null;
    }
    reset() {
        this.#initialized = false;
        this.#propertiesState.clear();
        this.#availableCSSVariables.clear();
        this.#computedCSSVariables.clear();
    }
    ensureInitialized() {
        if (this.#initialized) {
            return;
        }
        this.#initialized = true;
        const activeProperties = new Map();
        for (const nodeCascade of this.#nodeCascades) {
            nodeCascade.computeActiveProperties();
            for (const entry of nodeCascade.propertiesState.entries()) {
                const property = entry[0];
                const state = entry[1];
                if (state === PropertyState.Overloaded) {
                    this.#propertiesState.set(property, PropertyState.Overloaded);
                    continue;
                }
                const canonicalName = cssMetadata().canonicalPropertyName(property.name);
                if (activeProperties.has(canonicalName)) {
                    this.#propertiesState.set(property, PropertyState.Overloaded);
                    continue;
                }
                activeProperties.set(canonicalName, property);
                this.#propertiesState.set(property, PropertyState.Active);
            }
        }
        // If every longhand of the shorthand is not active, then the shorthand is not active too.
        for (const entry of activeProperties.entries()) {
            const canonicalName = entry[0];
            const shorthandProperty = entry[1];
            const shorthandStyle = shorthandProperty.ownerStyle;
            const longhands = shorthandStyle.longhandProperties(shorthandProperty.name);
            if (!longhands.length) {
                continue;
            }
            let hasActiveLonghands = false;
            for (const longhand of longhands) {
                const longhandCanonicalName = cssMetadata().canonicalPropertyName(longhand.name);
                const longhandActiveProperty = activeProperties.get(longhandCanonicalName);
                if (!longhandActiveProperty) {
                    continue;
                }
                if (longhandActiveProperty.ownerStyle === shorthandStyle) {
                    hasActiveLonghands = true;
                    break;
                }
            }
            if (hasActiveLonghands) {
                continue;
            }
            activeProperties.delete(canonicalName);
            this.#propertiesState.set(shorthandProperty, PropertyState.Overloaded);
        }
        // Work inheritance chain backwards to compute visible CSS Variables.
        const accumulatedCSSVariables = new Map();
        for (let i = this.#nodeCascades.length - 1; i >= 0; --i) {
            const nodeCascade = this.#nodeCascades[i];
            const variableNames = [];
            for (const entry of nodeCascade.activeProperties.entries()) {
                const propertyName = entry[0];
                const property = entry[1];
                if (propertyName.startsWith('--')) {
                    accumulatedCSSVariables.set(propertyName, property.value);
                    variableNames.push(propertyName);
                }
            }
            const availableCSSVariablesMap = new Map(accumulatedCSSVariables);
            const computedVariablesMap = new Map();
            this.#availableCSSVariables.set(nodeCascade, availableCSSVariablesMap);
            this.#computedCSSVariables.set(nodeCascade, computedVariablesMap);
            for (const variableName of variableNames) {
                accumulatedCSSVariables.delete(variableName);
                accumulatedCSSVariables.set(variableName, this.innerComputeCSSVariable(availableCSSVariablesMap, computedVariablesMap, variableName));
            }
        }
    }
}
// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum
export var PropertyState;
(function (PropertyState) {
    PropertyState["Active"] = "Active";
    PropertyState["Overloaded"] = "Overloaded";
})(PropertyState || (PropertyState = {}));
//# sourceMappingURL=CSSMatchedStyles.js.map