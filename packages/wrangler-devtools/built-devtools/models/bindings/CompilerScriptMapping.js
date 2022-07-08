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
import * as TextUtils from '../text_utils/text_utils.js';
import * as Workspace from '../workspace/workspace.js';
import { ContentProviderBasedProject } from './ContentProviderBasedProject.js';
import { IgnoreListManager } from './IgnoreListManager.js';
import { NetworkProject } from './NetworkProject.js';
export class CompilerScriptMapping {
    #debuggerModel;
    #sourceMapManager;
    #workspace;
    #debuggerWorkspaceBinding;
    #regularProject;
    #contentScriptsProject;
    #regularBindings;
    #contentScriptsBindings;
    #stubUISourceCodes;
    #stubProject;
    #eventListeners;
    constructor(debuggerModel, workspace, debuggerWorkspaceBinding) {
        this.#debuggerModel = debuggerModel;
        this.#sourceMapManager = this.#debuggerModel.sourceMapManager();
        this.#workspace = workspace;
        this.#debuggerWorkspaceBinding = debuggerWorkspaceBinding;
        const target = debuggerModel.target();
        this.#regularProject = new ContentProviderBasedProject(workspace, 'jsSourceMaps::' + target.id(), Workspace.Workspace.projectTypes.Network, '', false /* isServiceProject */);
        this.#contentScriptsProject = new ContentProviderBasedProject(workspace, 'jsSourceMaps:extensions:' + target.id(), Workspace.Workspace.projectTypes.ContentScripts, '', false /* isServiceProject */);
        NetworkProject.setTargetForProject(this.#regularProject, target);
        NetworkProject.setTargetForProject(this.#contentScriptsProject, target);
        this.#regularBindings = new Map();
        this.#contentScriptsBindings = new Map();
        this.#stubUISourceCodes = new Map();
        this.#stubProject = new ContentProviderBasedProject(workspace, 'jsSourceMaps:stub:' + target.id(), Workspace.Workspace.projectTypes.Service, '', true /* isServiceProject */);
        this.#eventListeners = [
            this.#sourceMapManager.addEventListener(SDK.SourceMapManager.Events.SourceMapWillAttach, this.sourceMapWillAttach, this),
            this.#sourceMapManager.addEventListener(SDK.SourceMapManager.Events.SourceMapFailedToAttach, this.sourceMapFailedToAttach, this),
            this.#sourceMapManager.addEventListener(SDK.SourceMapManager.Events.SourceMapAttached, this.sourceMapAttached, this),
            this.#sourceMapManager.addEventListener(SDK.SourceMapManager.Events.SourceMapDetached, this.sourceMapDetached, this),
            this.#workspace.addEventListener(Workspace.Workspace.Events.UISourceCodeAdded, event => {
                this.onUiSourceCodeAdded(event);
            }, this),
        ];
    }
    onUiSourceCodeAdded(event) {
        const uiSourceCode = event.data;
        if (uiSourceCode.contentType().isDocument()) {
            for (const script of this.#debuggerModel.scriptsForSourceURL(uiSourceCode.url())) {
                void this.#debuggerWorkspaceBinding.updateLocations(script);
            }
        }
    }
    addStubUISourceCode(script) {
        const stubUISourceCode = this.#stubProject.addContentProvider(Common.ParsedURL.ParsedURL.concatenate(script.sourceURL, ':sourcemap'), TextUtils.StaticContentProvider.StaticContentProvider.fromString(script.sourceURL, Common.ResourceType.resourceTypes.Script, '\n\n\n\n\n// Please wait a bit.\n// Compiled script is not shown while source map is being loaded!'), 'text/javascript');
        this.#stubUISourceCodes.set(script, stubUISourceCode);
    }
    async removeStubUISourceCode(script) {
        const uiSourceCode = this.#stubUISourceCodes.get(script);
        this.#stubUISourceCodes.delete(script);
        if (uiSourceCode) {
            this.#stubProject.removeFile(uiSourceCode.url());
        }
        await this.#debuggerWorkspaceBinding.updateLocations(script);
    }
    static uiSourceCodeOrigin(uiSourceCode) {
        const binding = uiSourceCodeToBinding.get(uiSourceCode);
        if (binding) {
            return binding.getReferringSourceMaps().map((sourceMap) => sourceMap.compiledURL());
        }
        return [];
    }
    getLocationRangesForSameSourceLocation(rawLocation) {
        const debuggerModel = rawLocation.debuggerModel;
        const script = rawLocation.script();
        if (!script) {
            return [];
        }
        const sourceMap = this.#sourceMapManager.sourceMapForClient(script);
        if (!sourceMap) {
            return [];
        }
        // Find the source location for the raw location.
        const entry = sourceMap.findEntry(rawLocation.lineNumber, rawLocation.columnNumber);
        if (!entry || !entry.sourceURL) {
            return [];
        }
        // Map the source location back to raw location ranges.
        const ranges = sourceMap.findReverseRanges(entry.sourceURL, entry.sourceLineNumber, entry.sourceColumnNumber);
        return ranges.map(textRangeToLocationRange);
        function textRangeToLocationRange(t) {
            return {
                start: debuggerModel.createRawLocation(script, t.startLine, t.startColumn),
                end: debuggerModel.createRawLocation(script, t.endLine, t.endColumn),
            };
        }
    }
    uiSourceCodeForURL(url, isContentScript) {
        return isContentScript ? this.#contentScriptsProject.uiSourceCodeForURL(url) :
            this.#regularProject.uiSourceCodeForURL(url);
    }
    rawLocationToUILocation(rawLocation) {
        const script = rawLocation.script();
        if (!script) {
            return null;
        }
        const lineNumber = rawLocation.lineNumber - script.lineOffset;
        let columnNumber = rawLocation.columnNumber;
        if (!lineNumber) {
            columnNumber -= script.columnOffset;
        }
        const stubUISourceCode = this.#stubUISourceCodes.get(script);
        if (stubUISourceCode) {
            return new Workspace.UISourceCode.UILocation(stubUISourceCode, lineNumber, columnNumber);
        }
        const sourceMap = this.#sourceMapManager.sourceMapForClient(script);
        if (!sourceMap) {
            return null;
        }
        const entry = sourceMap.findEntry(lineNumber, columnNumber);
        if (!entry || !entry.sourceURL) {
            return null;
        }
        const uiSourceCode = script.isContentScript() ? this.#contentScriptsProject.uiSourceCodeForURL(entry.sourceURL) :
            this.#regularProject.uiSourceCodeForURL(entry.sourceURL);
        if (!uiSourceCode) {
            return null;
        }
        return uiSourceCode.uiLocation(entry.sourceLineNumber, entry.sourceColumnNumber);
    }
    uiLocationToRawLocations(uiSourceCode, lineNumber, columnNumber) {
        const binding = uiSourceCodeToBinding.get(uiSourceCode);
        if (!binding) {
            return [];
        }
        const locations = [];
        for (const sourceMap of binding.getReferringSourceMaps()) {
            const entry = sourceMap.sourceLineMapping(uiSourceCode.url(), lineNumber, columnNumber);
            if (!entry) {
                continue;
            }
            for (const script of this.#sourceMapManager.clientsForSourceMap(sourceMap)) {
                locations.push(this.#debuggerModel.createRawLocation(script, entry.lineNumber + script.lineOffset, !entry.lineNumber ? entry.columnNumber + script.columnOffset : entry.columnNumber));
            }
        }
        return locations;
    }
    async sourceMapWillAttach(event) {
        const script = event.data.client;
        // Create stub UISourceCode for the time source mapping is being loaded.
        this.addStubUISourceCode(script);
        await this.#debuggerWorkspaceBinding.updateLocations(script);
    }
    async sourceMapFailedToAttach(event) {
        const script = event.data.client;
        await this.removeStubUISourceCode(script);
    }
    async sourceMapAttached(event) {
        const script = event.data.client;
        const sourceMap = event.data.sourceMap;
        await this.removeStubUISourceCode(script);
        if (IgnoreListManager.instance().isIgnoreListedURL(script.sourceURL, script.isContentScript())) {
            this.sourceMapAttachedForTest(sourceMap);
            return;
        }
        await this.populateSourceMapSources(script, sourceMap);
        this.sourceMapAttachedForTest(sourceMap);
    }
    async sourceMapDetached(event) {
        const script = event.data.client;
        const sourceMap = event.data.sourceMap;
        const bindings = script.isContentScript() ? this.#contentScriptsBindings : this.#regularBindings;
        for (const sourceURL of sourceMap.sourceURLs()) {
            const binding = bindings.get(sourceURL);
            if (binding) {
                binding.removeSourceMap(sourceMap, script.frameId);
                if (!binding.getUiSourceCode()) {
                    bindings.delete(sourceURL);
                }
            }
        }
        await this.#debuggerWorkspaceBinding.updateLocations(script);
    }
    sourceMapForScript(script) {
        return this.#sourceMapManager.sourceMapForClient(script);
    }
    scriptsForUISourceCode(uiSourceCode) {
        const binding = uiSourceCodeToBinding.get(uiSourceCode);
        if (!binding) {
            return [];
        }
        const scripts = [];
        for (const sourceMap of binding.getReferringSourceMaps()) {
            this.#sourceMapManager.clientsForSourceMap(sourceMap).forEach(script => scripts.push(script));
        }
        return scripts;
    }
    sourceMapAttachedForTest(_sourceMap) {
    }
    async populateSourceMapSources(script, sourceMap) {
        const project = script.isContentScript() ? this.#contentScriptsProject : this.#regularProject;
        const bindings = script.isContentScript() ? this.#contentScriptsBindings : this.#regularBindings;
        for (const sourceURL of sourceMap.sourceURLs()) {
            let binding = bindings.get(sourceURL);
            if (!binding) {
                binding = new Binding(project, sourceURL);
                bindings.set(sourceURL, binding);
            }
            binding.addSourceMap(sourceMap, script.frameId);
        }
        await this.#debuggerWorkspaceBinding.updateLocations(script);
    }
    static uiLineHasMapping(uiSourceCode, lineNumber) {
        const binding = uiSourceCodeToBinding.get(uiSourceCode);
        if (!binding) {
            return true;
        }
        for (const sourceMap of binding.getReferringSourceMaps()) {
            if (sourceMap.sourceLineMapping(uiSourceCode.url(), lineNumber, 0)) {
                return true;
            }
        }
        return false;
    }
    dispose() {
        Common.EventTarget.removeEventListeners(this.#eventListeners);
        this.#regularProject.dispose();
        this.#contentScriptsProject.dispose();
        this.#stubProject.dispose();
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
        const newUISourceCode = this.#project.createUISourceCode(this.#url, Common.ResourceType.resourceTypes.SourceMapScript);
        uiSourceCodeToBinding.set(newUISourceCode, this);
        const contentProvider = sourceMap.sourceContentProvider(this.#url, Common.ResourceType.resourceTypes.SourceMapScript);
        const mimeType = Common.ResourceType.ResourceType.mimeFromURL(this.#url) || 'text/javascript';
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
//# sourceMappingURL=CompilerScriptMapping.js.map