/*
 * Copyright (C) 2012 Google Inc. All rights reserved.
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
import * as Common from '../../core/common/common.js';
import * as Platform from '../../core/platform/platform.js';
import * as Root from '../../core/root/root.js';
import * as IssuesManager from '../../models/issues_manager/issues_manager.js';
import * as Persistence from '../../models/persistence/persistence.js';
import * as Workspace from '../../models/workspace/workspace.js';
import * as CodeMirror from '../../third_party/codemirror.next/codemirror.next.js';
import * as IconButton from '../../ui/components/icon_button/icon_button.js';
import * as IssueCounter from '../../ui/components/issue_counter/issue_counter.js';
import * as SourceFrame from '../../ui/legacy/components/source_frame/source_frame.js';
import * as UI from '../../ui/legacy/legacy.js';
import { CoveragePlugin } from './CoveragePlugin.js';
import { CSSPlugin } from './CSSPlugin.js';
import { DebuggerPlugin } from './DebuggerPlugin.js';
import { MemoryProfilePlugin, PerformanceProfilePlugin } from './ProfilePlugin.js';
import { JavaScriptCompilerPlugin } from './JavaScriptCompilerPlugin.js';
import { ScriptOriginPlugin } from './ScriptOriginPlugin.js';
import { SnippetsPlugin } from './SnippetsPlugin.js';
import { SourcesPanel } from './SourcesPanel.js';
function sourceFramePlugins() {
    // The order of these plugins matters for toolbar items and editor
    // extension precedence
    return [
        CSSPlugin,
        DebuggerPlugin,
        JavaScriptCompilerPlugin,
        SnippetsPlugin,
        ScriptOriginPlugin,
        CoveragePlugin,
        MemoryProfilePlugin,
        PerformanceProfilePlugin,
    ];
}
export class UISourceCodeFrame extends Common.ObjectWrapper.eventMixin(SourceFrame.SourceFrame.SourceFrameImpl) {
    uiSourceCodeInternal;
    muteSourceCodeEvents;
    persistenceBinding;
    uiSourceCodeEventListeners;
    messageAndDecorationListeners;
    boundOnBindingChanged;
    // The active plugins. These are created in setContent, and
    // recreated when the binding changes
    plugins = [];
    errorPopoverHelper;
    constructor(uiSourceCode) {
        super(workingCopy);
        this.uiSourceCodeInternal = uiSourceCode;
        this.muteSourceCodeEvents = false;
        this.persistenceBinding = Persistence.Persistence.PersistenceImpl.instance().binding(uiSourceCode);
        this.uiSourceCodeEventListeners = [];
        this.messageAndDecorationListeners = [];
        this.boundOnBindingChanged = this.onBindingChanged.bind(this);
        Common.Settings.Settings.instance()
            .moduleSetting('persistenceNetworkOverridesEnabled')
            .addChangeListener(this.onNetworkPersistenceChanged, this);
        this.errorPopoverHelper =
            new UI.PopoverHelper.PopoverHelper(this.textEditor.editor.contentDOM, this.getErrorPopoverContent.bind(this));
        this.errorPopoverHelper.setHasPadding(true);
        this.errorPopoverHelper.setTimeout(100, 100);
        this.initializeUISourceCode();
        async function workingCopy() {
            if (uiSourceCode.isDirty()) {
                return { content: uiSourceCode.workingCopy(), isEncoded: false };
            }
            return uiSourceCode.requestContent();
        }
    }
    editorConfiguration(doc) {
        return [
            super.editorConfiguration(doc),
            rowMessages([...this.allMessages()]),
            // Inject editor extensions from plugins
            pluginCompartment.of(this.plugins.map(plugin => plugin.editorExtension())),
        ];
    }
    onFocus() {
        super.onFocus();
        UI.Context.Context.instance().setFlavor(UISourceCodeFrame, this);
    }
    onBlur() {
        super.onBlur();
        UI.Context.Context.instance().setFlavor(UISourceCodeFrame, null);
    }
    installMessageAndDecorationListeners() {
        if (this.persistenceBinding) {
            const networkSourceCode = this.persistenceBinding.network;
            const fileSystemSourceCode = this.persistenceBinding.fileSystem;
            this.messageAndDecorationListeners = [
                networkSourceCode.addEventListener(Workspace.UISourceCode.Events.MessageAdded, this.onMessageAdded, this),
                networkSourceCode.addEventListener(Workspace.UISourceCode.Events.MessageRemoved, this.onMessageRemoved, this),
                networkSourceCode.addEventListener(Workspace.UISourceCode.Events.DecorationChanged, this.onDecorationChanged, this),
                fileSystemSourceCode.addEventListener(Workspace.UISourceCode.Events.MessageAdded, this.onMessageAdded, this),
                fileSystemSourceCode.addEventListener(Workspace.UISourceCode.Events.MessageRemoved, this.onMessageRemoved, this),
            ];
        }
        else {
            this.messageAndDecorationListeners = [
                this.uiSourceCodeInternal.addEventListener(Workspace.UISourceCode.Events.MessageAdded, this.onMessageAdded, this),
                this.uiSourceCodeInternal.addEventListener(Workspace.UISourceCode.Events.MessageRemoved, this.onMessageRemoved, this),
                this.uiSourceCodeInternal.addEventListener(Workspace.UISourceCode.Events.DecorationChanged, this.onDecorationChanged, this),
            ];
        }
    }
    uiSourceCode() {
        return this.uiSourceCodeInternal;
    }
    setUISourceCode(uiSourceCode) {
        const loaded = uiSourceCode.contentLoaded() ? Promise.resolve() : uiSourceCode.requestContent();
        const startUISourceCode = this.uiSourceCodeInternal;
        loaded.then(() => {
            if (this.uiSourceCodeInternal !== startUISourceCode) {
                return;
            }
            this.unloadUISourceCode();
            this.uiSourceCodeInternal = uiSourceCode;
            if (uiSourceCode.workingCopy() !== this.textEditor.state.doc.toString()) {
                void this.setContent(uiSourceCode.workingCopy());
            }
            else {
                this.reloadPlugins();
            }
            this.initializeUISourceCode();
        }, console.error);
    }
    unloadUISourceCode() {
        Common.EventTarget.removeEventListeners(this.messageAndDecorationListeners);
        Common.EventTarget.removeEventListeners(this.uiSourceCodeEventListeners);
        this.uiSourceCodeInternal.removeWorkingCopyGetter();
        Persistence.Persistence.PersistenceImpl.instance().unsubscribeFromBindingEvent(this.uiSourceCodeInternal, this.boundOnBindingChanged);
    }
    initializeUISourceCode() {
        this.uiSourceCodeEventListeners = [
            this.uiSourceCodeInternal.addEventListener(Workspace.UISourceCode.Events.WorkingCopyChanged, this.onWorkingCopyChanged, this),
            this.uiSourceCodeInternal.addEventListener(Workspace.UISourceCode.Events.WorkingCopyCommitted, this.onWorkingCopyCommitted, this),
            this.uiSourceCodeInternal.addEventListener(Workspace.UISourceCode.Events.TitleChanged, this.onTitleChanged, this),
        ];
        Persistence.Persistence.PersistenceImpl.instance().subscribeForBindingEvent(this.uiSourceCodeInternal, this.boundOnBindingChanged);
        this.installMessageAndDecorationListeners();
        this.updateStyle();
        if (Root.Runtime.experiments.isEnabled('sourcesPrettyPrint')) {
            const supportedPrettyTypes = new Set(['text/html', 'text/css', 'text/javascript']);
            this.setCanPrettyPrint(supportedPrettyTypes.has(this.contentType), true);
        }
    }
    wasShown() {
        super.wasShown();
        this.setEditable(this.canEditSourceInternal());
    }
    willHide() {
        for (const plugin of this.plugins) {
            plugin.willHide();
        }
        super.willHide();
        UI.Context.Context.instance().setFlavor(UISourceCodeFrame, null);
        this.uiSourceCodeInternal.removeWorkingCopyGetter();
    }
    getContentType() {
        const binding = Persistence.Persistence.PersistenceImpl.instance().binding(this.uiSourceCodeInternal);
        return binding ? binding.network.mimeType() : this.uiSourceCodeInternal.mimeType();
    }
    canEditSourceInternal() {
        if (this.hasLoadError()) {
            return false;
        }
        if (this.uiSourceCodeInternal.editDisabled()) {
            return false;
        }
        if (this.uiSourceCodeInternal.mimeType() === 'application/wasm') {
            return false;
        }
        if (Persistence.Persistence.PersistenceImpl.instance().binding(this.uiSourceCodeInternal)) {
            return true;
        }
        if (this.uiSourceCodeInternal.project().canSetFileContent()) {
            return true;
        }
        if (this.uiSourceCodeInternal.project().isServiceProject()) {
            return false;
        }
        if (this.uiSourceCodeInternal.project().type() === Workspace.Workspace.projectTypes.Network &&
            Persistence.NetworkPersistenceManager.NetworkPersistenceManager.instance().active()) {
            return true;
        }
        // Because live edit fails on large whitespace changes, pretty printed scripts are not editable.
        if (this.pretty && this.uiSourceCodeInternal.contentType().hasScripts()) {
            return false;
        }
        return this.uiSourceCodeInternal.contentType() !== Common.ResourceType.resourceTypes.Document;
    }
    onNetworkPersistenceChanged() {
        this.setEditable(this.canEditSourceInternal());
    }
    commitEditing() {
        if (!this.uiSourceCodeInternal.isDirty()) {
            return;
        }
        this.muteSourceCodeEvents = true;
        this.uiSourceCodeInternal.commitWorkingCopy();
        this.muteSourceCodeEvents = false;
    }
    async setContent(content) {
        this.disposePlugins();
        this.loadPlugins();
        await super.setContent(content);
        for (const plugin of this.plugins) {
            plugin.editorInitialized(this.textEditor);
        }
        Common.EventTarget.fireEvent('source-file-loaded', this.uiSourceCodeInternal.displayName(true));
    }
    allMessages() {
        if (this.persistenceBinding) {
            const combinedSet = this.persistenceBinding.network.messages();
            Platform.SetUtilities.addAll(combinedSet, this.persistenceBinding.fileSystem.messages());
            return combinedSet;
        }
        return this.uiSourceCodeInternal.messages();
    }
    onTextChanged() {
        const wasPretty = this.pretty;
        super.onTextChanged();
        this.errorPopoverHelper.hidePopover();
        SourcesPanel.instance().updateLastModificationTime();
        this.muteSourceCodeEvents = true;
        if (this.isClean()) {
            this.uiSourceCodeInternal.resetWorkingCopy();
        }
        else {
            this.uiSourceCodeInternal.setWorkingCopyGetter(() => this.textEditor.state.doc.toString());
        }
        this.muteSourceCodeEvents = false;
        if (wasPretty !== this.pretty) {
            this.updateStyle();
            this.reloadPlugins();
        }
    }
    onWorkingCopyChanged() {
        if (this.muteSourceCodeEvents) {
            return;
        }
        this.maybeSetContent(this.uiSourceCodeInternal.workingCopy());
    }
    onWorkingCopyCommitted() {
        if (!this.muteSourceCodeEvents) {
            this.maybeSetContent(this.uiSourceCode().workingCopy());
        }
        this.contentCommitted();
        this.updateStyle();
    }
    reloadPlugins() {
        this.disposePlugins();
        this.loadPlugins();
        const editor = this.textEditor;
        editor.dispatch({ effects: pluginCompartment.reconfigure(this.plugins.map(plugin => plugin.editorExtension())) });
        for (const plugin of this.plugins) {
            plugin.editorInitialized(editor);
        }
    }
    onTitleChanged() {
        this.updateLanguageMode('').then(() => this.reloadPlugins(), console.error);
    }
    loadPlugins() {
        const binding = Persistence.Persistence.PersistenceImpl.instance().binding(this.uiSourceCodeInternal);
        const pluginUISourceCode = binding ? binding.network : this.uiSourceCodeInternal;
        for (const pluginType of sourceFramePlugins()) {
            if (pluginType.accepts(pluginUISourceCode)) {
                this.plugins.push(new pluginType(pluginUISourceCode, this));
            }
        }
        this.dispatchEventToListeners(Events.ToolbarItemsChanged);
    }
    disposePlugins() {
        for (const plugin of this.plugins) {
            plugin.dispose();
        }
        this.plugins = [];
    }
    onBindingChanged() {
        const binding = Persistence.Persistence.PersistenceImpl.instance().binding(this.uiSourceCodeInternal);
        if (binding === this.persistenceBinding) {
            return;
        }
        this.unloadUISourceCode();
        this.persistenceBinding = binding;
        this.initializeUISourceCode();
        this.reloadMessages();
        this.reloadPlugins();
    }
    reloadMessages() {
        const messages = [...this.allMessages()];
        const { editor } = this.textEditor;
        editor.dispatch({ effects: setRowMessages.of(RowMessages.create(messages)) });
    }
    updateStyle() {
        this.setEditable(this.canEditSourceInternal());
    }
    maybeSetContent(content) {
        if (this.textEditor.state.doc.toString() !== content) {
            void this.setContent(content);
        }
    }
    populateTextAreaContextMenu(contextMenu, lineNumber, columnNumber) {
        super.populateTextAreaContextMenu(contextMenu, lineNumber, columnNumber);
        contextMenu.appendApplicableItems(this.uiSourceCodeInternal);
        const location = this.editorLocationToUILocation(lineNumber, columnNumber);
        contextMenu.appendApplicableItems(new Workspace.UISourceCode.UILocation(this.uiSourceCodeInternal, location.lineNumber, location.columnNumber));
        for (const plugin of this.plugins) {
            plugin.populateTextAreaContextMenu(contextMenu, lineNumber, columnNumber);
        }
    }
    populateLineGutterContextMenu(contextMenu, lineNumber) {
        super.populateLineGutterContextMenu(contextMenu, lineNumber);
        for (const plugin of this.plugins) {
            plugin.populateLineGutterContextMenu(contextMenu, lineNumber);
        }
    }
    dispose() {
        this.errorPopoverHelper.dispose();
        this.disposePlugins();
        this.unloadUISourceCode();
        this.textEditor.editor.destroy();
        this.detach();
        Common.Settings.Settings.instance()
            .moduleSetting('persistenceNetworkOverridesEnabled')
            .removeChangeListener(this.onNetworkPersistenceChanged, this);
    }
    onMessageAdded(event) {
        const { editor } = this.textEditor, shownMessages = editor.state.field(showRowMessages, false);
        if (shownMessages) {
            editor.dispatch({ effects: setRowMessages.of(shownMessages.messages.add(event.data)) });
        }
    }
    onMessageRemoved(event) {
        const { editor } = this.textEditor, shownMessages = editor.state.field(showRowMessages, false);
        if (shownMessages) {
            editor.dispatch({ effects: setRowMessages.of(shownMessages.messages.remove(event.data)) });
        }
    }
    onDecorationChanged(event) {
        for (const plugin of this.plugins) {
            plugin.decorationChanged(event.data, this.textEditor);
        }
    }
    async toolbarItems() {
        const leftToolbarItems = await super.toolbarItems();
        const rightToolbarItems = [];
        for (const plugin of this.plugins) {
            leftToolbarItems.push(...plugin.leftToolbarItems());
            rightToolbarItems.push(...await plugin.rightToolbarItems());
        }
        if (!rightToolbarItems.length) {
            return leftToolbarItems;
        }
        return [...leftToolbarItems, new UI.Toolbar.ToolbarSeparator(true), ...rightToolbarItems];
    }
    getErrorPopoverContent(event) {
        const mouseEvent = event;
        const eventTarget = event.target;
        const anchorElement = eventTarget.enclosingNodeOrSelfWithClass('cm-messageIcon-error') ||
            eventTarget.enclosingNodeOrSelfWithClass('cm-messageIcon-issue');
        if (!anchorElement) {
            return null;
        }
        const messageField = this.textEditor.state.field(showRowMessages, false);
        if (!messageField || messageField.messages.rows.length === 0) {
            return null;
        }
        const { editor } = this.textEditor;
        const position = editor.posAtCoords(mouseEvent);
        if (position === null) {
            return null;
        }
        const line = editor.state.doc.lineAt(position);
        if (position !== line.to) {
            return null;
        }
        const row = messageField.messages.rows.find(row => row[0].lineNumber() === line.number - 1);
        if (!row) {
            return null;
        }
        const issues = anchorElement.classList.contains('cm-messageIcon-issue');
        const messages = row.filter(msg => (msg.level() === Workspace.UISourceCode.Message.Level.Issue) === issues);
        if (!messages.length) {
            return null;
        }
        const anchor = anchorElement ? anchorElement.boxInWindow() : new AnchorBox(mouseEvent.clientX, mouseEvent.clientY, 1, 1);
        const counts = countDuplicates(messages);
        const element = document.createElement('div');
        element.classList.add('text-editor-messages-description-container');
        for (let i = 0; i < messages.length; i++) {
            if (counts[i]) {
                element.appendChild(renderMessage(messages[i], counts[i]));
            }
        }
        return {
            box: anchor,
            hide() { },
            show: async (popover) => {
                popover.contentElement.append(element);
                return true;
            },
        };
    }
}
function getIconDataForLevel(level) {
    if (level === Workspace.UISourceCode.Message.Level.Error) {
        return { color: '', width: '12px', height: '12px', iconName: 'error_icon' };
    }
    if (level === Workspace.UISourceCode.Message.Level.Warning) {
        return { color: '', width: '12px', height: '12px', iconName: 'warning_icon' };
    }
    if (level === Workspace.UISourceCode.Message.Level.Issue) {
        return { color: 'var(--issue-color-yellow)', width: '12px', height: '12px', iconName: 'issue-exclamation-icon' };
    }
    return { color: '', width: '12px', height: '12px', iconName: 'error_icon' };
}
function getBubbleTypePerLevel(level) {
    switch (level) {
        case Workspace.UISourceCode.Message.Level.Error:
            return 'error';
        case Workspace.UISourceCode.Message.Level.Warning:
            return 'warning';
        case Workspace.UISourceCode.Message.Level.Issue:
            return 'warning';
    }
}
function messageLevelComparator(a, b) {
    const messageLevelPriority = {
        [Workspace.UISourceCode.Message.Level.Issue]: 2,
        [Workspace.UISourceCode.Message.Level.Warning]: 3,
        [Workspace.UISourceCode.Message.Level.Error]: 4,
    };
    return messageLevelPriority[a.level()] - messageLevelPriority[b.level()];
}
function getIconDataForMessage(message) {
    if (message instanceof IssuesManager.SourceFrameIssuesManager.IssueMessage) {
        return {
            ...IssueCounter.IssueCounter.getIssueKindIconData(message.getIssueKind()),
            width: '12px',
            height: '12px',
        };
    }
    return getIconDataForLevel(message.level());
}
// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum
export var Events;
(function (Events) {
    Events["ToolbarItemsChanged"] = "ToolbarItemsChanged";
})(Events || (Events = {}));
const pluginCompartment = new CodeMirror.Compartment();
// Row message management and display logic. The frame manages a
// collection of messages, organized by line (row), as a wavy
// underline starting at the start of the first message, up to the end
// of the line, with icons indicating the message severity and content
// at the end of the line.
function addMessage(rows, message) {
    const lineNumber = message.lineNumber();
    let i = 0;
    for (; i < rows.length; i++) {
        const diff = rows[i][0].lineNumber() - lineNumber;
        if (diff === 0) {
            rows[i] = rows[i].concat(message);
            return rows;
        }
        if (diff > 0) {
            break;
        }
    }
    rows.splice(i, 0, [message]);
    return rows;
}
function removeMessage(rows, message) {
    for (let i = 0; i < rows.length; i++) {
        if (rows[i][0].lineNumber() === message.lineNumber()) {
            const remaining = rows[i].filter(m => !m.isEqual(message));
            if (remaining.length) {
                rows[i] = remaining;
            }
            else {
                rows.splice(i, 1);
            }
            break;
        }
    }
}
class RowMessages {
    rows;
    constructor(rows) {
        this.rows = rows;
    }
    static create(messages) {
        const rows = [];
        for (const message of messages) {
            addMessage(rows, message);
        }
        return new RowMessages(rows);
    }
    remove(message) {
        const rows = this.rows.slice();
        removeMessage(rows, message);
        return new RowMessages(rows);
    }
    add(message) {
        return new RowMessages(addMessage(this.rows.slice(), message));
    }
}
const setRowMessages = CodeMirror.StateEffect.define();
const underlineMark = CodeMirror.Decoration.mark({ class: 'cm-waveUnderline' });
// The widget shown at the end of a message annotation.
class MessageWidget extends CodeMirror.WidgetType {
    messages;
    constructor(messages) {
        super();
        this.messages = messages;
    }
    eq(other) {
        return other.messages === this.messages;
    }
    toDOM() {
        const wrap = document.createElement('span');
        wrap.classList.add('cm-messageIcon');
        const nonIssues = this.messages.filter(msg => msg.level() !== Workspace.UISourceCode.Message.Level.Issue);
        if (nonIssues.length) {
            const maxIssue = nonIssues.sort(messageLevelComparator)[nonIssues.length - 1];
            const errorIcon = wrap.appendChild(new IconButton.Icon.Icon());
            errorIcon.data = getIconDataForLevel(maxIssue.level());
            errorIcon.classList.add('cm-messageIcon-error');
        }
        const issue = this.messages.find(m => m.level() === Workspace.UISourceCode.Message.Level.Issue);
        if (issue) {
            const issueIcon = wrap.appendChild(new IconButton.Icon.Icon());
            issueIcon.data = getIconDataForLevel(Workspace.UISourceCode.Message.Level.Issue);
            issueIcon.classList.add('cm-messageIcon-issue');
            issueIcon.addEventListener('click', () => (issue.clickHandler() || Math.min)());
        }
        return wrap;
    }
    ignoreEvents() {
        return true;
    }
}
class RowMessageDecorations {
    messages;
    decorations;
    constructor(messages, decorations) {
        this.messages = messages;
        this.decorations = decorations;
    }
    static create(messages, doc) {
        const builder = new CodeMirror.RangeSetBuilder();
        for (const row of messages.rows) {
            const line = doc.line(row[0].lineNumber() + 1);
            const minCol = row.reduce((col, msg) => Math.min(col, msg.columnNumber() || 0), line.length);
            if (minCol < line.length) {
                builder.add(line.from + minCol, line.to, underlineMark);
            }
            builder.add(line.to, line.to, CodeMirror.Decoration.widget({ side: 1, widget: new MessageWidget(row) }));
        }
        return new RowMessageDecorations(messages, builder.finish());
    }
    apply(tr) {
        let result = this;
        if (tr.docChanged) {
            result = new RowMessageDecorations(this.messages, this.decorations.map(tr.changes));
        }
        for (const effect of tr.effects) {
            if (effect.is(setRowMessages)) {
                result = RowMessageDecorations.create(effect.value, tr.state.doc);
            }
        }
        return result;
    }
}
const showRowMessages = CodeMirror.StateField.define({
    create(state) {
        return RowMessageDecorations.create(new RowMessages([]), state.doc);
    },
    update(value, tr) {
        return value.apply(tr);
    },
    provide: field => CodeMirror.Prec.lowest(CodeMirror.EditorView.decorations.from(field, value => value.decorations)),
});
function countDuplicates(messages) {
    const counts = [];
    for (let i = 0; i < messages.length; i++) {
        counts[i] = 0;
        for (let j = 0; j <= i; j++) {
            if (messages[j].isEqual(messages[i])) {
                counts[j]++;
                break;
            }
        }
    }
    return counts;
}
function renderMessage(message, count) {
    const element = document.createElement('div');
    element.classList.add('text-editor-row-message');
    if (count === 1) {
        const icon = element.appendChild(new IconButton.Icon.Icon());
        icon.data = getIconDataForMessage(message);
        icon.classList.add('text-editor-row-message-icon');
        icon.addEventListener('click', () => (message.clickHandler() || Math.min)());
    }
    else {
        const repeatCountElement = document.createElement('span', { is: 'dt-small-bubble' });
        repeatCountElement.textContent = String(count);
        repeatCountElement.classList.add('text-editor-row-message-repeat-count');
        element.appendChild(repeatCountElement);
        repeatCountElement.type = getBubbleTypePerLevel(message.level());
    }
    const linesContainer = element.createChild('div');
    for (const line of message.text().split('\n')) {
        linesContainer.createChild('div').textContent = line;
    }
    return element;
}
const rowMessageTheme = CodeMirror.EditorView.baseTheme({
    '.cm-tooltip-message': {
        padding: '4px',
    },
    '.cm-waveUnderline': {
        backgroundImage: 'var(--image-file-errorWave)',
        backgroundRepeat: 'repeat-x',
        backgroundPosition: 'bottom',
        paddingBottom: '1px',
    },
    '.cm-messageIcon': {
        cursor: 'pointer',
        '& > *': {
            verticalAlign: 'text-bottom',
            marginLeft: '2px',
        },
    },
});
function rowMessages(initialMessages) {
    return [
        showRowMessages.init((state) => RowMessageDecorations.create(RowMessages.create(initialMessages), state.doc)),
        rowMessageTheme,
    ];
}
//# sourceMappingURL=UISourceCodeFrame.js.map