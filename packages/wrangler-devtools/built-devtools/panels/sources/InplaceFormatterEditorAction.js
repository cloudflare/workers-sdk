// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../core/i18n/i18n.js';
import * as Formatter from '../../models/formatter/formatter.js';
import * as Persistence from '../../models/persistence/persistence.js';
import * as UI from '../../ui/legacy/legacy.js';
import { Events, registerEditorAction } from './SourcesView.js';
const UIStrings = {
    /**
    *@description Title of the format button in the Sources panel
    *@example {file name} PH1
    */
    formatS: 'Format {PH1}',
    /**
    *@description Tooltip text that appears when hovering over the largeicon pretty print button in the Inplace Formatter Editor Action of the Sources panel
    */
    format: 'Format',
};
const str_ = i18n.i18n.registerUIStrings('panels/sources/InplaceFormatterEditorAction.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
let inplaceFormatterEditorActionInstance;
export class InplaceFormatterEditorAction {
    button;
    sourcesView;
    constructor() {
    }
    static instance(opts = { forceNew: null }) {
        const { forceNew } = opts;
        if (!inplaceFormatterEditorActionInstance || forceNew) {
            inplaceFormatterEditorActionInstance = new InplaceFormatterEditorAction();
        }
        return inplaceFormatterEditorActionInstance;
    }
    editorSelected(event) {
        const uiSourceCode = event.data;
        this.updateButton(uiSourceCode);
    }
    editorClosed(event) {
        const { wasSelected } = event.data;
        if (wasSelected) {
            this.updateButton(null);
        }
    }
    updateButton(uiSourceCode) {
        const isFormattable = this.isFormattable(uiSourceCode);
        this.button.element.classList.toggle('hidden', !isFormattable);
        if (uiSourceCode && isFormattable) {
            this.button.setTitle(i18nString(UIStrings.formatS, { PH1: uiSourceCode.name() }));
        }
    }
    getOrCreateButton(sourcesView) {
        if (this.button) {
            return this.button;
        }
        this.sourcesView = sourcesView;
        this.sourcesView.addEventListener(Events.EditorSelected, this.editorSelected.bind(this));
        this.sourcesView.addEventListener(Events.EditorClosed, this.editorClosed.bind(this));
        this.button = new UI.Toolbar.ToolbarButton(i18nString(UIStrings.format), 'largeicon-pretty-print');
        this.button.addEventListener(UI.Toolbar.ToolbarButton.Events.Click, this.formatSourceInPlace, this);
        this.updateButton(sourcesView.currentUISourceCode());
        return this.button;
    }
    isFormattable(uiSourceCode) {
        if (!uiSourceCode) {
            return false;
        }
        if (uiSourceCode.project().canSetFileContent()) {
            return true;
        }
        if (Persistence.Persistence.PersistenceImpl.instance().binding(uiSourceCode)) {
            return true;
        }
        return uiSourceCode.contentType().isStyleSheet();
    }
    formatSourceInPlace() {
        const uiSourceCode = this.sourcesView.currentUISourceCode();
        if (!uiSourceCode || !this.isFormattable(uiSourceCode)) {
            return;
        }
        if (uiSourceCode.isDirty()) {
            void this.contentLoaded(uiSourceCode, uiSourceCode.workingCopy());
        }
        else {
            void uiSourceCode.requestContent().then(deferredContent => {
                void this.contentLoaded(uiSourceCode, deferredContent.content || '');
            });
        }
    }
    async contentLoaded(uiSourceCode, content) {
        const highlighterType = uiSourceCode.mimeType();
        const { formattedContent, formattedMapping } = await Formatter.ScriptFormatter.format(uiSourceCode.contentType(), highlighterType, content);
        this.formattingComplete(uiSourceCode, formattedContent, formattedMapping);
    }
    /**
     * Post-format callback
     */
    formattingComplete(uiSourceCode, formattedContent, formatterMapping) {
        if (uiSourceCode.workingCopy() === formattedContent) {
            return;
        }
        const sourceFrame = this.sourcesView.viewForFile(uiSourceCode);
        let start = [0, 0];
        if (sourceFrame) {
            const selection = sourceFrame.textEditor.toLineColumn(sourceFrame.textEditor.state.selection.main.head);
            start = formatterMapping.originalToFormatted(selection.lineNumber, selection.columnNumber);
        }
        uiSourceCode.setWorkingCopy(formattedContent);
        this.sourcesView.showSourceLocation(uiSourceCode, { lineNumber: start[0], columnNumber: start[1] });
    }
}
registerEditorAction(InplaceFormatterEditorAction.instance);
//# sourceMappingURL=InplaceFormatterEditorAction.js.map