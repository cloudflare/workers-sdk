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
import { CSSWorkspaceBinding } from './CSSWorkspaceBinding.js';
import { NetworkProject } from './NetworkProject.js';
export class SASSSourceMapping {
    #sourceMapManager;
    #project;
    #eventListeners;
    #bindings;
    constructor(target, sourceMapManager, workspace) {
        this.#sourceMapManager = sourceMapManager;
        this.#project = new ContentProviderBasedProject(workspace, 'cssSourceMaps:' + target.id(), Workspace.Workspace.projectTypes.Network, '', false /* isServiceProject */);
        NetworkProject.setTargetForProject(this.#project, target);
        this.#bindings = new Map();
        this.#eventListeners = [
            this.#sourceMapManager.addEventListener(SDK.SourceMapManager.Events.SourceMapAttached, this.sourceMapAttached, this),
            this.#sourceMapManager.addEventListener(SDK.SourceMapManager.Events.SourceMapDetached, this.sourceMapDetached, this),
        ];
    }
    sourceMapAttachedForTest(_sourceMap) {
    }
    async sourceMapAttached(event) {
        const header = event.data.client;
        const sourceMap = event.data.sourceMap;
        const project = this.#project;
        const bindings = this.#bindings;
        for (const sourceURL of sourceMap.sourceURLs()) {
            let binding = bindings.get(sourceURL);
            if (!binding) {
                binding = new Binding(project, sourceURL);
                bindings.set(sourceURL, binding);
            }
            binding.addSourceMap(sourceMap, header.frameId);
        }
        await CSSWorkspaceBinding.instance().updateLocations(header);
        this.sourceMapAttachedForTest(sourceMap);
    }
    async sourceMapDetached(event) {
        const header = event.data.client;
        const sourceMap = event.data.sourceMap;
        const bindings = this.#bindings;
        for (const sourceURL of sourceMap.sourceURLs()) {
            const binding = bindings.get(sourceURL);
            if (binding) {
                binding.removeSourceMap(sourceMap, header.frameId);
                if (!binding.getUiSourceCode()) {
                    bindings.delete(sourceURL);
                }
            }
        }
        await CSSWorkspaceBinding.instance().updateLocations(header);
    }
    rawLocationToUILocation(rawLocation) {
        const header = rawLocation.header();
        if (!header) {
            return null;
        }
        const sourceMap = this.#sourceMapManager.sourceMapForClient(header);
        if (!sourceMap) {
            return null;
        }
        let { lineNumber, columnNumber } = rawLocation;
        // If the source map maps the origin (line:0, column:0) but the CSS header is inline (in a HTML doc),
        // then adjust the line and column numbers.
        if (sourceMap.mapsOrigin() && header.isInline) {
            lineNumber -= header.startLine;
            if (lineNumber === 0) {
                columnNumber -= header.startColumn;
            }
        }
        const entry = sourceMap.findEntry(lineNumber, columnNumber);
        if (!entry || !entry.sourceURL) {
            return null;
        }
        const uiSourceCode = this.#project.uiSourceCodeForURL(entry.sourceURL);
        if (!uiSourceCode) {
            return null;
        }
        return uiSourceCode.uiLocation(entry.sourceLineNumber, entry.sourceColumnNumber);
    }
    uiLocationToRawLocations(uiLocation) {
        // TODO(crbug.com/1153123): Revisit the `#columnNumber || 0` and also preserve `undefined` for source maps?
        const { uiSourceCode, lineNumber, columnNumber = 0 } = uiLocation;
        const binding = uiSourceCodeToBinding.get(uiSourceCode);
        if (!binding) {
            return [];
        }
        const locations = [];
        for (const sourceMap of binding.getReferringSourceMaps()) {
            const entries = sourceMap.findReverseEntries(uiSourceCode.url(), lineNumber, columnNumber);
            for (const header of this.#sourceMapManager.clientsForSourceMap(sourceMap)) {
                locations.push(...entries.map(entry => new SDK.CSSModel.CSSLocation(header, entry.lineNumber, entry.columnNumber)));
            }
        }
        return locations;
    }
    dispose() {
        Common.EventTarget.removeEventListeners(this.#eventListeners);
        this.#project.dispose();
    }
}
const uiSourceCodeToBinding = new WeakMap();
class Binding {
    #project;
    #url;
    referringSourceMaps;
    uiSourceCode;
    constructor(project, url) {
        this.#project = project;
        this.#url = url;
        this.referringSourceMaps = [];
        this.uiSourceCode = null;
    }
    recreateUISourceCodeIfNeeded(frameId) {
        const sourceMap = this.referringSourceMaps[this.referringSourceMaps.length - 1];
        const contentProvider = sourceMap.sourceContentProvider(this.#url, Common.ResourceType.resourceTypes.SourceMapStyleSheet);
        const newUISourceCode = this.#project.createUISourceCode(this.#url, contentProvider.contentType());
        uiSourceCodeToBinding.set(newUISourceCode, this);
        const mimeType = Common.ResourceType.ResourceType.mimeFromURL(this.#url) || contentProvider.contentType().canonicalMimeType();
        const embeddedContent = sourceMap.embeddedContentByURL(this.#url);
        const metadata = typeof embeddedContent === 'string' ?
            new Workspace.UISourceCode.UISourceCodeMetadata(null, embeddedContent.length) :
            null;
        if (this.uiSourceCode) {
            NetworkProject.cloneInitialFrameAttribution(this.uiSourceCode, newUISourceCode);
            this.#project.removeFile(this.uiSourceCode.url());
        }
        else {
            NetworkProject.setInitialFrameAttribution(newUISourceCode, frameId);
        }
        this.uiSourceCode = newUISourceCode;
        this.#project.addUISourceCodeWithProvider(this.uiSourceCode, contentProvider, metadata, mimeType);
    }
    addSourceMap(sourceMap, frameId) {
        if (this.uiSourceCode) {
            NetworkProject.addFrameAttribution(this.uiSourceCode, frameId);
        }
        this.referringSourceMaps.push(sourceMap);
        this.recreateUISourceCodeIfNeeded(frameId);
    }
    removeSourceMap(sourceMap, frameId) {
        const uiSourceCode = this.uiSourceCode;
        NetworkProject.removeFrameAttribution(uiSourceCode, frameId);
        const lastIndex = this.referringSourceMaps.lastIndexOf(sourceMap);
        if (lastIndex !== -1) {
            this.referringSourceMaps.splice(lastIndex, 1);
        }
        if (!this.referringSourceMaps.length) {
            this.#project.removeFile(uiSourceCode.url());
            this.uiSourceCode = null;
        }
        else {
            this.recreateUISourceCodeIfNeeded(frameId);
        }
    }
    getReferringSourceMaps() {
        return this.referringSourceMaps;
    }
    getUiSourceCode() {
        return this.uiSourceCode;
    }
}
//# sourceMappingURL=SASSSourceMapping.js.map