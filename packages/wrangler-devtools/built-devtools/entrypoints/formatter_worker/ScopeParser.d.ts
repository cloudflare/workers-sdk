import * as Acorn from '../../third_party/acorn/acorn.js';
import type { ScopeTreeNode } from './FormatterActions.js';
import { DefinitionKind } from './FormatterActions.js';
export declare function parseScopes(expression: string): Scope | null;
export interface Use {
    offset: number;
    scope: Scope;
    isShorthandAssignmentProperty: boolean;
}
export interface VariableUses {
    definitionKind: DefinitionKind;
    uses: Use[];
}
export declare class Scope {
    #private;
    readonly variables: Map<string, VariableUses>;
    readonly parent: Scope | null;
    readonly start: number;
    readonly end: number;
    readonly children: Scope[];
    constructor(start: number, end: number, parent: Scope | null);
    export(): ScopeTreeNode;
    addVariable(name: string, offset: number, definitionKind: DefinitionKind, isShorthandAssignmentProperty: boolean): void;
    findBinders(name: string): VariableUses[];
    finalizeToParent(isFunctionScope: boolean): void;
}
export declare class ScopeVariableAnalysis {
    #private;
    constructor(node: Acorn.ESTree.Node);
    run(): Scope;
    getFreeVariables(): Map<string, Use[]>;
    getAllNames(): Set<string>;
}
