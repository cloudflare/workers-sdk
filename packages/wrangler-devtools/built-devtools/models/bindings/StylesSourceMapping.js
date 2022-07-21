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
import * as SDK from '../../core/sdk/sdk.js';
import * as Workspace from '../workspace/workspace.js';
import { ContentProviderBasedProject } from './ContentProviderBasedProject.js';
import { NetworkProject } from './NetworkProject.js';
import { metadataForURL } from './ResourceUtils.js';
const uiSourceCodeToStyleMap = new WeakMap();
export class StylesSourceMapping {
    #cssModel;
    #project;
    #styleFiles;
    #eventListeners;
    constructor(cssModel, workspace) {
        this.#cssModel = cssModel;
        const target = this.#cssModel.target();
        this.#project = new ContentProviderBasedProject(workspace, 'css:' + target.id(), Workspace.Workspace.projectTypes.Network, '', false /* isServiceProject */);
        NetworkProject.setTargetForProject(this.#project, target);
        this.#styleFiles = new Map();
        this.#eventListeners = [
            this.#cssModel.addEventListener(SDK.CSSModel.Events.StyleSheetAdded, this.styleSheetAdded, this),
            this.#cssModel.addEventListener(SDK.CSSModel.Events.StyleSheetRemoved, this.styleSheetRemoved, this),
            this.#cssModel.addEventListener(SDK.CSSModel.Events.StyleSheetChanged, this.styleSheetChanged, this),
        ];
    }
    rawLocationToUILocation(rawLocation) {
        const header = rawLocation.header();
        if (!header || !this.acceptsHeader(header)) {
            return null;
        }
        const styleFile = this.#styleFiles.get(header.resourceURL());
        if (!styleFile) {
            return null;
        }
        let lineNumber = rawLocation.lineNumber;
        let columnNumber = rawLocation.columnNumber;
        if (header.isInline && header.hasSourceURL) {
            lineNumber -= header.lineNumberInSource(0);
            const headerColumnNumber = header.columnNumberInSource(lineNumber, 0);
            if (typeof headerColumnNumber === 'undefined') {
                columnNumber = headerColumnNumber;
            }
            else {
                columnNumber -= headerColumnNumber;
            }
        }
        return styleFile.getUiSourceCode().uiLocation(lineNumber, columnNumber);
    }
    uiLocationToRawLocations(uiLocation) {
        const styleFile = uiSourceCodeToStyleMap.get(uiLocation.uiSourceCode);
        if (!styleFile) {
            return [];
        }
        const rawLocations = [];
        for (const header of styleFile.getHeaders()) {
            let lineNumber = uiLocation.lineNumber;
            let columnNumber = uiLocation.columnNumber;
            if (header.isInline && header.hasSourceURL) {
                // TODO(crbug.com/1153123): Revisit the `#columnNumber || 0` and also preserve `undefined` for source maps?
                columnNumber = header.columnNumberInSource(lineNumber, uiLocation.columnNumber || 0);
                lineNumber = header.lineNumberInSource(lineNumber);
            }
            rawLocations.push(new SDK.CSSModel.CSSLocation(header, lineNumber, columnNumber));
        }
        return rawLocations;
    }
    acceptsHeader(header) {
        if (header.isConstructedByNew()) {
            return false;
        }
        if (header.isInline && !header.hasSourceURL && header.origin !== 'inspector') {
            return false;
        }
        if (!header.resourceURL()) {
            return false;
        }
        return true;
    }
    styleSheetAdded(event) {
        const header = event.data;
        if (!this.acceptsHeader(header)) {
            return;
        }
        const url = header.resourceURL();
        let styleFile = this.#styleFiles.get(url);
        if (!styleFile) {
            styleFile = new StyleFile(this.#cssModel, this.#project, header);
            this.#styleFiles.set(url, styleFile);
        }
        else {
            styleFile.addHeader(header);
        }
    }
    styleSheetRemoved(event) {
        const header = event.data;
        if (!this.acceptsHeader(header)) {
            return;
        }
        const url = header.resourceURL();
        const styleFile = this.#styleFiles.get(url);
        if (styleFile) {
            if (styleFile.getHeaders().size === 1) {
                styleFile.dispose();
                this.#styleFiles.delete(url);
            }
            else {
                styleFile.removeHeader(header);
            }
        }
    }
    styleSheetChanged(event) {
        const header = this.#cssModel.styleSheetHeaderForId(event.data.styleSheetId);
        if (!header || !this.acceptsHeader(header)) {
            return;
        }
        const styleFile = this.#styleFiles.get(header.resourceURL());
        if (styleFile) {
            styleFile.styleSheetChanged(header);
        }
    }
    dispose() {
        for (const styleFile of this.#styleFiles.values()) {
            styleFile.dispose();
        }
        this.#styleFiles.clear();
        Common.EventTarget.removeEventListeners(this.#eventListeners);
        this.#project.removeProject();
    }
}
export class StyleFile {
    #cssModel;
    #project;
    headers;
    uiSourceCode;
    #eventListeners;
    #throttler;
    #terminated;
    #isAddingRevision;
    #isUpdatingHeaders;
    constructor(cssModel, project, header) {
        this.#cssModel = cssModel;
        this.#project = project;
        this.headers = new Set([header]);
        const target = cssModel.target();
        const url = header.resourceURL();
        const metadata = metadataForURL(target, header.frameId, url);
        this.uiSourceCode = this.#project.createUISourceCode(url, header.contentType());
        uiSourceCodeToStyleMap.set(this.uiSourceCode, this);
        NetworkProject.setInitialFrameAttribution(this.uiSourceCode, header.frameId);
        this.#project.addUISourceCodeWithProvider(this.uiSourceCode, this, metadata, 'text/css');
        this.#eventListeners = [
            this.uiSourceCode.addEventListener(Workspace.UISourceCode.Events.WorkingCopyChanged, this.workingCopyChanged, this),
            this.uiSourceCode.addEventListener(Workspace.UISourceCode.Events.WorkingCopyCommitted, this.workingCopyCommitted, this),
        ];
        this.#throttler = new Common.Throttler.Throttler(StyleFile.updateTimeout);
        this.#terminated = false;
    }
    addHeader(header) {
        this.headers.add(header);
        NetworkProject.addFrameAttribution(this.uiSourceCode, header.frameId);
    }
    removeHeader(header) {
        this.headers.delete(header);
        NetworkProject.removeFrameAttribution(this.uiSourceCode, header.frameId);
    }
    styleSheetChanged(header) {
        console.assert(this.headers.has(header));
        if (this.#isUpdatingHeaders || !this.headers.has(header)) {
            return;
        }
        const mirrorContentBound = this.mirrorContent.bind(this, header, true /* majorChange */);
        void this.#throttler.schedule(mirrorContentBound, false /* asSoonAsPossible */);
    }
    workingCopyCommitted() {
        if (this.#isAddingRevision) {
            return;
        }
        const mirrorContentBound = this.mirrorContent.bind(this, this.uiSourceCode, true /* majorChange */);
        void this.#throttler.schedule(mirrorContentBound, true /* asSoonAsPossible */);
    }
    workingCopyChanged() {
        if (this.#isAddingRevision) {
            return;
        }
        const mirrorContentBound = this.mirrorContent.bind(this, this.uiSourceCode, false /* majorChange */);
        void this.#throttler.schedule(mirrorContentBound, false /* asSoonAsPossible */);
    }
    async mirrorContent(fromProvider, majorChange) {
        if (this.#terminated) {
            this.styleFileSyncedForTest();
            return;
        }
        let newContent = null;
        if (fromProvider === this.uiSourceCode) {
            newContent = this.uiSourceCode.workingCopy();
        }
        else {
            const deferredContent = await fromProvider.requestContent();
            newContent = deferredContent.content;
        }
        if (newContent === null || this.#terminated) {
            this.styleFileSyncedForTest();
            return;
        }
        if (fromProvider !== this.uiSourceCode) {
            this.#isAddingRevision = true;
            this.uiSourceCode.addRevision(newContent);
            this.#isAddingRevision = false;
        }
        this.#isUpdatingHeaders = true;
        const promises = [];
        for (const header of this.headers) {
            if (header === fromProvider) {
                continue;
            }
            promises.push(this.#cssModel.setStyleSheetText(header.id, newContent, majorChange));
        }
        // ------ ASYNC ------
        await Promise.all(promises);
        this.#isUpdatingHeaders = false;
        this.styleFileSyncedForTest();
    }
    styleFileSyncedForTest() {
    }
    dispose() {
        if (this.#terminated) {
            return;
        }
        this.#terminated = true;
        this.#project.removeFile(this.uiSourceCode.url());
        Common.EventTarget.removeEventListeners(this.#eventListeners);
    }
    contentURL() {
        console.assert(this.headers.size > 0);
        return this.headers.values().next().value.originalContentProvider().contentURL();
    }
    contentType() {
        console.assert(this.headers.size > 0);
        return this.headers.values().next().value.originalContentProvider().contentType();
    }
    contentEncoded() {
        console.assert(this.headers.size > 0);
        return this.headers.values().next().value.originalContentProvider().contentEncoded();
    }
    requestContent() {
        console.assert(this.headers.size > 0);
        return this.headers.values().next().value.originalContentProvider().requestContent();
    }
    searchInContent(query, caseSensitive, isRegex) {
        console.assert(this.headers.size > 0);
        return this.headers.values().next().value.originalContentProvider().searchInContent(query, caseSensitive, isRegex);
    }
    // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
    // eslint-disable-next-line @typescript-eslint/naming-convention
    static updateTimeout = 200;
    getHeaders() {
        return this.headers;
    }
    getUiSourceCode() {
        return this.uiSourceCode;
    }
}
//# sourceMappingURL=StylesSourceMapping.js.map