// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as TextUtils from '../text_utils/text_utils.js';
import * as Workspace from '../workspace/workspace.js';
import { ContentProviderBasedProject } from './ContentProviderBasedProject.js';
import { CSSWorkspaceBinding } from './CSSWorkspaceBinding.js';
import { DebuggerWorkspaceBinding } from './DebuggerWorkspaceBinding.js';
import { NetworkProject } from './NetworkProject.js';
import { resourceMetadata } from './ResourceUtils.js';
let resourceMappingInstance;
const styleSheetOffsetMap = new WeakMap();
const scriptOffsetMap = new WeakMap();
const boundUISourceCodes = new WeakSet();
export class ResourceMapping {
    #workspace;
    #modelToInfo;
    constructor(targetManager, workspace) {
        this.#workspace = workspace;
        this.#modelToInfo = new Map();
        targetManager.observeModels(SDK.ResourceTreeModel.ResourceTreeModel, this);
    }
    static instance(opts = { forceNew: null, targetManager: null, workspace: null }) {
        const { forceNew, targetManager, workspace } = opts;
        if (!resourceMappingInstance || forceNew) {
            if (!targetManager || !workspace) {
                throw new Error(`Unable to create ResourceMapping: targetManager and workspace must be provided: ${new Error().stack}`);
            }
            resourceMappingInstance = new ResourceMapping(targetManager, workspace);
        }
        return resourceMappingInstance;
    }
    static removeInstance() {
        resourceMappingInstance = undefined;
    }
    modelAdded(resourceTreeModel) {
        const info = new ModelInfo(this.#workspace, resourceTreeModel);
        this.#modelToInfo.set(resourceTreeModel, info);
    }
    modelRemoved(resourceTreeModel) {
        const info = this.#modelToInfo.get(resourceTreeModel);
        if (info) {
            info.dispose();
            this.#modelToInfo.delete(resourceTreeModel);
        }
    }
    infoForTarget(target) {
        const resourceTreeModel = target.model(SDK.ResourceTreeModel.ResourceTreeModel);
        return resourceTreeModel ? this.#modelToInfo.get(resourceTreeModel) || null : null;
    }
    cssLocationToUILocation(cssLocation) {
        const header = cssLocation.header();
        if (!header) {
            return null;
        }
        const info = this.infoForTarget(cssLocation.cssModel().target());
        if (!info) {
            return null;
        }
        const uiSourceCode = info.getProject().uiSourceCodeForURL(cssLocation.url);
        if (!uiSourceCode) {
            return null;
        }
        const offset = styleSheetOffsetMap.get(header) ||
            TextUtils.TextRange.TextRange.createFromLocation(header.startLine, header.startColumn);
        const lineNumber = cssLocation.lineNumber + offset.startLine - header.startLine;
        let columnNumber = cssLocation.columnNumber;
        if (cssLocation.lineNumber === header.startLine) {
            columnNumber += offset.startColumn - header.startColumn;
        }
        return uiSourceCode.uiLocation(lineNumber, columnNumber);
    }
    jsLocationToUILocation(jsLocation) {
        const script = jsLocation.script();
        if (!script) {
            return null;
        }
        const info = this.infoForTarget(jsLocation.debuggerModel.target());
        if (!info) {
            return null;
        }
        const embedderName = script.embedderName();
        if (!embedderName) {
            return null;
        }
        const uiSourceCode = info.getProject().uiSourceCodeForURL(embedderName);
        if (!uiSourceCode) {
            return null;
        }
        const offset = scriptOffsetMap.get(script) ||
            TextUtils.TextRange.TextRange.createFromLocation(script.lineOffset, script.columnOffset);
        let lineNumber = jsLocation.lineNumber + offset.startLine - script.lineOffset;
        let columnNumber = jsLocation.columnNumber;
        if (jsLocation.lineNumber === script.lineOffset) {
            columnNumber += offset.startColumn - script.columnOffset;
        }
        if (script.hasSourceURL) {
            if (lineNumber === 0) {
                columnNumber += script.columnOffset;
            }
            lineNumber += script.lineOffset;
        }
        return uiSourceCode.uiLocation(lineNumber, columnNumber);
    }
    uiLocationToJSLocations(uiSourceCode, lineNumber, columnNumber) {
        if (!boundUISourceCodes.has(uiSourceCode)) {
            return [];
        }
        const target = NetworkProject.targetForUISourceCode(uiSourceCode);
        if (!target) {
            return [];
        }
        const debuggerModel = target.model(SDK.DebuggerModel.DebuggerModel);
        if (!debuggerModel) {
            return [];
        }
        const locations = [];
        for (const script of debuggerModel.scripts()) {
            if (script.embedderName() !== uiSourceCode.url()) {
                continue;
            }
            const { startLine, startColumn } = scriptOffsetMap.get(script) ||
                TextUtils.TextRange.TextRange.createFromLocation(script.lineOffset, script.columnOffset);
            if (lineNumber < startLine || (lineNumber === startLine && columnNumber < startColumn)) {
                continue;
            }
            const endLine = startLine + (script.endLine - script.lineOffset);
            const endColumn = startLine === endLine ? startColumn + (script.endColumn - script.columnOffset) : script.endColumn;
            if (lineNumber > endLine || (lineNumber === endLine && columnNumber > endColumn)) {
                continue;
            }
            let scriptLineNumber = lineNumber;
            let scriptColumnNumber = columnNumber;
            if (script.hasSourceURL) {
                scriptLineNumber -= startLine;
                if (scriptLineNumber === 0) {
                    scriptColumnNumber -= startColumn;
                }
            }
            locations.push(debuggerModel.createRawLocation(script, scriptLineNumber, scriptColumnNumber));
        }
        return locations;
    }
    uiLocationToCSSLocations(uiLocation) {
        if (!boundUISourceCodes.has(uiLocation.uiSourceCode)) {
            return [];
        }
        const target = NetworkProject.targetForUISourceCode(uiLocation.uiSourceCode);
        if (!target) {
            return [];
        }
        const cssModel = target.model(SDK.CSSModel.CSSModel);
        if (!cssModel) {
            return [];
        }
        return cssModel.createRawLocationsByURL(uiLocation.uiSourceCode.url(), uiLocation.lineNumber, uiLocation.columnNumber);
    }
    resetForTest(target) {
        const resourceTreeModel = target.model(SDK.ResourceTreeModel.ResourceTreeModel);
        const info = resourceTreeModel ? this.#modelToInfo.get(resourceTreeModel) : null;
        if (info) {
            info.resetForTest();
        }
    }
}
class ModelInfo {
    project;
    #bindings;
    #cssModel;
    #eventListeners;
    constructor(workspace, resourceTreeModel) {
        const target = resourceTreeModel.target();
        this.project = new ContentProviderBasedProject(workspace, 'resources:' + target.id(), Workspace.Workspace.projectTypes.Network, '', false /* isServiceProject */);
        NetworkProject.setTargetForProject(this.project, target);
        this.#bindings = new Map();
        const cssModel = target.model(SDK.CSSModel.CSSModel);
        console.assert(Boolean(cssModel));
        this.#cssModel = cssModel;
        this.#eventListeners = [
            resourceTreeModel.addEventListener(SDK.ResourceTreeModel.Events.ResourceAdded, this.resourceAdded, this),
            resourceTreeModel.addEventListener(SDK.ResourceTreeModel.Events.FrameWillNavigate, this.frameWillNavigate, this),
            resourceTreeModel.addEventListener(SDK.ResourceTreeModel.Events.FrameDetached, this.frameDetached, this),
            this.#cssModel.addEventListener(SDK.CSSModel.Events.StyleSheetChanged, event => {
                void this.styleSheetChanged(event);
            }, this),
        ];
    }
    async styleSheetChanged(event) {
        const header = this.#cssModel.styleSheetHeaderForId(event.data.styleSheetId);
        if (!header || !header.isInline || (header.isInline && header.isMutable)) {
            return;
        }
        const binding = this.#bindings.get(header.resourceURL());
        if (!binding) {
            return;
        }
        await binding.styleSheetChanged(header, event.data.edit || null);
    }
    acceptsResource(resource) {
        const resourceType = resource.resourceType();
        // Only load selected resource types from resources.
        if (resourceType !== Common.ResourceType.resourceTypes.Image &&
            resourceType !== Common.ResourceType.resourceTypes.Font &&
            resourceType !== Common.ResourceType.resourceTypes.Document &&
            resourceType !== Common.ResourceType.resourceTypes.Manifest) {
            return false;
        }
        // Ignore non-images and non-fonts.
        if (resourceType === Common.ResourceType.resourceTypes.Image && resource.mimeType &&
            !resource.mimeType.startsWith('image')) {
            return false;
        }
        if (resourceType === Common.ResourceType.resourceTypes.Font && resource.mimeType &&
            !resource.mimeType.includes('font')) {
            return false;
        }
        if ((resourceType === Common.ResourceType.resourceTypes.Image ||
            resourceType === Common.ResourceType.resourceTypes.Font) &&
            resource.contentURL().startsWith('data:')) {
            return false;
        }
        return true;
    }
    resourceAdded(event) {
        const resource = event.data;
        if (!this.acceptsResource(resource)) {
            return;
        }
        let binding = this.#bindings.get(resource.url);
        if (!binding) {
            binding = new Binding(this.project, resource);
            this.#bindings.set(resource.url, binding);
        }
        else {
            binding.addResource(resource);
        }
    }
    removeFrameResources(frame) {
        for (const resource of frame.resources()) {
            if (!this.acceptsResource(resource)) {
                continue;
            }
            const binding = this.#bindings.get(resource.url);
            if (!binding) {
                continue;
            }
            if (binding.resources.size === 1) {
                binding.dispose();
                this.#bindings.delete(resource.url);
            }
            else {
                binding.removeResource(resource);
            }
        }
    }
    frameWillNavigate(event) {
        this.removeFrameResources(event.data);
    }
    frameDetached(event) {
        this.removeFrameResources(event.data.frame);
    }
    resetForTest() {
        for (const binding of this.#bindings.values()) {
            binding.dispose();
        }
        this.#bindings.clear();
    }
    dispose() {
        Common.EventTarget.removeEventListeners(this.#eventListeners);
        for (const binding of this.#bindings.values()) {
            binding.dispose();
        }
        this.#bindings.clear();
        this.project.removeProject();
    }
    getProject() {
        return this.project;
    }
}
class Binding {
    resources;
    #project;
    #uiSourceCode;
    #edits;
    constructor(project, resource) {
        this.resources = new Set([resource]);
        this.#project = project;
        this.#uiSourceCode = this.#project.createUISourceCode(resource.url, resource.contentType());
        boundUISourceCodes.add(this.#uiSourceCode);
        if (resource.frameId) {
            NetworkProject.setInitialFrameAttribution(this.#uiSourceCode, resource.frameId);
        }
        this.#project.addUISourceCodeWithProvider(this.#uiSourceCode, this, resourceMetadata(resource), resource.mimeType);
        this.#edits = [];
    }
    inlineStyles() {
        const target = NetworkProject.targetForUISourceCode(this.#uiSourceCode);
        const stylesheets = [];
        if (!target) {
            return stylesheets;
        }
        const cssModel = target.model(SDK.CSSModel.CSSModel);
        if (cssModel) {
            for (const headerId of cssModel.getStyleSheetIdsForURL(this.#uiSourceCode.url())) {
                const header = cssModel.styleSheetHeaderForId(headerId);
                if (header) {
                    stylesheets.push(header);
                }
            }
        }
        return stylesheets;
    }
    inlineScripts() {
        const target = NetworkProject.targetForUISourceCode(this.#uiSourceCode);
        if (!target) {
            return [];
        }
        const debuggerModel = target.model(SDK.DebuggerModel.DebuggerModel);
        if (!debuggerModel) {
            return [];
        }
        return debuggerModel.scripts().filter(script => script.embedderName() === this.#uiSourceCode.url());
    }
    async styleSheetChanged(stylesheet, edit) {
        this.#edits.push({ stylesheet, edit });
        if (this.#edits.length > 1) {
            return;
        } // There is already a styleSheetChanged loop running
        const { content } = await this.#uiSourceCode.requestContent();
        if (content !== null) {
            await this.innerStyleSheetChanged(content);
        }
        this.#edits = [];
    }
    async innerStyleSheetChanged(content) {
        const scripts = this.inlineScripts();
        const styles = this.inlineStyles();
        let text = new TextUtils.Text.Text(content);
        for (const data of this.#edits) {
            const edit = data.edit;
            if (!edit) {
                continue;
            }
            const stylesheet = data.stylesheet;
            const startLocation = styleSheetOffsetMap.get(stylesheet) ||
                TextUtils.TextRange.TextRange.createFromLocation(stylesheet.startLine, stylesheet.startColumn);
            const oldRange = edit.oldRange.relativeFrom(startLocation.startLine, startLocation.startColumn);
            const newRange = edit.newRange.relativeFrom(startLocation.startLine, startLocation.startColumn);
            text = new TextUtils.Text.Text(text.replaceRange(oldRange, edit.newText));
            const updatePromises = [];
            for (const script of scripts) {
                const scriptOffset = scriptOffsetMap.get(script) ||
                    TextUtils.TextRange.TextRange.createFromLocation(script.lineOffset, script.columnOffset);
                if (!scriptOffset.follows(oldRange)) {
                    continue;
                }
                scriptOffsetMap.set(script, scriptOffset.rebaseAfterTextEdit(oldRange, newRange));
                updatePromises.push(DebuggerWorkspaceBinding.instance().updateLocations(script));
            }
            for (const style of styles) {
                const styleOffset = styleSheetOffsetMap.get(style) ||
                    TextUtils.TextRange.TextRange.createFromLocation(style.startLine, style.startColumn);
                if (!styleOffset.follows(oldRange)) {
                    continue;
                }
                styleSheetOffsetMap.set(style, styleOffset.rebaseAfterTextEdit(oldRange, newRange));
                updatePromises.push(CSSWorkspaceBinding.instance().updateLocations(style));
            }
            await Promise.all(updatePromises);
        }
        this.#uiSourceCode.addRevision(text.value());
    }
    addResource(resource) {
        this.resources.add(resource);
        if (resource.frameId) {
            NetworkProject.addFrameAttribution(this.#uiSourceCode, resource.frameId);
        }
    }
    removeResource(resource) {
        this.resources.delete(resource);
        if (resource.frameId) {
            NetworkProject.removeFrameAttribution(this.#uiSourceCode, resource.frameId);
        }
    }
    dispose() {
        this.#project.removeFile(this.#uiSourceCode.url());
    }
    firstResource() {
        console.assert(this.resources.size > 0);
        return this.resources.values().next().value;
    }
    contentURL() {
        return this.firstResource().contentURL();
    }
    contentType() {
        return this.firstResource().contentType();
    }
    contentEncoded() {
        return this.firstResource().contentEncoded();
    }
    requestContent() {
        return this.firstResource().requestContent();
    }
    searchInContent(query, caseSensitive, isRegex) {
        return this.firstResource().searchInContent(query, caseSensitive, isRegex);
    }
}
//# sourceMappingURL=ResourceMapping.js.map