// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as Bindings from '../bindings/bindings.js';
import * as TextUtils from '../text_utils/text_utils.js';
import * as Workspace from '../workspace/workspace.js';
import { format } from './ScriptFormatter.js';
const objectToFormattingResult = new WeakMap();
export class SourceFormatData {
    originalSourceCode;
    formattedSourceCode;
    mapping;
    constructor(originalSourceCode, formattedSourceCode, mapping) {
        this.originalSourceCode = originalSourceCode;
        this.formattedSourceCode = formattedSourceCode;
        this.mapping = mapping;
    }
    originalPath() {
        return this.originalSourceCode.project().id() + ':' + this.originalSourceCode.url();
    }
    static for(object) {
        return objectToFormattingResult.get(object) || null;
    }
}
let sourceFormatterInstance = null;
export class SourceFormatter {
    projectId;
    project;
    formattedSourceCodes;
    scriptMapping;
    styleMapping;
    constructor() {
        this.projectId = 'formatter:';
        this.project = new Bindings.ContentProviderBasedProject.ContentProviderBasedProject(Workspace.Workspace.WorkspaceImpl.instance(), this.projectId, Workspace.Workspace.projectTypes.Formatter, 'formatter', true /* isServiceProject */);
        this.formattedSourceCodes = new Map();
        this.scriptMapping = new ScriptMapping();
        this.styleMapping = new StyleMapping();
        Workspace.Workspace.WorkspaceImpl.instance().addEventListener(Workspace.Workspace.Events.UISourceCodeRemoved, event => {
            void this.onUISourceCodeRemoved(event);
        }, this);
    }
    static instance({ forceNew = false } = {}) {
        if (!sourceFormatterInstance || forceNew) {
            sourceFormatterInstance = new SourceFormatter();
        }
        return sourceFormatterInstance;
    }
    async onUISourceCodeRemoved(event) {
        const uiSourceCode = event.data;
        const cacheEntry = this.formattedSourceCodes.get(uiSourceCode);
        if (cacheEntry && cacheEntry.formatData) {
            await this.discardFormatData(cacheEntry.formatData);
        }
        this.formattedSourceCodes.delete(uiSourceCode);
    }
    async discardFormattedUISourceCode(formattedUISourceCode) {
        const formatData = SourceFormatData.for(formattedUISourceCode);
        if (!formatData) {
            return null;
        }
        await this.discardFormatData(formatData);
        this.formattedSourceCodes.delete(formatData.originalSourceCode);
        return formatData.originalSourceCode;
    }
    async discardFormatData(formatData) {
        objectToFormattingResult.delete(formatData.formattedSourceCode);
        await this.scriptMapping.setSourceMappingEnabled(formatData, false);
        void this.styleMapping.setSourceMappingEnabled(formatData, false);
        this.project.removeFile(formatData.formattedSourceCode.url());
    }
    hasFormatted(uiSourceCode) {
        return this.formattedSourceCodes.has(uiSourceCode);
    }
    getOriginalUISourceCode(uiSourceCode) {
        const formatData = objectToFormattingResult.get(uiSourceCode);
        if (!formatData) {
            return uiSourceCode;
        }
        return formatData.originalSourceCode;
    }
    async format(uiSourceCode) {
        const cacheEntry = this.formattedSourceCodes.get(uiSourceCode);
        if (cacheEntry) {
            return cacheEntry.promise;
        }
        const resultPromise = new Promise(async (resolve, reject) => {
            const { content } = await uiSourceCode.requestContent();
            try {
                const { formattedContent, formattedMapping } = await format(uiSourceCode.contentType(), uiSourceCode.mimeType(), content || '');
                const cacheEntry = this.formattedSourceCodes.get(uiSourceCode);
                if (!cacheEntry || cacheEntry.promise !== resultPromise) {
                    return;
                }
                let formattedURL;
                let count = 0;
                let suffix = '';
                do {
                    formattedURL = Common.ParsedURL.ParsedURL.concatenate(uiSourceCode.url(), ':formatted', suffix);
                    suffix = `:${count++}`;
                } while (this.project.uiSourceCodeForURL(formattedURL));
                const contentProvider = TextUtils.StaticContentProvider.StaticContentProvider.fromString(formattedURL, uiSourceCode.contentType(), formattedContent);
                const formattedUISourceCode = this.project.createUISourceCode(formattedURL, contentProvider.contentType());
                const formatData = new SourceFormatData(uiSourceCode, formattedUISourceCode, formattedMapping);
                objectToFormattingResult.set(formattedUISourceCode, formatData);
                this.project.addUISourceCodeWithProvider(formattedUISourceCode, contentProvider, /* metadata */ null, uiSourceCode.mimeType());
                await this.scriptMapping.setSourceMappingEnabled(formatData, true);
                await this.styleMapping.setSourceMappingEnabled(formatData, true);
                cacheEntry.formatData = formatData;
                resolve(formatData);
            }
            catch (e) {
                reject(e);
            }
        });
        this.formattedSourceCodes.set(uiSourceCode, { promise: resultPromise, formatData: null });
        return resultPromise;
    }
}
class ScriptMapping {
    constructor() {
        Bindings.DebuggerWorkspaceBinding.DebuggerWorkspaceBinding.instance().addSourceMapping(this);
    }
    rawLocationToUILocation(rawLocation) {
        const script = rawLocation.script();
        const formatData = script && SourceFormatData.for(script);
        if (!formatData || !script) {
            return null;
        }
        const [lineNumber, columnNumber] = formatData.mapping.originalToFormatted(rawLocation.lineNumber, rawLocation.columnNumber || 0);
        return formatData.formattedSourceCode.uiLocation(lineNumber, columnNumber);
    }
    uiLocationToRawLocations(uiSourceCode, lineNumber, columnNumber) {
        const formatData = SourceFormatData.for(uiSourceCode);
        if (!formatData) {
            return [];
        }
        const [originalLine, originalColumn] = formatData.mapping.formattedToOriginal(lineNumber, columnNumber);
        if (formatData.originalSourceCode.contentType().isScript()) {
            // Here we have a script that is displayed on its own (i.e. it has a dedicated uiSourceCode). This means it is
            // either a stand-alone script or an inline script with a #sourceURL= and in both cases we can just forward the
            // question to the original (unformatted) source code.
            const rawLocations = Bindings.DebuggerWorkspaceBinding.DebuggerWorkspaceBinding.instance()
                .uiLocationToRawLocationsForUnformattedJavaScript(formatData.originalSourceCode, originalLine, originalColumn);
            console.assert(rawLocations.every(l => l && Boolean(l.script())));
            return rawLocations;
        }
        if (formatData.originalSourceCode.contentType() === Common.ResourceType.resourceTypes.Document) {
            const target = Bindings.NetworkProject.NetworkProject.targetForUISourceCode(formatData.originalSourceCode);
            const debuggerModel = target && target.model(SDK.DebuggerModel.DebuggerModel);
            if (debuggerModel) {
                const scripts = debuggerModel.scriptsForSourceURL(formatData.originalSourceCode.url())
                    .filter(script => script.isInlineScript() && !script.hasSourceURL);
                // Here we have an inline script, which was formatted together with the containing document, so we must not
                // translate locations as they are relative to the start of the document.
                const locations = scripts.map(script => script.rawLocation(originalLine, originalColumn)).filter(l => Boolean(l));
                console.assert(locations.every(l => l && Boolean(l.script())));
                return locations;
            }
        }
        return [];
    }
    async setSourceMappingEnabled(formatData, enabled) {
        const scripts = this.scriptsForUISourceCode(formatData.originalSourceCode);
        if (!scripts.length) {
            return;
        }
        if (enabled) {
            for (const script of scripts) {
                objectToFormattingResult.set(script, formatData);
            }
        }
        else {
            for (const script of scripts) {
                objectToFormattingResult.delete(script);
            }
        }
        const updatePromises = scripts.map(script => Bindings.DebuggerWorkspaceBinding.DebuggerWorkspaceBinding.instance().updateLocations(script));
        await Promise.all(updatePromises);
    }
    scriptsForUISourceCode(uiSourceCode) {
        if (uiSourceCode.contentType() === Common.ResourceType.resourceTypes.Document) {
            const target = Bindings.NetworkProject.NetworkProject.targetForUISourceCode(uiSourceCode);
            const debuggerModel = target && target.model(SDK.DebuggerModel.DebuggerModel);
            if (debuggerModel) {
                const scripts = debuggerModel.scriptsForSourceURL(uiSourceCode.url())
                    .filter(script => script.isInlineScript() && !script.hasSourceURL);
                return scripts;
            }
        }
        if (uiSourceCode.contentType().isScript()) {
            console.assert(!objectToFormattingResult.has(uiSourceCode));
            const rawLocations = Bindings.DebuggerWorkspaceBinding.DebuggerWorkspaceBinding.instance()
                .uiLocationToRawLocationsForUnformattedJavaScript(uiSourceCode, 0, 0);
            return rawLocations.map(location => location.script()).filter(script => Boolean(script));
        }
        return [];
    }
}
const sourceCodeToHeaders = new WeakMap();
class StyleMapping {
    headersSymbol;
    constructor() {
        Bindings.CSSWorkspaceBinding.CSSWorkspaceBinding.instance().addSourceMapping(this);
        this.headersSymbol = Symbol('Formatter.SourceFormatter.StyleMapping._headersSymbol');
    }
    rawLocationToUILocation(rawLocation) {
        const styleHeader = rawLocation.header();
        const formatData = styleHeader && SourceFormatData.for(styleHeader);
        if (!formatData) {
            return null;
        }
        const formattedLocation = formatData.mapping.originalToFormatted(rawLocation.lineNumber, rawLocation.columnNumber || 0);
        return formatData.formattedSourceCode.uiLocation(formattedLocation[0], formattedLocation[1]);
    }
    uiLocationToRawLocations(uiLocation) {
        const formatData = SourceFormatData.for(uiLocation.uiSourceCode);
        if (!formatData) {
            return [];
        }
        const [originalLine, originalColumn] = formatData.mapping.formattedToOriginal(uiLocation.lineNumber, uiLocation.columnNumber);
        const allHeaders = sourceCodeToHeaders.get(formatData.originalSourceCode);
        if (!allHeaders) {
            return [];
        }
        const headers = allHeaders.filter(header => header.containsLocation(originalLine, originalColumn));
        return headers.map(header => new SDK.CSSModel.CSSLocation(header, originalLine, originalColumn));
    }
    async setSourceMappingEnabled(formatData, enable) {
        const original = formatData.originalSourceCode;
        const headers = this.headersForUISourceCode(original);
        if (enable) {
            sourceCodeToHeaders.set(original, headers);
            headers.forEach(header => {
                objectToFormattingResult.set(header, formatData);
            });
        }
        else {
            sourceCodeToHeaders.delete(original);
            headers.forEach(header => {
                objectToFormattingResult.delete(header);
            });
        }
        const updatePromises = headers.map(header => Bindings.CSSWorkspaceBinding.CSSWorkspaceBinding.instance().updateLocations(header));
        await Promise.all(updatePromises);
    }
    headersForUISourceCode(uiSourceCode) {
        if (uiSourceCode.contentType() === Common.ResourceType.resourceTypes.Document) {
            const target = Bindings.NetworkProject.NetworkProject.targetForUISourceCode(uiSourceCode);
            const cssModel = target && target.model(SDK.CSSModel.CSSModel);
            if (cssModel) {
                return cssModel.headersForSourceURL(uiSourceCode.url())
                    .filter(header => header.isInline && !header.hasSourceURL);
            }
        }
        else if (uiSourceCode.contentType().isStyleSheet()) {
            const rawLocations = Bindings.CSSWorkspaceBinding.CSSWorkspaceBinding.instance().uiLocationToRawLocations(uiSourceCode.uiLocation(0, 0));
            return rawLocations.map(rawLocation => rawLocation.header()).filter(header => Boolean(header));
        }
        return [];
    }
}
//# sourceMappingURL=SourceFormatter.js.map