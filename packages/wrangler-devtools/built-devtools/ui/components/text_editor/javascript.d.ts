import * as CodeMirror from '../../../third_party/codemirror.next/codemirror.next.js';
import * as UI from '../../legacy/legacy.js';
import { type ArgumentHintsTooltip } from './cursor_tooltip.js';
export declare function completion(): CodeMirror.Extension;
export declare function completeInContext(textBefore: string, query: string, force?: boolean): Promise<UI.SuggestBox.Suggestions>;
export declare const enum QueryType {
    Expression = 0,
    PropertyName = 1,
    PropertyExpression = 2,
    PotentiallyRetrievingFromMap = 3
}
export declare function getQueryType(tree: CodeMirror.Tree, pos: number, doc: CodeMirror.Text): {
    type: QueryType;
    from?: number;
    relatedNode?: CodeMirror.SyntaxNode;
} | null;
export declare function javascriptCompletionSource(cx: CodeMirror.CompletionContext): Promise<CodeMirror.CompletionResult | null>;
export declare function isExpressionComplete(expression: string): Promise<boolean>;
export declare function argumentHints(): ArgumentHintsTooltip;
export declare function closeArgumentsHintsTooltip(view: CodeMirror.EditorView, tooltip: CodeMirror.StateField<CodeMirror.Tooltip | null>): boolean;
