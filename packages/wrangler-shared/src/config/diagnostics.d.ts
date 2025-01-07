/**
 * Diagnostic errors and warnings.
 *
 * The structure is a tree, where each node can contain zero or more errors, warnings and child diagnostics objects.
 * You can check whether the overall tree has errors or warnings, and you can render a string representation of the errors or warnings.
 */
export declare class Diagnostics {
    description: string;
    errors: string[];
    warnings: string[];
    children: Diagnostics[];
    /**
     * Create a new Diagnostics object.
     * @param description A general description of this collection of messages.
     */
    constructor(description: string);
    /**
     * Merge the given `diagnostics` into this as a child.
     */
    addChild(diagnostics: Diagnostics): void;
    /** Does this or any of its children have errors. */
    hasErrors(): boolean;
    /** Render the errors of this and all its children. */
    renderErrors(): string;
    /** Does this or any of its children have warnings. */
    hasWarnings(): boolean;
    /** Render the warnings of this and all its children. */
    renderWarnings(): string;
    private render;
}
