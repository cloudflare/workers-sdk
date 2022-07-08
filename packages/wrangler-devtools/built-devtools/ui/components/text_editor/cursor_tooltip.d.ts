import * as CodeMirror from '../../../third_party/codemirror.next/codemirror.next.js';
export declare type ArgumentHintsTooltip = [CodeMirror.StateField<CodeMirror.Tooltip | null>, CodeMirror.ViewPlugin<{}>];
export declare const closeTooltip: CodeMirror.StateEffectType<null>;
export declare function cursorTooltip(source: (state: CodeMirror.EditorState, pos: number) => Promise<(() => CodeMirror.TooltipView) | null>): ArgumentHintsTooltip;
