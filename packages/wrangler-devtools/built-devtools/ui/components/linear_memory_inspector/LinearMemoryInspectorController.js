// Copyright 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../../core/common/common.js';
import * as Host from '../../../core/host/host.js';
import * as i18n from '../../../core/i18n/i18n.js';
import * as SDK from '../../../core/sdk/sdk.js';
import * as UI from '../../legacy/legacy.js';
import { LinearMemoryInspectorPaneImpl } from './LinearMemoryInspectorPane.js';
import { getDefaultValueTypeMapping } from './ValueInterpreterDisplayUtils.js';
import * as Bindings from '../../../models/bindings/bindings.js';
const UIStrings = {
    /**
    *@description Error message that shows up in the console if a buffer to be opened in the linear memory inspector cannot be found.
    */
    couldNotOpenLinearMemory: 'Could not open linear memory inspector: failed locating buffer.',
};
const str_ = i18n.i18n.registerUIStrings('ui/components/linear_memory_inspector/LinearMemoryInspectorController.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
const LINEAR_MEMORY_INSPECTOR_OBJECT_GROUP = 'linear-memory-inspector';
const MEMORY_TRANSFER_MIN_CHUNK_SIZE = 1000;
export const ACCEPTED_MEMORY_TYPES = ['webassemblymemory', 'typedarray', 'dataview', 'arraybuffer'];
let controllerInstance;
export class RemoteArrayBufferWrapper {
    #remoteArrayBuffer;
    constructor(arrayBuffer) {
        this.#remoteArrayBuffer = arrayBuffer;
    }
    length() {
        return this.#remoteArrayBuffer.byteLength();
    }
    async getRange(start, end) {
        const newEnd = Math.min(end, this.length());
        if (start < 0 || start > newEnd) {
            console.error(`Requesting invalid range of memory: (${start}, ${end})`);
            return new Uint8Array(0);
        }
        const array = await this.#remoteArrayBuffer.bytes(start, newEnd);
        return new Uint8Array(array);
    }
}
async function getBufferFromObject(obj) {
    console.assert(obj.type === 'object');
    console.assert(obj.subtype !== undefined && ACCEPTED_MEMORY_TYPES.includes(obj.subtype));
    const response = await obj.runtimeModel().agent.invoke_callFunctionOn({
        objectId: obj.objectId,
        functionDeclaration: 'function() { return this instanceof ArrayBuffer || (typeof SharedArrayBuffer !== \'undefined\' && this instanceof SharedArrayBuffer) ? this : this.buffer; }',
        silent: true,
        // Set object group in order to bind the object lifetime to the linear memory inspector.
        objectGroup: LINEAR_MEMORY_INSPECTOR_OBJECT_GROUP,
    });
    const error = response.getError();
    if (error) {
        throw new Error(`Remote object representing ArrayBuffer could not be retrieved: ${error}`);
    }
    obj = obj.runtimeModel().createRemoteObject(response.result);
    return new SDK.RemoteObject.RemoteArrayBuffer(obj);
}
export function isDWARFMemoryObject(obj) {
    if (obj instanceof Bindings.DebuggerLanguagePlugins.ValueNode) {
        return obj.inspectableAddress !== undefined;
    }
    if (obj instanceof Bindings.DebuggerLanguagePlugins.ExtensionRemoteObject) {
        return obj.linearMemoryAddress !== undefined;
    }
    return false;
}
export function isMemoryObjectProperty(obj) {
    const isWasmOrBuffer = obj.type === 'object' && obj.subtype && ACCEPTED_MEMORY_TYPES.includes(obj.subtype);
    if (isWasmOrBuffer || isDWARFMemoryObject(obj)) {
        return true;
    }
    return false;
}
export class LinearMemoryInspectorController extends SDK.TargetManager.SDKModelObserver {
    #paneInstance = LinearMemoryInspectorPaneImpl.instance();
    #bufferIdToRemoteObject = new Map();
    #settings;
    constructor() {
        super();
        SDK.TargetManager.TargetManager.instance().observeModels(SDK.RuntimeModel.RuntimeModel, this);
        SDK.TargetManager.TargetManager.instance().addModelListener(SDK.DebuggerModel.DebuggerModel, SDK.DebuggerModel.Events.GlobalObjectCleared, this.#onGlobalObjectClear, this);
        this.#paneInstance.addEventListener("ViewClosed" /* ViewClosed */, this.#viewClosed.bind(this));
        SDK.TargetManager.TargetManager.instance().addModelListener(SDK.DebuggerModel.DebuggerModel, SDK.DebuggerModel.Events.DebuggerPaused, this.#onDebuggerPause, this);
        const defaultValueTypeModes = getDefaultValueTypeMapping();
        const defaultSettings = {
            valueTypes: Array.from(defaultValueTypeModes.keys()),
            valueTypeModes: Array.from(defaultValueTypeModes),
            endianness: "Little Endian" /* Little */,
        };
        this.#settings = Common.Settings.Settings.instance().createSetting('lmiInterpreterSettings', defaultSettings);
    }
    static instance() {
        if (controllerInstance) {
            return controllerInstance;
        }
        controllerInstance = new LinearMemoryInspectorController();
        return controllerInstance;
    }
    static async getMemoryForAddress(memoryWrapper, address) {
        // Provide a chunk of memory that covers the address to show and some before and after
        // as 1. the address shown is not necessarily at the beginning of a page and
        // 2. to allow for fewer memory requests.
        const memoryChunkStart = Math.max(0, address - MEMORY_TRANSFER_MIN_CHUNK_SIZE / 2);
        const memoryChunkEnd = memoryChunkStart + MEMORY_TRANSFER_MIN_CHUNK_SIZE;
        const memory = await memoryWrapper.getRange(memoryChunkStart, memoryChunkEnd);
        return { memory: memory, offset: memoryChunkStart };
    }
    static async getMemoryRange(memoryWrapper, start, end) {
        // Check that the requested start is within bounds.
        // If the requested end is larger than the actual
        // memory, it will be automatically capped when
        // requesting the range.
        if (start < 0 || start > end || start >= memoryWrapper.length()) {
            throw new Error('Requested range is out of bounds.');
        }
        const chunkEnd = Math.max(end, start + MEMORY_TRANSFER_MIN_CHUNK_SIZE);
        return await memoryWrapper.getRange(start, chunkEnd);
    }
    saveSettings(data) {
        const valueTypes = Array.from(data.valueTypes);
        const modes = [...data.modes];
        this.#settings.set({ valueTypes, valueTypeModes: modes, endianness: data.endianness });
    }
    loadSettings() {
        const settings = this.#settings.get();
        return {
            valueTypes: new Set(settings.valueTypes),
            modes: new Map(settings.valueTypeModes),
            endianness: settings.endianness,
        };
    }
    static async retrieveDWARFMemoryObjectAndAddress(obj) {
        if (obj instanceof Bindings.DebuggerLanguagePlugins.ExtensionRemoteObject) {
            const valueNode = obj;
            const address = valueNode.linearMemoryAddress || 0;
            const callFrame = valueNode.callFrame;
            const response = await obj.debuggerModel().agent.invoke_evaluateOnCallFrame({
                callFrameId: callFrame.id,
                expression: 'memories[0]',
            });
            const error = response.getError();
            if (error) {
                console.error(error);
                Common.Console.Console.instance().error(i18nString(UIStrings.couldNotOpenLinearMemory));
            }
            const runtimeModel = obj.debuggerModel().runtimeModel();
            return { obj: runtimeModel.createRemoteObject(response.result), address };
        }
        if (!(obj instanceof Bindings.DebuggerLanguagePlugins.ValueNode)) {
            return;
        }
        const valueNode = obj;
        const address = valueNode.inspectableAddress || 0;
        const callFrame = valueNode.callFrame;
        const response = await obj.debuggerModel().agent.invoke_evaluateOnCallFrame({
            callFrameId: callFrame.id,
            expression: 'memories[0]',
        });
        const error = response.getError();
        if (error) {
            console.error(error);
            Common.Console.Console.instance().error(i18nString(UIStrings.couldNotOpenLinearMemory));
        }
        const runtimeModel = obj.debuggerModel().runtimeModel();
        obj = runtimeModel.createRemoteObject(response.result);
        return { obj, address };
    }
    async openInspectorView(obj, address) {
        const response = await LinearMemoryInspectorController.retrieveDWARFMemoryObjectAndAddress(obj);
        let memoryObj = obj;
        let memoryAddress = address;
        if (response !== undefined) {
            memoryAddress = response.address;
            memoryObj = response.obj;
        }
        const highlightInfo = this.#extractHighlightInfo(obj, memoryAddress);
        if (memoryAddress !== undefined) {
            Host.userMetrics.linearMemoryInspectorTarget(Host.UserMetrics.LinearMemoryInspectorTarget.DWARFInspectableAddress);
        }
        else if (memoryObj.subtype === "arraybuffer" /* Arraybuffer */) {
            Host.userMetrics.linearMemoryInspectorTarget(Host.UserMetrics.LinearMemoryInspectorTarget.ArrayBuffer);
        }
        else if (memoryObj.subtype === "dataview" /* Dataview */) {
            Host.userMetrics.linearMemoryInspectorTarget(Host.UserMetrics.LinearMemoryInspectorTarget.DataView);
        }
        else if (memoryObj.subtype === "typedarray" /* Typedarray */) {
            Host.userMetrics.linearMemoryInspectorTarget(Host.UserMetrics.LinearMemoryInspectorTarget.TypedArray);
        }
        else {
            console.assert(memoryObj.subtype === "webassemblymemory" /* Webassemblymemory */);
            Host.userMetrics.linearMemoryInspectorTarget(Host.UserMetrics.LinearMemoryInspectorTarget.WebAssemblyMemory);
        }
        const buffer = await getBufferFromObject(memoryObj);
        const { internalProperties } = await buffer.object().getOwnProperties(false);
        const idProperty = internalProperties?.find(({ name }) => name === '[[ArrayBufferData]]');
        const id = idProperty?.value?.value;
        if (!id) {
            throw new Error('Unable to find backing store id for array buffer');
        }
        const memoryProperty = internalProperties?.find(({ name }) => name === '[[WebAssemblyMemory]]');
        const memory = memoryProperty?.value;
        if (this.#bufferIdToRemoteObject.has(id)) {
            this.#paneInstance.reveal(id, memoryAddress, highlightInfo);
            void UI.ViewManager.ViewManager.instance().showView('linear-memory-inspector');
            return;
        }
        const title = String(memory ? memory.description : buffer.object().description);
        this.#bufferIdToRemoteObject.set(id, buffer.object());
        const arrayBufferWrapper = new RemoteArrayBufferWrapper(buffer);
        this.#paneInstance.create(id, title, arrayBufferWrapper, memoryAddress, highlightInfo);
        void UI.ViewManager.ViewManager.instance().showView('linear-memory-inspector');
    }
    #extractHighlightInfo(obj, memoryAddress) {
        let highlightInfo;
        if (obj instanceof Bindings.DebuggerLanguagePlugins.ValueNode) {
            // Currently, only the StaticallyTypedValueNode subclass implements the sourceType getter.
            // The other subclasses throw a 'Not Implemented' Error.
            try {
                highlightInfo = {
                    startAddress: memoryAddress || 0,
                    size: obj.sourceType.typeInfo.size,
                };
            }
            catch (unusedError) {
            }
        }
        return highlightInfo;
    }
    modelRemoved(model) {
        for (const [bufferId, remoteObject] of this.#bufferIdToRemoteObject) {
            if (model === remoteObject.runtimeModel()) {
                this.#bufferIdToRemoteObject.delete(bufferId);
                this.#paneInstance.close(bufferId);
            }
        }
    }
    #onDebuggerPause(event) {
        const debuggerModel = event.data;
        for (const [bufferId, remoteObject] of this.#bufferIdToRemoteObject) {
            if (debuggerModel.runtimeModel() === remoteObject.runtimeModel()) {
                this.#paneInstance.resetHighlightInfo(bufferId);
                this.#paneInstance.refreshView(bufferId);
            }
        }
    }
    #onGlobalObjectClear(event) {
        this.modelRemoved(event.data.runtimeModel());
    }
    #viewClosed({ data: bufferId }) {
        const remoteObj = this.#bufferIdToRemoteObject.get(bufferId);
        if (remoteObj) {
            remoteObj.release();
        }
        this.#bufferIdToRemoteObject.delete(bufferId);
    }
}
//# sourceMappingURL=LinearMemoryInspectorController.js.map