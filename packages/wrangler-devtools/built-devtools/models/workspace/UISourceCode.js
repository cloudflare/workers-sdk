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
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as Common from '../../core/common/common.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as Platform from '../../core/platform/platform.js';
import * as TextUtils from '../text_utils/text_utils.js';
import { Events as WorkspaceImplEvents } from './WorkspaceImpl.js';
const UIStrings = {
    /**
    *@description Text for the index of something
    */
    index: '(index)',
    /**
    *@description Text in UISource Code of the DevTools local workspace
    */
    thisFileWasChangedExternally: 'This file was changed externally. Would you like to reload it?',
};
const str_ = i18n.i18n.registerUIStrings('models/workspace/UISourceCode.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class UISourceCode extends Common.ObjectWrapper.ObjectWrapper {
    projectInternal;
    urlInternal;
    originInternal;
    parentURLInternal;
    nameInternal;
    contentTypeInternal;
    requestContentPromise;
    decorations = new Map();
    hasCommitsInternal;
    messagesInternal;
    contentLoadedInternal;
    contentInternal;
    forceLoadOnCheckContentInternal;
    checkingContent;
    lastAcceptedContent;
    workingCopyInternal;
    workingCopyGetter;
    disableEditInternal;
    contentEncodedInternal;
    constructor(project, url, contentType) {
        super();
        this.projectInternal = project;
        this.urlInternal = url;
        const parsedURL = Common.ParsedURL.ParsedURL.fromString(url);
        if (parsedURL) {
            this.originInternal = parsedURL.securityOrigin();
            this.parentURLInternal =
                Common.ParsedURL.ParsedURL.concatenate(this.originInternal, parsedURL.folderPathComponents);
            if (parsedURL.queryParams) {
                // in case file name contains query params, it doesn't look like a normal file name anymore
                // so it can as well remain encoded
                this.nameInternal = parsedURL.lastPathComponent + '?' + parsedURL.queryParams;
            }
            else {
                // file name looks best decoded
                this.nameInternal = decodeURIComponent(parsedURL.lastPathComponent);
            }
        }
        else {
            this.originInternal = Platform.DevToolsPath.EmptyUrlString;
            this.parentURLInternal = Platform.DevToolsPath.EmptyUrlString;
            this.nameInternal = url;
        }
        this.contentTypeInternal = contentType;
        this.requestContentPromise = null;
        this.hasCommitsInternal = false;
        this.messagesInternal = null;
        this.contentLoadedInternal = false;
        this.contentInternal = null;
        this.forceLoadOnCheckContentInternal = false;
        this.checkingContent = false;
        this.lastAcceptedContent = null;
        this.workingCopyInternal = null;
        this.workingCopyGetter = null;
        this.disableEditInternal = false;
    }
    requestMetadata() {
        return this.projectInternal.requestMetadata(this);
    }
    name() {
        return this.nameInternal;
    }
    mimeType() {
        return this.projectInternal.mimeType(this);
    }
    url() {
        return this.urlInternal;
    }
    // Identifier used for deduplicating scripts that are considered by the
    // DevTools UI to be the same script. For now this is just the url but this
    // is likely to change in the future.
    canononicalScriptId() {
        return `${this.contentTypeInternal.name()},${this.urlInternal}`;
    }
    parentURL() {
        return this.parentURLInternal;
    }
    origin() {
        return this.originInternal;
    }
    fullDisplayName() {
        return this.projectInternal.fullDisplayName(this);
    }
    displayName(skipTrim) {
        if (!this.nameInternal) {
            return i18nString(UIStrings.index);
        }
        const name = this.nameInternal;
        return skipTrim ? name : Platform.StringUtilities.trimEndWithMaxLength(name, 100);
    }
    canRename() {
        return this.projectInternal.canRename();
    }
    rename(newName) {
        let fulfill;
        const promise = new Promise(x => {
            fulfill = x;
        });
        this.projectInternal.rename(this, newName, innerCallback.bind(this));
        return promise;
        function innerCallback(success, newName, newURL, newContentType) {
            if (success) {
                this.updateName(newName, newURL, newContentType);
            }
            fulfill(success);
        }
    }
    remove() {
        this.projectInternal.deleteFile(this);
    }
    updateName(name, url, contentType) {
        const oldURL = this.urlInternal;
        this.nameInternal = name;
        if (url) {
            this.urlInternal = url;
        }
        else {
            this.urlInternal = Common.ParsedURL.ParsedURL.relativePathToUrlString(name, oldURL);
        }
        if (contentType) {
            this.contentTypeInternal = contentType;
        }
        this.dispatchEventToListeners(Events.TitleChanged, this);
        this.project().workspace().dispatchEventToListeners(WorkspaceImplEvents.UISourceCodeRenamed, { oldURL: oldURL, uiSourceCode: this });
    }
    contentURL() {
        return this.url();
    }
    contentType() {
        return this.contentTypeInternal;
    }
    async contentEncoded() {
        await this.requestContent();
        return this.contentEncodedInternal || false;
    }
    project() {
        return this.projectInternal;
    }
    requestContent() {
        if (this.requestContentPromise) {
            return this.requestContentPromise;
        }
        if (this.contentLoadedInternal) {
            return Promise.resolve(this.contentInternal);
        }
        this.requestContentPromise = this.requestContentImpl();
        return this.requestContentPromise;
    }
    async requestContentImpl() {
        try {
            const content = await this.projectInternal.requestFileContent(this);
            if (!this.contentLoadedInternal) {
                this.contentLoadedInternal = true;
                this.contentInternal = content;
                this.contentEncodedInternal = content.isEncoded;
            }
        }
        catch (err) {
            this.contentLoadedInternal = true;
            this.contentInternal = { content: null, error: err ? String(err) : '', isEncoded: false };
        }
        return this.contentInternal;
    }
    #decodeContent(content) {
        if (!content) {
            return null;
        }
        return content.isEncoded && content.content ? window.atob(content.content) : content.content;
    }
    async checkContentUpdated() {
        if (!this.contentLoadedInternal && !this.forceLoadOnCheckContentInternal) {
            return;
        }
        if (!this.projectInternal.canSetFileContent() || this.checkingContent) {
            return;
        }
        this.checkingContent = true;
        const updatedContent = await this.projectInternal.requestFileContent(this);
        if ('error' in updatedContent) {
            return;
        }
        this.checkingContent = false;
        if (updatedContent.content === null) {
            const workingCopy = this.workingCopy();
            this.contentCommitted('', false);
            this.setWorkingCopy(workingCopy);
            return;
        }
        if (this.lastAcceptedContent === updatedContent.content) {
            return;
        }
        if (this.#decodeContent(this.contentInternal) === this.#decodeContent(updatedContent)) {
            this.lastAcceptedContent = null;
            return;
        }
        if (!this.isDirty() || this.workingCopyInternal === updatedContent.content) {
            this.contentCommitted(updatedContent.content, false);
            return;
        }
        await Common.Revealer.reveal(this);
        // Make sure we are in the next frame before stopping the world with confirm
        await new Promise(resolve => window.setTimeout(resolve, 0));
        const shouldUpdate = window.confirm(i18nString(UIStrings.thisFileWasChangedExternally));
        if (shouldUpdate) {
            this.contentCommitted(updatedContent.content, false);
        }
        else {
            this.lastAcceptedContent = updatedContent.content;
        }
    }
    forceLoadOnCheckContent() {
        this.forceLoadOnCheckContentInternal = true;
    }
    commitContent(content) {
        if (this.projectInternal.canSetFileContent()) {
            void this.projectInternal.setFileContent(this, content, false);
        }
        this.contentCommitted(content, true);
    }
    contentCommitted(content, committedByUser) {
        this.lastAcceptedContent = null;
        this.contentInternal = { content, isEncoded: false };
        this.contentLoadedInternal = true;
        this.requestContentPromise = null;
        this.hasCommitsInternal = true;
        this.innerResetWorkingCopy();
        const data = { uiSourceCode: this, content, encoded: this.contentEncodedInternal };
        this.dispatchEventToListeners(Events.WorkingCopyCommitted, data);
        this.projectInternal.workspace().dispatchEventToListeners(WorkspaceImplEvents.WorkingCopyCommitted, data);
        if (committedByUser) {
            this.projectInternal.workspace().dispatchEventToListeners(WorkspaceImplEvents.WorkingCopyCommittedByUser, data);
        }
    }
    addRevision(content) {
        this.commitContent(content);
    }
    hasCommits() {
        return this.hasCommitsInternal;
    }
    workingCopy() {
        if (this.workingCopyGetter) {
            this.workingCopyInternal = this.workingCopyGetter();
            this.workingCopyGetter = null;
        }
        if (this.isDirty()) {
            return this.workingCopyInternal;
        }
        return this.contentInternal?.content || '';
    }
    resetWorkingCopy() {
        this.innerResetWorkingCopy();
        this.workingCopyChanged();
    }
    innerResetWorkingCopy() {
        this.workingCopyInternal = null;
        this.workingCopyGetter = null;
    }
    setWorkingCopy(newWorkingCopy) {
        this.workingCopyInternal = newWorkingCopy;
        this.workingCopyGetter = null;
        this.workingCopyChanged();
    }
    setContent(content, isBase64) {
        this.contentEncodedInternal = isBase64;
        if (this.projectInternal.canSetFileContent()) {
            void this.projectInternal.setFileContent(this, content, isBase64);
        }
        this.contentCommitted(content, true);
    }
    setWorkingCopyGetter(workingCopyGetter) {
        this.workingCopyGetter = workingCopyGetter;
        this.workingCopyChanged();
    }
    workingCopyChanged() {
        this.removeAllMessages();
        this.dispatchEventToListeners(Events.WorkingCopyChanged, this);
        this.projectInternal.workspace().dispatchEventToListeners(WorkspaceImplEvents.WorkingCopyChanged, { uiSourceCode: this });
    }
    removeWorkingCopyGetter() {
        if (!this.workingCopyGetter) {
            return;
        }
        this.workingCopyInternal = this.workingCopyGetter();
        this.workingCopyGetter = null;
    }
    commitWorkingCopy() {
        if (this.isDirty()) {
            this.commitContent(this.workingCopy());
        }
    }
    isDirty() {
        return this.workingCopyInternal !== null || this.workingCopyGetter !== null;
    }
    extension() {
        return Common.ParsedURL.ParsedURL.extractExtension(this.nameInternal);
    }
    content() {
        return this.contentInternal?.content || '';
    }
    loadError() {
        return (this.contentInternal && 'error' in this.contentInternal && this.contentInternal.error) || null;
    }
    searchInContent(query, caseSensitive, isRegex) {
        const content = this.content();
        if (!content) {
            return this.projectInternal.searchInFileContent(this, query, caseSensitive, isRegex);
        }
        return Promise.resolve(TextUtils.TextUtils.performSearchInContent(content, query, caseSensitive, isRegex));
    }
    contentLoaded() {
        return this.contentLoadedInternal;
    }
    uiLocation(lineNumber, columnNumber) {
        return new UILocation(this, lineNumber, columnNumber);
    }
    messages() {
        return this.messagesInternal ? new Set(this.messagesInternal) : new Set();
    }
    addLineMessage(level, text, lineNumber, columnNumber, clickHandler) {
        const range = TextUtils.TextRange.TextRange.createFromLocation(lineNumber, columnNumber || 0);
        const message = new Message(level, text, clickHandler, range);
        this.addMessage(message);
        return message;
    }
    addMessage(message) {
        if (!this.messagesInternal) {
            this.messagesInternal = new Set();
        }
        this.messagesInternal.add(message);
        this.dispatchEventToListeners(Events.MessageAdded, message);
    }
    removeMessage(message) {
        if (this.messagesInternal?.delete(message)) {
            this.dispatchEventToListeners(Events.MessageRemoved, message);
        }
    }
    removeAllMessages() {
        if (!this.messagesInternal) {
            return;
        }
        for (const message of this.messagesInternal) {
            this.dispatchEventToListeners(Events.MessageRemoved, message);
        }
        this.messagesInternal = null;
    }
    setDecorationData(type, data) {
        if (data !== this.decorations.get(type)) {
            this.decorations.set(type, data);
            this.dispatchEventToListeners(Events.DecorationChanged, type);
        }
    }
    getDecorationData(type) {
        return this.decorations.get(type);
    }
    disableEdit() {
        this.disableEditInternal = true;
    }
    editDisabled() {
        return this.disableEditInternal;
    }
}
// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum
export var Events;
(function (Events) {
    Events["WorkingCopyChanged"] = "WorkingCopyChanged";
    Events["WorkingCopyCommitted"] = "WorkingCopyCommitted";
    Events["TitleChanged"] = "TitleChanged";
    Events["MessageAdded"] = "MessageAdded";
    Events["MessageRemoved"] = "MessageRemoved";
    Events["DecorationChanged"] = "DecorationChanged";
})(Events || (Events = {}));
export class UILocation {
    uiSourceCode;
    lineNumber;
    columnNumber;
    constructor(uiSourceCode, lineNumber, columnNumber) {
        this.uiSourceCode = uiSourceCode;
        this.lineNumber = lineNumber;
        this.columnNumber = columnNumber;
    }
    linkText(skipTrim, showColumnNumber) {
        let linkText = this.uiSourceCode.displayName(skipTrim);
        if (this.uiSourceCode.mimeType() === 'application/wasm') {
            // For WebAssembly locations, we follow the conventions described in
            // github.com/WebAssembly/design/blob/master/Web.md#developer-facing-display-conventions
            if (typeof this.columnNumber === 'number') {
                linkText += `:0x${this.columnNumber.toString(16)}`;
            }
        }
        else {
            linkText += ':' + (this.lineNumber + 1);
            if (showColumnNumber && typeof this.columnNumber === 'number') {
                linkText += ':' + (this.columnNumber + 1);
            }
        }
        return linkText;
    }
    id() {
        if (typeof this.columnNumber === 'number') {
            return this.uiSourceCode.project().id() + ':' + this.uiSourceCode.url() + ':' + this.lineNumber + ':' +
                this.columnNumber;
        }
        return this.lineId();
    }
    lineId() {
        return this.uiSourceCode.project().id() + ':' + this.uiSourceCode.url() + ':' + this.lineNumber;
    }
    toUIString() {
        return this.uiSourceCode.url() + ':' + (this.lineNumber + 1);
    }
    static comparator(location1, location2) {
        return location1.compareTo(location2);
    }
    compareTo(other) {
        if (this.uiSourceCode.url() !== other.uiSourceCode.url()) {
            return this.uiSourceCode.url() > other.uiSourceCode.url() ? 1 : -1;
        }
        if (this.lineNumber !== other.lineNumber) {
            return this.lineNumber - other.lineNumber;
        }
        // We consider `undefined` less than an actual column number, since
        // UI location without a column number corresponds to the whole line.
        if (this.columnNumber === other.columnNumber) {
            return 0;
        }
        if (typeof this.columnNumber !== 'number') {
            return -1;
        }
        if (typeof other.columnNumber !== 'number') {
            return 1;
        }
        return this.columnNumber - other.columnNumber;
    }
}
/**
 * A message associated with a range in a `UISourceCode`. The range will be
 * underlined starting at the range's start and ending at the line end (the
 * end of the range is currently disregarded).
 * An icon is going to appear at the end of the line according to the
 * `level` of the Message. This is only the model; displaying is handled
 * where UISourceCode displaying is handled.
 */
export class Message {
    levelInternal;
    textInternal;
    range;
    clickHandlerInternal;
    constructor(level, text, clickHandler, range) {
        this.levelInternal = level;
        this.textInternal = text;
        this.range = range ?? new TextUtils.TextRange.TextRange(0, 0, 0, 0);
        this.clickHandlerInternal = clickHandler;
    }
    level() {
        return this.levelInternal;
    }
    text() {
        return this.textInternal;
    }
    clickHandler() {
        return this.clickHandlerInternal;
    }
    lineNumber() {
        return this.range.startLine;
    }
    columnNumber() {
        return this.range.startColumn;
    }
    isEqual(another) {
        return this.text() === another.text() && this.level() === another.level() && this.range.equal(another.range);
    }
}
(function (Message) {
    // TODO(crbug.com/1167717): Make this a const enum again
    // eslint-disable-next-line rulesdir/const_enum
    let Level;
    (function (Level) {
        Level["Error"] = "Error";
        Level["Issue"] = "Issue";
        Level["Warning"] = "Warning";
    })(Level = Message.Level || (Message.Level = {}));
})(Message || (Message = {}));
export class LineMarker {
    rangeInternal;
    typeInternal;
    dataInternal;
    constructor(range, type, data) {
        this.rangeInternal = range;
        this.typeInternal = type;
        this.dataInternal = data;
    }
    range() {
        return this.rangeInternal;
    }
    type() {
        return this.typeInternal;
    }
    data() {
        return this.dataInternal;
    }
}
export class UISourceCodeMetadata {
    modificationTime;
    contentSize;
    constructor(modificationTime, contentSize) {
        this.modificationTime = modificationTime;
        this.contentSize = contentSize;
    }
}
//# sourceMappingURL=UISourceCode.js.map