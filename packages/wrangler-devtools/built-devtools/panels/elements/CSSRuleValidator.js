// Copyright 2022 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../core/i18n/i18n.js';
const UIStrings = {
    /**
      *@description Hint prefix for deprecated properties.
      */
    deprecatedPropertyHintPrefix: 'Deprecated Property',
    /**
      *@description Hint prefix for rule validation.
      */
    ruleValidationHintPrefix: 'Inactive rule',
    /**
      *@description Hint for rules that was violated because of same elements rule.
      *@example {flex-wrap: nowrap} REASON_RULE_CODE
      *@example {align-content} AFFECTED_RULE_CODE
      */
    ruleViolatedBySameElementRuleReason: 'This element has {REASON_RULE_CODE} rule, therefore {AFFECTED_RULE_CODE} has no effect.',
    /**
      *@description Possible fix for rules that was violated because of same elements rule.
      *@example {flex-wrap: nowrap} REASON_RULE_CODE
      */
    ruleViolatedBySameElementRuleFix: 'For this property to work, please remove or change the value of {REASON_RULE_CODE}',
    /**
      *@description Hint for rules that was violated because of parent element rule.
      *@example {display: block} REASON_RULE_CODE
      *@example {flex} AFFECTED_RULE_CODE
      */
    ruleViolatedByParentElementRuleReason: 'Parent element has {REASON_RULE_CODE} rule, therefore this elements {AFFECTED_RULE_CODE} has no effect',
    /**
      *@description Posible fix for rules that was violated because of parent element rule.
      *@example {display: block} EXISTING_PARENT_ELEMENT_RULE
      *@example {display: flex} TARGET_PARENT_ELEMENT_RULE
      */
    ruleViolatedByParentElementRuleFix: 'Please change parent elements {EXISTING_PARENT_ELEMENT_RULE} to {TARGET_PARENT_ELEMENT_RULE} to fix this issue.',
};
const str_ = i18n.i18n.registerUIStrings('panels/elements/CSSRuleValidator.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class AuthoringHint {
    #hintType;
    #hintMessage;
    #possibleFixMessage;
    #learnMore;
    constructor(property, hintType, hintMessage, possibleFixMessage, showLearnMore) {
        this.#hintType = hintType;
        this.#hintMessage = hintMessage;
        this.#possibleFixMessage = possibleFixMessage;
        this.#learnMore = showLearnMore ? property : null; // TODO: Add Goo.gle short link base url
    }
    getHintPrefix() {
        switch (this.#hintType) {
            case "ruleValidation" /* RULE_VALIDATION */:
                return i18nString(UIStrings.ruleValidationHintPrefix);
            case "deprecatedProperty" /* DEPRECATED_PROPERTY */:
                return i18nString(UIStrings.deprecatedPropertyHintPrefix);
        }
    }
    getHintMessage() {
        return this.#hintMessage;
    }
    getPossibleFixMessage() {
        return this.#possibleFixMessage;
    }
    getLearnMoreLink() {
        return this.#learnMore;
    }
}
export class CSSRuleValidator {
    #affectedProperties;
    constructor(affectedProperties) {
        this.#affectedProperties = affectedProperties;
    }
    getAffectedProperties() {
        return this.#affectedProperties;
    }
}
export class AlignContentValidator extends CSSRuleValidator {
    constructor() {
        super(['align-content']);
    }
    isRuleValid(computedStyles) {
        if (computedStyles === null || computedStyles === undefined) {
            return true;
        }
        const display = computedStyles.get('display');
        if (display !== 'flex' && display !== 'inline-flex') {
            return true;
        }
        return computedStyles.get('flex-wrap') !== 'nowrap';
    }
    getAuthoringHint() {
        const reasonRuleCode = '<code class="unbreakable-text"><span class="property">flex-wrap</span>: nowrap</code>';
        const affectedRuleCode = '<code class="unbreakable-text"><span class="property">align-content</span></code>';
        return new AuthoringHint('align-content', "ruleValidation" /* RULE_VALIDATION */, i18nString(UIStrings.ruleViolatedBySameElementRuleReason, {
            'REASON_RULE_CODE': reasonRuleCode,
            'AFFECTED_RULE_CODE': affectedRuleCode,
        }), i18nString(UIStrings.ruleViolatedBySameElementRuleFix, {
            'REASON_RULE_CODE': reasonRuleCode,
        }), true);
    }
}
export class FlexItemValidator extends CSSRuleValidator {
    constructor() {
        super(['flex', 'flex-basis', 'flex-grow', 'flex-shrink']);
    }
    isRuleValid(computedStyles, parentsComputedStyles) {
        if (computedStyles === null || computedStyles === undefined || parentsComputedStyles === null ||
            parentsComputedStyles === undefined) {
            return true;
        }
        const parentDisplay = parentsComputedStyles.get('display');
        return parentDisplay === 'flex' || parentDisplay === 'inline-flex';
    }
    getAuthoringHint(property, parentsComputedStyles) {
        const reasonRuleCode = '<code class="unbreakable-text"><span class="property">display</span>:' + parentsComputedStyles?.get('display') + '</code>';
        const affectedRuleCode = '<code class="unbreakable-text"><span class="property">' + property + '</span></code>';
        const targetParentRuleCode = '<code class="unbreakable-text"><span class="property">display</span>: flex</code>';
        return new AuthoringHint(property, "ruleValidation" /* RULE_VALIDATION */, i18nString(UIStrings.ruleViolatedByParentElementRuleReason, {
            'REASON_RULE_CODE': reasonRuleCode,
            'AFFECTED_RULE_CODE': affectedRuleCode,
        }), i18nString(UIStrings.ruleViolatedByParentElementRuleFix, {
            'EXISTING_PARENT_ELEMENT_RULE': reasonRuleCode,
            'TARGET_PARENT_ELEMENT_RULE': targetParentRuleCode,
        }), true);
    }
}
const setupCSSRulesValidators = () => {
    const validators = [new AlignContentValidator(), new FlexItemValidator()];
    const validatorsMap = new Map();
    for (const validator of validators) {
        const affectedProperties = validator.getAffectedProperties();
        for (const affectedProperty of affectedProperties) {
            let propertyValidators = validatorsMap.get(affectedProperty);
            if (propertyValidators === undefined) {
                propertyValidators = [];
            }
            propertyValidators.push(validator);
            validatorsMap.set(affectedProperty, propertyValidators);
        }
    }
    return validatorsMap;
};
export const cssRuleValidatorsMap = setupCSSRulesValidators();
//# sourceMappingURL=CSSRuleValidator.js.map