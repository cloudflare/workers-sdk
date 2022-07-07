// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../core/i18n/i18n.js';
import * as QuickOpen from '../../ui/legacy/components/quick_open/quick_open.js';
import { evaluateScriptSnippet, findSnippetsProject } from './ScriptSnippetFileSystem.js';
const UIStrings = {
    /**
    *@description Text in Snippets Quick Open of the Sources panel when opening snippets
    */
    noSnippetsFound: 'No snippets found.',
    /**
    *@description Text for command prefix of run a code snippet
    */
    run: 'Run',
    /**
    *@description Text for suggestion of run a code snippet
    */
    snippet: 'Snippet',
};
const str_ = i18n.i18n.registerUIStrings('panels/snippets/SnippetsQuickOpen.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
const i18nLazyString = i18n.i18n.getLazilyComputedLocalizedString.bind(undefined, str_);
let snippetsQuickOpenInstance;
export class SnippetsQuickOpen extends QuickOpen.FilteredListWidget.Provider {
    snippets;
    constructor() {
        super();
        this.snippets = [];
    }
    static instance(opts = { forceNew: null }) {
        const { forceNew } = opts;
        if (!snippetsQuickOpenInstance || forceNew) {
            snippetsQuickOpenInstance = new SnippetsQuickOpen();
        }
        return snippetsQuickOpenInstance;
    }
    selectItem(itemIndex, _promptValue) {
        if (itemIndex === null) {
            return;
        }
        void evaluateScriptSnippet(this.snippets[itemIndex]);
    }
    notFoundText(_query) {
        return i18nString(UIStrings.noSnippetsFound);
    }
    attach() {
        this.snippets = findSnippetsProject().uiSourceCodes();
    }
    detach() {
        this.snippets = [];
    }
    itemScoreAt(itemIndex, query) {
        // Prefer short matches over long matches
        return query.length / this.snippets[itemIndex].name().length;
    }
    itemCount() {
        return this.snippets.length;
    }
    itemKeyAt(itemIndex) {
        return this.snippets[itemIndex].name();
    }
    renderItem(itemIndex, query, titleElement, _subtitleElement) {
        titleElement.textContent = this.snippets[itemIndex].name();
        titleElement.classList.add('monospace');
        QuickOpen.FilteredListWidget.FilteredListWidget.highlightRanges(titleElement, query, true);
    }
}
QuickOpen.FilteredListWidget.registerProvider({
    prefix: '!',
    iconName: 'ic_command_run_snippet',
    provider: () => Promise.resolve(SnippetsQuickOpen.instance()),
    titlePrefix: i18nLazyString(UIStrings.run),
    titleSuggestion: i18nLazyString(UIStrings.snippet),
});
//# sourceMappingURL=SnippetsQuickOpen.js.map