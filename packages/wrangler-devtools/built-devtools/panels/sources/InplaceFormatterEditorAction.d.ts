import * as UI from '../../ui/legacy/legacy.js';
import type { EditorAction, SourcesView } from './SourcesView.js';
export declare class InplaceFormatterEditorAction implements EditorAction {
    private button;
    private sourcesView;
    constructor();
    static instance(opts?: {
        forceNew: boolean | null;
    }): InplaceFormatterEditorAction;
    private editorSelected;
    private editorClosed;
    private updateButton;
    getOrCreateButton(sourcesView: SourcesView): UI.Toolbar.ToolbarButton;
    private isFormattable;
    private formatSourceInPlace;
    private contentLoaded;
    /**
     * Post-format callback
     */
    private formattingComplete;
}
