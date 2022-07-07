/*
 * Copyright (C) 2011 Google Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *     * Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above
 * copyright notice, this list of conditions and the following disclaimer
 * in the documentation and/or other materials provided with the
 * distribution.
 *     * Neither the name of Google Inc. nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
import * as Common from '../../../../core/common/common.js';
import * as i18n from '../../../../core/i18n/i18n.js';
import * as Platform from '../../../../core/platform/platform.js';
import * as Formatter from '../../../../models/formatter/formatter.js';
import * as TextUtils from '../../../../models/text_utils/text_utils.js';
import * as CodeMirror from '../../../../third_party/codemirror.next/codemirror.next.js';
import * as CodeHighlighter from '../../../components/code_highlighter/code_highlighter.js';
import * as TextEditor from '../../../components/text_editor/text_editor.js';
import * as UI from '../../legacy.js';
const UIStrings = {
    /**
    *@description Text for the source of something
    */
    source: 'Source',
    /**
    *@description Text to pretty print a file
    */
    prettyPrint: 'Pretty print',
    /**
    *@description Text when something is loading
    */
    loading: 'Loading…',
    /**
    * @description Shown at the bottom of the Sources panel when the user has made multiple
    * simultaneous text selections in the text editor.
    * @example {2} PH1
    */
    dSelectionRegions: '{PH1} selection regions',
    /**
    * @description Position indicator in Source Frame of the Sources panel. The placeholder is a
    * hexadecimal number value, which is why it is prefixed with '0x'.
    * @example {abc} PH1
    */
    bytecodePositionXs: 'Bytecode position `0x`{PH1}',
    /**
    *@description Text in Source Frame of the Sources panel
    *@example {2} PH1
    *@example {2} PH2
    */
    lineSColumnS: 'Line {PH1}, Column {PH2}',
    /**
    *@description Text in Source Frame of the Sources panel
    *@example {2} PH1
    */
    dCharactersSelected: '{PH1} characters selected',
    /**
    *@description Text in Source Frame of the Sources panel
    *@example {2} PH1
    *@example {2} PH2
    */
    dLinesDCharactersSelected: '{PH1} lines, {PH2} characters selected',
};
const str_ = i18n.i18n.registerUIStrings('ui/legacy/components/source_frame/SourceFrame.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class SourceFrameImpl extends Common.ObjectWrapper.eventMixin(UI.View.SimpleView) {
    options;
    lazyContent;
    prettyInternal;
    rawContent;
    formattedContentPromise;
    formattedMap;
    prettyToggle;
    shouldAutoPrettyPrint;
    progressToolbarItem;
    textEditorInternal;
    // The 'clean' document, before editing
    baseDoc;
    prettyBaseDoc = null;
    displayedSelection = null;
    searchConfig;
    delayedFindSearchMatches;
    currentSearchResultIndex;
    searchResults;
    searchRegex;
    loadError;
    muteChangeEventsForSetContent;
    sourcePosition;
    searchableView;
    editable;
    positionToReveal;
    lineToScrollTo;
    selectionToSet;
    loadedInternal;
    contentRequested;
    wasmDisassemblyInternal;
    contentSet;
    constructor(lazyContent, options = {}) {
        super(i18nString(UIStrings.source));
        this.options = options;
        this.lazyContent = lazyContent;
        this.prettyInternal = false;
        this.rawContent = null;
        this.formattedContentPromise = null;
        this.formattedMap = null;
        this.prettyToggle = new UI.Toolbar.ToolbarToggle(i18nString(UIStrings.prettyPrint), 'largeicon-pretty-print');
        this.prettyToggle.addEventListener(UI.Toolbar.ToolbarButton.Events.Click, () => {
            void this.setPretty(!this.prettyToggle.toggled());
        });
        this.shouldAutoPrettyPrint = false;
        this.prettyToggle.setVisible(false);
        this.progressToolbarItem = new UI.Toolbar.ToolbarItem(document.createElement('div'));
        this.textEditorInternal = new TextEditor.TextEditor.TextEditor(this.placeholderEditorState(''));
        this.textEditorInternal.style.flexGrow = '1';
        this.element.appendChild(this.textEditorInternal);
        this.element.addEventListener('keydown', (event) => {
            if (event.defaultPrevented) {
                event.stopPropagation();
            }
        });
        this.baseDoc = this.textEditorInternal.state.doc;
        this.searchConfig = null;
        this.delayedFindSearchMatches = null;
        this.currentSearchResultIndex = -1;
        this.searchResults = [];
        this.searchRegex = null;
        this.loadError = false;
        this.muteChangeEventsForSetContent = false;
        this.sourcePosition = new UI.Toolbar.ToolbarText();
        this.searchableView = null;
        this.editable = false;
        this.positionToReveal = null;
        this.lineToScrollTo = null;
        this.selectionToSet = null;
        this.loadedInternal = false;
        this.contentRequested = false;
        this.wasmDisassemblyInternal = null;
        this.contentSet = false;
    }
    placeholderEditorState(content) {
        return CodeMirror.EditorState.create({
            doc: content,
            extensions: [
                CodeMirror.EditorState.readOnly.of(true),
                this.options.lineNumbers !== false ? CodeMirror.lineNumbers() : [],
                TextEditor.Config.theme(),
            ],
        });
    }
    editorConfiguration(doc) {
        return [
            CodeMirror.EditorView.updateListener.of(update => this.dispatchEventToListeners("EditorUpdate" /* EditorUpdate */, update)),
            TextEditor.Config.baseConfiguration(doc),
            TextEditor.Config.closeBrackets,
            TextEditor.Config.sourcesAutocompletion.instance(),
            TextEditor.Config.showWhitespace.instance(),
            TextEditor.Config.allowScrollPastEof.instance(),
            CodeMirror.Prec.lowest(TextEditor.Config.codeFolding.instance()),
            TextEditor.Config.autoDetectIndent.instance(),
            sourceFrameTheme,
            CodeMirror.EditorView.domEventHandlers({
                focus: () => this.onFocus(),
                blur: () => this.onBlur(),
                scroll: () => this.dispatchEventToListeners("EditorScroll" /* EditorScroll */),
                contextmenu: event => this.onContextMenu(event),
            }),
            CodeMirror.lineNumbers({
                domEventHandlers: { contextmenu: (_view, block, event) => this.onLineGutterContextMenu(block.from, event) },
            }),
            CodeMirror.EditorView.updateListener.of((update) => {
                if (update.selectionSet || update.docChanged) {
                    this.updateSourcePosition();
                }
                if (update.docChanged) {
                    this.onTextChanged();
                }
            }),
            activeSearchState,
            CodeMirror.Prec.lowest(searchHighlighter),
            config.language.of([]),
            this.wasmDisassemblyInternal ? markNonBreakableLines(this.wasmDisassemblyInternal) : nonBreakableLines,
            this.options.lineWrapping ? CodeMirror.EditorView.lineWrapping : [],
            this.options.lineNumbers !== false ? CodeMirror.lineNumbers() : [],
        ];
    }
    onBlur() {
    }
    onFocus() {
        this.resetCurrentSearchResultIndex();
    }
    get wasmDisassembly() {
        return this.wasmDisassemblyInternal;
    }
    editorLocationToUILocation(lineNumber, columnNumber) {
        if (this.wasmDisassemblyInternal) {
            columnNumber = this.wasmDisassemblyInternal.lineNumberToBytecodeOffset(lineNumber);
            lineNumber = 0;
        }
        else if (this.prettyInternal) {
            [lineNumber, columnNumber] = this.prettyToRawLocation(lineNumber, columnNumber);
        }
        return { lineNumber, columnNumber };
    }
    uiLocationToEditorLocation(lineNumber, columnNumber = 0) {
        if (this.wasmDisassemblyInternal) {
            lineNumber = this.wasmDisassemblyInternal.bytecodeOffsetToLineNumber(columnNumber);
            columnNumber = 0;
        }
        else if (this.prettyInternal) {
            [lineNumber, columnNumber] = this.rawToPrettyLocation(lineNumber, columnNumber);
        }
        return { lineNumber, columnNumber };
    }
    setCanPrettyPrint(canPrettyPrint, autoPrettyPrint) {
        this.shouldAutoPrettyPrint = canPrettyPrint && Boolean(autoPrettyPrint);
        this.prettyToggle.setVisible(canPrettyPrint);
    }
    setEditable(editable) {
        this.editable = editable;
        if (this.loaded && editable !== !this.textEditor.state.readOnly) {
            this.textEditor.dispatch({ effects: config.editable.reconfigure(CodeMirror.EditorState.readOnly.of(!editable)) });
        }
    }
    async setPretty(value) {
        this.prettyInternal = value;
        this.prettyToggle.setEnabled(false);
        const wasLoaded = this.loaded;
        const { textEditor } = this;
        const selection = textEditor.state.selection.main;
        const startPos = textEditor.toLineColumn(selection.from), endPos = textEditor.toLineColumn(selection.to);
        let newSelection;
        if (this.prettyInternal) {
            const formatInfo = await this.requestFormattedContent();
            this.formattedMap = formatInfo.formattedMapping;
            await this.setContent(formatInfo.formattedContent);
            this.prettyBaseDoc = textEditor.state.doc;
            const start = this.rawToPrettyLocation(startPos.lineNumber, startPos.columnNumber);
            const end = this.rawToPrettyLocation(endPos.lineNumber, endPos.columnNumber);
            newSelection = textEditor.createSelection({ lineNumber: start[0], columnNumber: start[1] }, { lineNumber: end[0], columnNumber: end[1] });
        }
        else {
            await this.setContent(this.rawContent || '');
            this.baseDoc = textEditor.state.doc;
            const start = this.prettyToRawLocation(startPos.lineNumber, startPos.columnNumber);
            const end = this.prettyToRawLocation(endPos.lineNumber, endPos.columnNumber);
            newSelection = textEditor.createSelection({ lineNumber: start[0], columnNumber: start[1] }, { lineNumber: end[0], columnNumber: end[1] });
        }
        if (wasLoaded) {
            textEditor.revealPosition(newSelection, false);
        }
        this.prettyToggle.setEnabled(true);
        this.updatePrettyPrintState();
    }
    // If this is a disassembled WASM file or a pretty-printed file,
    // wire in a line number formatter that shows binary offsets or line
    // numbers in the original source.
    getLineNumberFormatter() {
        if (this.options.lineNumbers === false) {
            return [];
        }
        let formatNumber = null;
        if (this.wasmDisassemblyInternal) {
            const disassembly = this.wasmDisassemblyInternal;
            const lastBytecodeOffset = disassembly.lineNumberToBytecodeOffset(disassembly.lineNumbers - 1);
            const bytecodeOffsetDigits = lastBytecodeOffset.toString(16).length + 1;
            formatNumber = (lineNumber) => {
                const bytecodeOffset = disassembly.lineNumberToBytecodeOffset(Math.min(disassembly.lineNumbers, lineNumber) - 1);
                return `0x${bytecodeOffset.toString(16).padStart(bytecodeOffsetDigits, '0')}`;
            };
        }
        else if (this.prettyInternal) {
            formatNumber = (lineNumber) => {
                const line = this.prettyToRawLocation(lineNumber - 1, 0)[0] + 1;
                if (lineNumber === 1) {
                    return String(line);
                }
                if (line !== this.prettyToRawLocation(lineNumber - 2, 0)[0] + 1) {
                    return String(line);
                }
                return '-';
            };
        }
        return formatNumber ? CodeMirror.lineNumbers({ formatNumber }) : [];
    }
    updateLineNumberFormatter() {
        this.textEditor.dispatch({ effects: config.lineNumbers.reconfigure(this.getLineNumberFormatter()) });
    }
    updatePrettyPrintState() {
        this.prettyToggle.setToggled(this.prettyInternal);
        this.textEditorInternal.classList.toggle('pretty-printed', this.prettyInternal);
        this.updateLineNumberFormatter();
    }
    prettyToRawLocation(line, column = 0) {
        if (!this.formattedMap) {
            return [line, column];
        }
        return this.formattedMap.formattedToOriginal(line, column);
    }
    rawToPrettyLocation(line, column) {
        if (!this.formattedMap) {
            return [line, column];
        }
        return this.formattedMap.originalToFormatted(line, column);
    }
    hasLoadError() {
        return this.loadError;
    }
    wasShown() {
        void this.ensureContentLoaded();
        this.wasShownOrLoaded();
    }
    willHide() {
        super.willHide();
        this.clearPositionToReveal();
    }
    async toolbarItems() {
        return [this.prettyToggle, this.sourcePosition, this.progressToolbarItem];
    }
    get loaded() {
        return this.loadedInternal;
    }
    get textEditor() {
        return this.textEditorInternal;
    }
    get pretty() {
        return this.prettyInternal;
    }
    get contentType() {
        return this.loadError ? '' : this.getContentType();
    }
    getContentType() {
        return '';
    }
    async ensureContentLoaded() {
        if (!this.contentRequested) {
            this.contentRequested = true;
            const progressIndicator = new UI.ProgressIndicator.ProgressIndicator();
            progressIndicator.setTitle(i18nString(UIStrings.loading));
            progressIndicator.setTotalWork(100);
            this.progressToolbarItem.element.appendChild(progressIndicator.element);
            const deferredContent = await this.lazyContent();
            let error, content;
            if (deferredContent.content === null) {
                error = deferredContent.error;
                this.rawContent = deferredContent.error;
            }
            else {
                content = deferredContent.content;
                if (deferredContent.isEncoded) {
                    const view = new DataView(Common.Base64.decode(deferredContent.content));
                    const decoder = new TextDecoder();
                    this.rawContent = decoder.decode(view, { stream: true });
                }
                else {
                    this.rawContent = deferredContent.content;
                }
            }
            progressIndicator.setWorked(1);
            if (!error && this.contentType === 'application/wasm') {
                const worker = Common.Worker.WorkerWrapper.fromURL(new URL('../../../../entrypoints/wasmparser_worker/wasmparser_worker-entrypoint.js', import.meta.url));
                const promise = new Promise((resolve, reject) => {
                    worker.onmessage =
                        // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        ({ data }) => {
                            if ('event' in data) {
                                switch (data.event) {
                                    case 'progress':
                                        progressIndicator.setWorked(data.params.percentage);
                                        break;
                                }
                            }
                            else if ('method' in data) {
                                switch (data.method) {
                                    case 'disassemble':
                                        if ('error' in data) {
                                            reject(data.error);
                                        }
                                        else if ('result' in data) {
                                            resolve(data.result);
                                        }
                                        break;
                                }
                            }
                        };
                    worker.onerror = reject;
                });
                worker.postMessage({ method: 'disassemble', params: { content } });
                try {
                    const { lines, offsets, functionBodyOffsets } = await promise;
                    this.rawContent = content = CodeMirror.Text.of(lines);
                    this.wasmDisassemblyInternal = new Common.WasmDisassembly.WasmDisassembly(offsets, functionBodyOffsets);
                }
                catch (e) {
                    this.rawContent = content = error = e.message;
                }
                finally {
                    worker.terminate();
                }
            }
            progressIndicator.setWorked(100);
            progressIndicator.done();
            this.formattedContentPromise = null;
            this.formattedMap = null;
            this.prettyToggle.setEnabled(true);
            if (error) {
                this.loadError = true;
                this.textEditor.editor.setState(this.placeholderEditorState(error));
                this.prettyToggle.setEnabled(false);
            }
            else {
                if (this.shouldAutoPrettyPrint && TextUtils.TextUtils.isMinified(content)) {
                    await this.setPretty(true);
                }
                else {
                    await this.setContent(this.rawContent || '');
                }
            }
            this.contentSet = true;
        }
    }
    requestFormattedContent() {
        if (this.formattedContentPromise) {
            return this.formattedContentPromise;
        }
        const content = this.rawContent instanceof CodeMirror.Text ? this.rawContent.sliceString(0) : this.rawContent || '';
        this.formattedContentPromise = Formatter.ScriptFormatter.formatScriptContent(this.contentType, content);
        return this.formattedContentPromise;
    }
    revealPosition(position, shouldHighlight) {
        this.lineToScrollTo = null;
        this.selectionToSet = null;
        let line = 0, column = 0;
        if (typeof position === 'number') {
            const { doc } = this.textEditor.state;
            if (position > doc.length) {
                line = doc.lines - 1;
            }
            else if (position >= 0) {
                const lineObj = doc.lineAt(position);
                line = lineObj.number - 1;
                column = position - lineObj.from;
            }
        }
        else {
            line = position.lineNumber;
            column = position.columnNumber ?? 0;
        }
        this.positionToReveal = { line, column, shouldHighlight: shouldHighlight };
        this.innerRevealPositionIfNeeded();
    }
    innerRevealPositionIfNeeded() {
        if (!this.positionToReveal) {
            return;
        }
        if (!this.loaded || !this.isShowing()) {
            return;
        }
        const location = this.uiLocationToEditorLocation(this.positionToReveal.line, this.positionToReveal.column);
        const { textEditor } = this;
        textEditor.revealPosition(textEditor.createSelection(location), this.positionToReveal.shouldHighlight);
        this.positionToReveal = null;
    }
    clearPositionToReveal() {
        this.positionToReveal = null;
    }
    scrollToLine(line) {
        this.clearPositionToReveal();
        this.lineToScrollTo = line;
        this.innerScrollToLineIfNeeded();
    }
    innerScrollToLineIfNeeded() {
        if (this.lineToScrollTo !== null) {
            if (this.loaded && this.isShowing()) {
                const { textEditor } = this;
                // DevTools history items are 0-based, but CodeMirror is 1-based, so we have to increment the
                // line we want to scroll to by 1.
                const position = textEditor.toOffset({ lineNumber: this.lineToScrollTo + 1, columnNumber: 0 });
                textEditor.dispatch({ effects: CodeMirror.EditorView.scrollIntoView(position, { y: 'start' }) });
                this.lineToScrollTo = null;
            }
        }
    }
    setSelection(textRange) {
        this.selectionToSet = textRange;
        this.innerSetSelectionIfNeeded();
    }
    innerSetSelectionIfNeeded() {
        const sel = this.selectionToSet;
        if (sel && this.loaded && this.isShowing()) {
            const { textEditor } = this;
            textEditor.dispatch({
                selection: textEditor.createSelection({ lineNumber: sel.startLine, columnNumber: sel.startColumn }, { lineNumber: sel.endLine, columnNumber: sel.endColumn }),
            });
            this.selectionToSet = null;
        }
    }
    wasShownOrLoaded() {
        this.innerRevealPositionIfNeeded();
        this.innerSetSelectionIfNeeded();
        this.innerScrollToLineIfNeeded();
    }
    onTextChanged() {
        const wasPretty = this.pretty;
        this.prettyInternal = Boolean(this.prettyBaseDoc && this.textEditor.state.doc.eq(this.prettyBaseDoc));
        if (this.prettyInternal !== wasPretty) {
            this.updatePrettyPrintState();
        }
        this.prettyToggle.setEnabled(this.isClean());
        if (this.searchConfig && this.searchableView) {
            this.performSearch(this.searchConfig, false, false);
        }
    }
    isClean() {
        return this.textEditor.state.doc.eq(this.baseDoc) ||
            (this.prettyBaseDoc !== null && this.textEditor.state.doc.eq(this.prettyBaseDoc));
    }
    contentCommitted() {
        this.baseDoc = this.textEditorInternal.state.doc;
        this.prettyBaseDoc = null;
        this.rawContent = this.textEditor.state.doc.toString();
        this.formattedMap = null;
        this.formattedContentPromise = null;
        if (this.prettyInternal) {
            this.prettyInternal = false;
            this.updatePrettyPrintState();
        }
        this.prettyToggle.setEnabled(true);
    }
    simplifyMimeType(content, mimeType) {
        if (!mimeType) {
            return '';
        }
        // There are plenty of instances where TSX/JSX files are served with out the trailing x, i.e. JSX with a 'js' suffix
        // which breaks the formatting. Therefore, if the mime type is TypeScript or JavaScript, we switch to the TSX/JSX
        // superset so that we don't break formatting.
        if (mimeType.indexOf('typescript') >= 0) {
            return 'text/typescript-jsx';
        }
        if (mimeType.indexOf('javascript') >= 0 || mimeType.indexOf('jscript') >= 0 ||
            mimeType.indexOf('ecmascript') >= 0) {
            return 'text/jsx';
        }
        // A hack around the fact that files with "php" extension might be either standalone or html embedded php scripts.
        if (mimeType === 'text/x-php') {
            const strContent = typeof content === 'string' ? content : content.sliceString(0);
            if (strContent.match(/\<\?.*\?\>/g)) {
                return 'application/x-httpd-php';
            }
        }
        if (mimeType === 'application/wasm') {
            // text/webassembly is not a proper MIME type, but CodeMirror uses it for WAT syntax highlighting.
            // We generally use application/wasm, which is the correct MIME type for Wasm binary data.
            return 'text/webassembly';
        }
        return mimeType;
    }
    async getLanguageSupport(content) {
        const mimeType = this.simplifyMimeType(content, this.contentType) || '';
        const languageDesc = await CodeHighlighter.CodeHighlighter.languageFromMIME(mimeType);
        if (!languageDesc) {
            return [];
        }
        if (mimeType === 'text/jsx') {
            return [
                languageDesc,
                CodeMirror.javascript.javascriptLanguage.data.of({ autocomplete: CodeMirror.completeAnyWord }),
            ];
        }
        return languageDesc;
    }
    async updateLanguageMode(content) {
        const langExtension = await this.getLanguageSupport(content);
        this.textEditor.dispatch({ effects: config.language.reconfigure(langExtension) });
    }
    async setContent(content) {
        this.muteChangeEventsForSetContent = true;
        const { textEditor } = this;
        const wasLoaded = this.loadedInternal;
        const scrollTop = textEditor.editor.scrollDOM.scrollTop;
        this.loadedInternal = true;
        const languageSupport = await this.getLanguageSupport(content);
        const editorState = CodeMirror.EditorState.create({
            doc: content,
            extensions: [
                this.editorConfiguration(content),
                languageSupport,
                config.lineNumbers.of(this.getLineNumberFormatter()),
                config.editable.of(this.editable ? [] : CodeMirror.EditorState.readOnly.of(true)),
            ],
        });
        this.baseDoc = editorState.doc;
        textEditor.editor.setState(editorState);
        if (wasLoaded) {
            textEditor.editor.scrollDOM.scrollTop = scrollTop;
        }
        this.wasShownOrLoaded();
        if (this.delayedFindSearchMatches) {
            this.delayedFindSearchMatches();
            this.delayedFindSearchMatches = null;
        }
        this.muteChangeEventsForSetContent = false;
    }
    setSearchableView(view) {
        this.searchableView = view;
    }
    doFindSearchMatches(searchConfig, shouldJump, jumpBackwards) {
        this.currentSearchResultIndex = -1;
        this.searchRegex = searchConfig.toSearchRegex(true);
        this.searchResults = this.collectRegexMatches(this.searchRegex);
        if (this.searchableView) {
            this.searchableView.updateSearchMatchesCount(this.searchResults.length);
        }
        const editor = this.textEditor;
        if (!this.searchResults.length) {
            if (editor.state.field(activeSearchState)) {
                editor.dispatch({ effects: setActiveSearch.of(null) });
            }
        }
        else if (shouldJump && jumpBackwards) {
            this.jumpToPreviousSearchResult();
        }
        else if (shouldJump) {
            this.jumpToNextSearchResult();
        }
        else {
            editor.dispatch({ effects: setActiveSearch.of(new ActiveSearch(this.searchRegex, null)) });
        }
    }
    performSearch(searchConfig, shouldJump, jumpBackwards) {
        if (this.searchableView) {
            this.searchableView.updateSearchMatchesCount(0);
        }
        this.resetSearch();
        this.searchConfig = searchConfig;
        if (this.loaded) {
            this.doFindSearchMatches(searchConfig, shouldJump, Boolean(jumpBackwards));
        }
        else {
            this.delayedFindSearchMatches =
                this.doFindSearchMatches.bind(this, searchConfig, shouldJump, Boolean(jumpBackwards));
        }
        void this.ensureContentLoaded();
    }
    resetCurrentSearchResultIndex() {
        if (!this.searchResults.length) {
            return;
        }
        this.currentSearchResultIndex = -1;
        if (this.searchableView) {
            this.searchableView.updateCurrentMatchIndex(this.currentSearchResultIndex);
        }
        const editor = this.textEditor;
        const currentActiveSearch = editor.state.field(activeSearchState);
        if (currentActiveSearch && currentActiveSearch.currentRange) {
            editor.dispatch({ effects: setActiveSearch.of(new ActiveSearch(currentActiveSearch.regexp, null)) });
        }
    }
    resetSearch() {
        this.searchConfig = null;
        this.delayedFindSearchMatches = null;
        this.currentSearchResultIndex = -1;
        this.searchResults = [];
        this.searchRegex = null;
    }
    searchCanceled() {
        const range = this.currentSearchResultIndex !== -1 ? this.searchResults[this.currentSearchResultIndex] : null;
        this.resetSearch();
        if (!this.loaded) {
            return;
        }
        const editor = this.textEditor;
        editor.dispatch({
            effects: setActiveSearch.of(null),
            selection: range ? { anchor: range.from, head: range.to } : undefined,
            scrollIntoView: true,
            userEvent: 'select.search.cancel',
        });
    }
    jumpToLastSearchResult() {
        this.jumpToSearchResult(this.searchResults.length - 1);
    }
    searchResultIndexForCurrentSelection() {
        return Platform.ArrayUtilities.lowerBound(this.searchResults, this.textEditor.state.selection.main, (a, b) => a.to - b.to);
    }
    jumpToNextSearchResult() {
        const currentIndex = this.searchResultIndexForCurrentSelection();
        const nextIndex = this.currentSearchResultIndex === -1 ? currentIndex : currentIndex + 1;
        this.jumpToSearchResult(nextIndex);
    }
    jumpToPreviousSearchResult() {
        const currentIndex = this.searchResultIndexForCurrentSelection();
        this.jumpToSearchResult(currentIndex - 1);
    }
    supportsCaseSensitiveSearch() {
        return true;
    }
    supportsRegexSearch() {
        return true;
    }
    jumpToSearchResult(index) {
        if (!this.loaded || !this.searchResults.length || !this.searchRegex) {
            return;
        }
        this.currentSearchResultIndex = (index + this.searchResults.length) % this.searchResults.length;
        if (this.searchableView) {
            this.searchableView.updateCurrentMatchIndex(this.currentSearchResultIndex);
        }
        const editor = this.textEditor;
        const range = this.searchResults[this.currentSearchResultIndex];
        editor.dispatch({
            effects: setActiveSearch.of(new ActiveSearch(this.searchRegex, range)),
            selection: { anchor: range.from, head: range.to },
            scrollIntoView: true,
            userEvent: 'select.search',
        });
    }
    replaceSelectionWith(searchConfig, replacement) {
        const range = this.searchResults[this.currentSearchResultIndex];
        if (!range) {
            return;
        }
        const insert = this.searchRegex?.fromQuery ? range.insertPlaceholders(replacement) : replacement;
        const editor = this.textEditor;
        const changes = editor.state.changes({ from: range.from, to: range.to, insert });
        editor.dispatch({ changes, selection: { anchor: changes.mapPos(editor.state.selection.main.to, 1) }, userEvent: 'input.replace' });
    }
    replaceAllWith(searchConfig, replacement) {
        this.resetCurrentSearchResultIndex();
        const regex = searchConfig.toSearchRegex(true);
        const ranges = this.collectRegexMatches(regex);
        if (!ranges.length) {
            return;
        }
        const isRegExp = regex.fromQuery;
        const changes = ranges.map(match => ({ from: match.from, to: match.to, insert: isRegExp ? match.insertPlaceholders(replacement) : replacement }));
        this.textEditor.dispatch({ changes, scrollIntoView: true, userEvent: 'input.replace.all' });
    }
    collectRegexMatches({ regex }) {
        const ranges = [];
        let pos = 0;
        for (const line of this.textEditor.state.doc.iterLines()) {
            regex.lastIndex = 0;
            for (;;) {
                const match = regex.exec(line);
                if (!match) {
                    break;
                }
                if (match[0].length) {
                    const from = pos + match.index;
                    ranges.push(new SearchMatch(from, from + match[0].length, match));
                }
            }
            pos += line.length + 1;
        }
        return ranges;
    }
    canEditSource() {
        return this.editable;
    }
    updateSourcePosition() {
        const { textEditor } = this, { state } = textEditor, { selection } = state;
        if (this.displayedSelection?.eq(selection)) {
            return;
        }
        this.displayedSelection = selection;
        if (selection.ranges.length > 1) {
            this.sourcePosition.setText(i18nString(UIStrings.dSelectionRegions, { PH1: selection.ranges.length }));
            return;
        }
        const { main } = state.selection;
        if (main.empty) {
            const { lineNumber, columnNumber } = textEditor.toLineColumn(main.head);
            const location = this.prettyToRawLocation(lineNumber, columnNumber);
            if (this.wasmDisassemblyInternal) {
                const disassembly = this.wasmDisassemblyInternal;
                const lastBytecodeOffset = disassembly.lineNumberToBytecodeOffset(disassembly.lineNumbers - 1);
                const bytecodeOffsetDigits = lastBytecodeOffset.toString(16).length;
                const bytecodeOffset = disassembly.lineNumberToBytecodeOffset(location[0]);
                this.sourcePosition.setText(i18nString(UIStrings.bytecodePositionXs, { PH1: bytecodeOffset.toString(16).padStart(bytecodeOffsetDigits, '0') }));
            }
            else {
                this.sourcePosition.setText(i18nString(UIStrings.lineSColumnS, { PH1: location[0] + 1, PH2: location[1] + 1 }));
            }
        }
        else {
            const startLine = state.doc.lineAt(main.from), endLine = state.doc.lineAt(main.to);
            if (startLine.number === endLine.number) {
                this.sourcePosition.setText(i18nString(UIStrings.dCharactersSelected, { PH1: main.to - main.from }));
            }
            else {
                this.sourcePosition.setText(i18nString(UIStrings.dLinesDCharactersSelected, { PH1: endLine.number - startLine.number + 1, PH2: main.to - main.from }));
            }
        }
    }
    onContextMenu(event) {
        event.consume(true); // Consume event now to prevent document from handling the async menu
        const contextMenu = new UI.ContextMenu.ContextMenu(event);
        const { state } = this.textEditor;
        const pos = state.selection.main.from, line = state.doc.lineAt(pos);
        this.populateTextAreaContextMenu(contextMenu, line.number - 1, pos - line.from);
        contextMenu.appendApplicableItems(this);
        void contextMenu.show();
        return true;
    }
    populateTextAreaContextMenu(_menu, _lineNumber, _columnNumber) {
    }
    onLineGutterContextMenu(position, event) {
        event.consume(true); // Consume event now to prevent document from handling the async menu
        const contextMenu = new UI.ContextMenu.ContextMenu(event);
        const lineNumber = this.textEditor.state.doc.lineAt(position).number - 1;
        this.populateLineGutterContextMenu(contextMenu, lineNumber);
        contextMenu.appendApplicableItems(this);
        void contextMenu.show();
        return true;
    }
    populateLineGutterContextMenu(_menu, _lineNumber) {
    }
    focus() {
        this.textEditor.focus();
    }
}
class SearchMatch {
    from;
    to;
    match;
    constructor(from, to, match) {
        this.from = from;
        this.to = to;
        this.match = match;
    }
    insertPlaceholders(replacement) {
        return replacement.replace(/\$(\$|&|\d+|<[^>]+>)/g, (_, selector) => {
            if (selector === '$') {
                return '$';
            }
            if (selector === '&') {
                return this.match[0];
            }
            if (selector[0] === '<') {
                return (this.match.groups && this.match.groups[selector.slice(1, selector.length - 1)]) || '';
            }
            return this.match[Number.parseInt(selector, 10)] || '';
        });
    }
}
// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum
export var DecoratorType;
(function (DecoratorType) {
    DecoratorType["PERFORMANCE"] = "performance";
    DecoratorType["MEMORY"] = "memory";
    DecoratorType["COVERAGE"] = "coverage";
})(DecoratorType || (DecoratorType = {}));
const config = {
    editable: new CodeMirror.Compartment(),
    language: new CodeMirror.Compartment(),
    lineNumbers: new CodeMirror.Compartment(),
};
class ActiveSearch {
    regexp;
    currentRange;
    constructor(regexp, currentRange) {
        this.regexp = regexp;
        this.currentRange = currentRange;
    }
    map(change) {
        return change.empty || !this.currentRange ?
            this :
            new ActiveSearch(this.regexp, { from: change.mapPos(this.currentRange.from), to: change.mapPos(this.currentRange.to) });
    }
    static eq(a, b) {
        return Boolean(a === b ||
            a && b && a.currentRange?.from === b.currentRange?.from && a.currentRange?.to === b.currentRange?.to &&
                a.regexp.regex.source === b.regexp.regex.source && a.regexp.regex.flags === b.regexp.regex.flags);
    }
}
const setActiveSearch = CodeMirror.StateEffect.define({ map: (value, mapping) => value && value.map(mapping) });
const activeSearchState = CodeMirror.StateField.define({
    create() {
        return null;
    },
    update(state, tr) {
        return tr.effects.reduce((state, effect) => effect.is(setActiveSearch) ? effect.value : state, state && state.map(tr.changes));
    },
});
const searchMatchDeco = CodeMirror.Decoration.mark({ class: 'cm-searchMatch' });
const currentSearchMatchDeco = CodeMirror.Decoration.mark({ class: 'cm-searchMatch cm-searchMatch-selected' });
const searchHighlighter = CodeMirror.ViewPlugin.fromClass(class {
    decorations;
    constructor(view) {
        this.decorations = this.computeDecorations(view);
    }
    update(update) {
        const active = update.state.field(activeSearchState);
        if (!ActiveSearch.eq(active, update.startState.field(activeSearchState)) ||
            (active && (update.viewportChanged || update.docChanged))) {
            this.decorations = this.computeDecorations(update.view);
        }
    }
    computeDecorations(view) {
        const active = view.state.field(activeSearchState);
        if (!active) {
            return CodeMirror.Decoration.none;
        }
        const builder = new CodeMirror.RangeSetBuilder();
        const { doc } = view.state;
        for (const { from, to } of view.visibleRanges) {
            let pos = from;
            for (const part of doc.iterRange(from, to)) {
                if (part !== '\n') {
                    active.regexp.regex.lastIndex = 0;
                    for (;;) {
                        const match = active.regexp.regex.exec(part);
                        if (!match) {
                            break;
                        }
                        const start = pos + match.index, end = start + match[0].length;
                        const current = active.currentRange && active.currentRange.from === start && active.currentRange.to === end;
                        builder.add(start, end, current ? currentSearchMatchDeco : searchMatchDeco);
                    }
                }
                pos += part.length;
            }
        }
        return builder.finish();
    }
}, { decorations: (value) => value.decorations });
const nonBreakableLineMark = new (class extends CodeMirror.GutterMarker {
    elementClass = 'cm-nonBreakableLine';
})();
// Effect to add lines (by position) to the set of non-breakable lines.
export const addNonBreakableLines = CodeMirror.StateEffect.define();
const nonBreakableLines = CodeMirror.StateField.define({
    create() {
        return CodeMirror.RangeSet.empty;
    },
    update(deco, tr) {
        return tr.effects.reduce((deco, effect) => {
            return !effect.is(addNonBreakableLines) ?
                deco :
                deco.update({ add: effect.value.map(pos => nonBreakableLineMark.range(pos)) });
        }, deco.map(tr.changes));
    },
    provide: field => CodeMirror.lineNumberMarkers.from(field),
});
export function isBreakableLine(state, line) {
    const nonBreakable = state.field(nonBreakableLines);
    if (!nonBreakable.size) {
        return true;
    }
    let found = false;
    nonBreakable.between(line.from, line.from, () => {
        found = true;
    });
    return !found;
}
function markNonBreakableLines(disassembly) {
    // Mark non-breakable lines in the Wasm disassembly after setting
    // up the content for the text editor (which creates the gutter).
    return nonBreakableLines.init(state => {
        const marks = [];
        for (const lineNumber of disassembly.nonBreakableLineNumbers()) {
            if (lineNumber < state.doc.lines) {
                marks.push(nonBreakableLineMark.range(state.doc.line(lineNumber + 1).from));
            }
        }
        return CodeMirror.RangeSet.of(marks);
    });
}
const sourceFrameTheme = CodeMirror.EditorView.theme({
    '&.cm-editor': { height: '100%' },
    '.cm-scroller': { overflow: 'auto' },
    '.cm-lineNumbers .cm-gutterElement.cm-nonBreakableLine': { color: 'var(--color-non-breakable-line)' },
    '.cm-searchMatch': {
        border: '1px solid var(--color-search-match-border)',
        borderRadius: '3px',
        margin: '0 -1px',
        '&.cm-searchMatch-selected': {
            borderRadius: '1px',
            backgroundColor: 'var(--color-selected-search-match-background)',
            borderColor: 'var(--color-selected-search-match-background)',
            '&, & *': {
                color: 'var(--color-selected-search-match) !important',
            },
        },
    },
    ':host-context(.pretty-printed) & .cm-lineNumbers .cm-gutterElement': {
        color: 'var(--legacy-accent-color)',
    },
});
//# sourceMappingURL=SourceFrame.js.map