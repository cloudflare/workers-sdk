export declare const enum AuthoringHintType {
    RULE_VALIDATION = "ruleValidation",
    DEPRECATED_PROPERTY = "deprecatedProperty"
}
export declare class AuthoringHint {
    #private;
    constructor(property: string, hintType: AuthoringHintType, hintMessage: string, possibleFixMessage: string | null, showLearnMore: boolean);
    getHintPrefix(): string;
    getHintMessage(): string;
    getPossibleFixMessage(): string | null;
    getLearnMoreLink(): string | null;
}
export declare abstract class CSSRuleValidator {
    #private;
    constructor(affectedProperties: string[]);
    abstract isRuleValid(computedStyles: Map<String, String> | null, parentsComputedStyles?: Map<String, String> | null): boolean;
    getAffectedProperties(): string[];
    abstract getAuthoringHint(propertyName: string, parentComputedStyles: Map<String, String> | null): AuthoringHint;
}
export declare class AlignContentValidator extends CSSRuleValidator {
    constructor();
    isRuleValid(computedStyles: Map<String, String> | null): boolean;
    getAuthoringHint(): AuthoringHint;
}
export declare class FlexItemValidator extends CSSRuleValidator {
    constructor();
    isRuleValid(computedStyles: Map<String, String> | null, parentsComputedStyles: Map<String, String> | null): boolean;
    getAuthoringHint(property: string, parentsComputedStyles: Map<String, String> | null): AuthoringHint;
}
export declare const cssRuleValidatorsMap: Map<String, CSSRuleValidator[]>;
