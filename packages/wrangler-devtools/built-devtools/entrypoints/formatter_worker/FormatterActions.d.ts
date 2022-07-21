export declare const enum FormatterActions {
    FORMAT = "format",
    PARSE_CSS = "parseCSS",
    HTML_OUTLINE = "htmlOutline",
    JAVASCRIPT_OUTLINE = "javaScriptOutline",
    JAVASCRIPT_IDENTIFIERS = "javaScriptIdentifiers",
    JAVASCRIPT_SUBSTITUTE = "javaScriptSubstitute",
    JAVASCRIPT_SCOPE_TREE = "javaScriptScopeTree",
    EVALUATE_JAVASCRIPT_SUBSTRING = "evaluatableJavaScriptSubstring",
    ARGUMENTS_LIST = "argumentsList"
}
export interface FormatMapping {
    original: number[];
    formatted: number[];
}
export interface FormatResult {
    content: string;
    mapping: FormatMapping;
}
export declare const enum DefinitionKind {
    None = 0,
    Let = 1,
    Var = 2,
    Fixed = 3
}
export interface ScopeTreeNode {
    variables: {
        name: string;
        kind: DefinitionKind;
        offsets: number[];
    }[];
    start: number;
    end: number;
    children: ScopeTreeNode[];
}
