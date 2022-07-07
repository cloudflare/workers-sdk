// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../common/common.js';
import * as Host from '../host/host.js';
import * as Platform from '../platform/platform.js';
import * as ProtocolClient from '../protocol_client/protocol_client.js';
import { SDKModel } from './SDKModel.js';
export class Target extends ProtocolClient.InspectorBackend.TargetBase {
    #targetManagerInternal;
    #nameInternal;
    #inspectedURLInternal;
    #inspectedURLName;
    #capabilitiesMask;
    #typeInternal;
    #parentTargetInternal;
    #idInternal;
    #modelByConstructor;
    #isSuspended;
    #targetInfoInternal;
    #creatingModels;
    constructor(targetManager, id, name, type, parentTarget, sessionId, suspended, connection, targetInfo) {
        const needsNodeJSPatching = type === Type.Node;
        super(needsNodeJSPatching, parentTarget, sessionId, connection);
        this.#targetManagerInternal = targetManager;
        this.#nameInternal = name;
        this.#inspectedURLInternal = Platform.DevToolsPath.EmptyUrlString;
        this.#inspectedURLName = '';
        this.#capabilitiesMask = 0;
        switch (type) {
            case Type.Frame:
                this.#capabilitiesMask = Capability.Browser | Capability.Storage | Capability.DOM | Capability.JS |
                    Capability.Log | Capability.Network | Capability.Target | Capability.Tracing | Capability.Emulation |
                    Capability.Input | Capability.Inspector | Capability.Audits | Capability.WebAuthn | Capability.IO |
                    Capability.Media;
                if (!parentTarget) {
                    // This matches backend exposing certain capabilities only for the main frame.
                    this.#capabilitiesMask |=
                        Capability.DeviceEmulation | Capability.ScreenCapture | Capability.Security | Capability.ServiceWorker;
                    // TODO(dgozman): we report service workers for the whole frame tree on the main frame,
                    // while we should be able to only cover the subtree corresponding to the target.
                }
                break;
            case Type.ServiceWorker:
                this.#capabilitiesMask = Capability.JS | Capability.Log | Capability.Network | Capability.Target |
                    Capability.Inspector | Capability.IO;
                if (!parentTarget) {
                    this.#capabilitiesMask |= Capability.Browser;
                }
                break;
            case Type.SharedWorker:
                this.#capabilitiesMask = Capability.JS | Capability.Log | Capability.Network | Capability.Target |
                    Capability.IO | Capability.Media | Capability.Inspector;
                break;
            case Type.Worker:
                this.#capabilitiesMask = Capability.JS | Capability.Log | Capability.Network | Capability.Target |
                    Capability.IO | Capability.Media | Capability.Emulation;
                break;
            case Type.Node:
                this.#capabilitiesMask = Capability.JS;
                break;
            case Type.AuctionWorklet:
                this.#capabilitiesMask = Capability.JS | Capability.EventBreakpoints;
                break;
            case Type.Browser:
                this.#capabilitiesMask = Capability.Target | Capability.IO;
                break;
        }
        this.#typeInternal = type;
        this.#parentTargetInternal = parentTarget;
        this.#idInternal = id;
        /* } */
        this.#modelByConstructor = new Map();
        this.#isSuspended = suspended;
        this.#targetInfoInternal = targetInfo;
    }
    createModels(required) {
        this.#creatingModels = true;
        const registeredModels = Array.from(SDKModel.registeredModels.entries());
        // Create early models.
        for (const [modelClass, info] of registeredModels) {
            if (info.early) {
                this.model(modelClass);
            }
        }
        // Create autostart and required models.
        for (const [modelClass, info] of registeredModels) {
            if (info.autostart || required.has(modelClass)) {
                this.model(modelClass);
            }
        }
        this.#creatingModels = false;
    }
    id() {
        return this.#idInternal;
    }
    name() {
        return this.#nameInternal || this.#inspectedURLName;
    }
    type() {
        return this.#typeInternal;
    }
    markAsNodeJSForTest() {
        super.markAsNodeJSForTest();
        this.#typeInternal = Type.Node;
    }
    targetManager() {
        return this.#targetManagerInternal;
    }
    hasAllCapabilities(capabilitiesMask) {
        // TODO(dgozman): get rid of this method, once we never observe targets with
        // capability mask.
        return (this.#capabilitiesMask & capabilitiesMask) === capabilitiesMask;
    }
    decorateLabel(label) {
        return (this.#typeInternal === Type.Worker || this.#typeInternal === Type.ServiceWorker) ? '\u2699 ' + label :
            label;
    }
    parentTarget() {
        return this.#parentTargetInternal;
    }
    dispose(reason) {
        super.dispose(reason);
        this.#targetManagerInternal.removeTarget(this);
        for (const model of this.#modelByConstructor.values()) {
            model.dispose();
        }
    }
    model(modelClass) {
        if (!this.#modelByConstructor.get(modelClass)) {
            const info = SDKModel.registeredModels.get(modelClass);
            if (info === undefined) {
                throw 'Model class is not registered @' + new Error().stack;
            }
            if ((this.#capabilitiesMask & info.capabilities) === info.capabilities) {
                const model = new modelClass(this);
                this.#modelByConstructor.set(modelClass, model);
                if (!this.#creatingModels) {
                    this.#targetManagerInternal.modelAdded(this, modelClass, model);
                }
            }
        }
        return this.#modelByConstructor.get(modelClass) || null;
    }
    models() {
        return this.#modelByConstructor;
    }
    inspectedURL() {
        return this.#inspectedURLInternal;
    }
    setInspectedURL(inspectedURL) {
        this.#inspectedURLInternal = inspectedURL;
        const parsedURL = Common.ParsedURL.ParsedURL.fromString(inspectedURL);
        this.#inspectedURLName = parsedURL ? parsedURL.lastPathComponentWithFragment() : '#' + this.#idInternal;
        if (!this.parentTarget()) {
            Host.InspectorFrontendHost.InspectorFrontendHostInstance.inspectedURLChanged(inspectedURL || Platform.DevToolsPath.EmptyUrlString);
        }
        this.#targetManagerInternal.onInspectedURLChange(this);
        if (!this.#nameInternal) {
            this.#targetManagerInternal.onNameChange(this);
        }
    }
    async suspend(reason) {
        if (this.#isSuspended) {
            return;
        }
        this.#isSuspended = true;
        await Promise.all(Array.from(this.models().values(), m => m.preSuspendModel(reason)));
        await Promise.all(Array.from(this.models().values(), m => m.suspendModel(reason)));
    }
    async resume() {
        if (!this.#isSuspended) {
            return;
        }
        this.#isSuspended = false;
        await Promise.all(Array.from(this.models().values(), m => m.resumeModel()));
        await Promise.all(Array.from(this.models().values(), m => m.postResumeModel()));
    }
    suspended() {
        return this.#isSuspended;
    }
    updateTargetInfo(targetInfo) {
        this.#targetInfoInternal = targetInfo;
    }
    targetInfo() {
        return this.#targetInfoInternal;
    }
}
// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum
export var Type;
(function (Type) {
    Type["Frame"] = "frame";
    Type["ServiceWorker"] = "service-worker";
    Type["Worker"] = "worker";
    Type["SharedWorker"] = "shared-worker";
    Type["Node"] = "node";
    Type["Browser"] = "browser";
    Type["AuctionWorklet"] = "auction-worklet";
})(Type || (Type = {}));
// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum
export var Capability;
(function (Capability) {
    Capability[Capability["Browser"] = 1] = "Browser";
    Capability[Capability["DOM"] = 2] = "DOM";
    Capability[Capability["JS"] = 4] = "JS";
    Capability[Capability["Log"] = 8] = "Log";
    Capability[Capability["Network"] = 16] = "Network";
    Capability[Capability["Target"] = 32] = "Target";
    Capability[Capability["ScreenCapture"] = 64] = "ScreenCapture";
    Capability[Capability["Tracing"] = 128] = "Tracing";
    Capability[Capability["Emulation"] = 256] = "Emulation";
    Capability[Capability["Security"] = 512] = "Security";
    Capability[Capability["Input"] = 1024] = "Input";
    Capability[Capability["Inspector"] = 2048] = "Inspector";
    Capability[Capability["DeviceEmulation"] = 4096] = "DeviceEmulation";
    Capability[Capability["Storage"] = 8192] = "Storage";
    Capability[Capability["ServiceWorker"] = 16384] = "ServiceWorker";
    Capability[Capability["Audits"] = 32768] = "Audits";
    Capability[Capability["WebAuthn"] = 65536] = "WebAuthn";
    Capability[Capability["IO"] = 131072] = "IO";
    Capability[Capability["Media"] = 262144] = "Media";
    Capability[Capability["EventBreakpoints"] = 524288] = "EventBreakpoints";
    Capability[Capability["None"] = 0] = "None";
})(Capability || (Capability = {}));
//# sourceMappingURL=Target.js.map