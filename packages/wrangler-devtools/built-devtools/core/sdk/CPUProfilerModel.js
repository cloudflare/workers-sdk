/*
 * Copyright (C) 2014 Google Inc. All rights reserved.
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
import * as i18n from '../i18n/i18n.js';
import { DebuggerModel, Location } from './DebuggerModel.js';
import { Capability } from './Target.js';
import { SDKModel } from './SDKModel.js';
const UIStrings = {
    /**
    *@description Name of a profile. Placeholder is either a user-supplied name or a number automatically assigned to the profile.
    *@example {2} PH1
    */
    profileD: 'Profile {PH1}',
};
const str_ = i18n.i18n.registerUIStrings('core/sdk/CPUProfilerModel.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class CPUProfilerModel extends SDKModel {
    #isRecording;
    #nextAnonymousConsoleProfileNumber;
    #anonymousConsoleProfileIdToTitle;
    #profilerAgent;
    #preciseCoverageDeltaUpdateCallback;
    #debuggerModelInternal;
    registeredConsoleProfileMessages = [];
    constructor(target) {
        super(target);
        this.#isRecording = false;
        this.#nextAnonymousConsoleProfileNumber = 1;
        this.#anonymousConsoleProfileIdToTitle = new Map();
        this.#profilerAgent = target.profilerAgent();
        this.#preciseCoverageDeltaUpdateCallback = null;
        target.registerProfilerDispatcher(this);
        void this.#profilerAgent.invoke_enable();
        this.#debuggerModelInternal = target.model(DebuggerModel);
    }
    runtimeModel() {
        return this.#debuggerModelInternal.runtimeModel();
    }
    debuggerModel() {
        return this.#debuggerModelInternal;
    }
    consoleProfileStarted({ id, location, title }) {
        if (!title) {
            title = i18nString(UIStrings.profileD, { PH1: this.#nextAnonymousConsoleProfileNumber++ });
            this.#anonymousConsoleProfileIdToTitle.set(id, title);
        }
        const eventData = this.createEventDataFrom(id, location, title);
        this.dispatchEventToListeners(Events.ConsoleProfileStarted, eventData);
    }
    consoleProfileFinished({ id, location, profile, title }) {
        if (!title) {
            title = this.#anonymousConsoleProfileIdToTitle.get(id);
            this.#anonymousConsoleProfileIdToTitle.delete(id);
        }
        const eventData = {
            ...this.createEventDataFrom(id, location, title),
            cpuProfile: profile,
        };
        this.registeredConsoleProfileMessages.push(eventData);
        this.dispatchEventToListeners(Events.ConsoleProfileFinished, eventData);
    }
    createEventDataFrom(id, scriptLocation, title) {
        const debuggerLocation = Location.fromPayload(this.#debuggerModelInternal, scriptLocation);
        const globalId = this.target().id() + '.' + id;
        return {
            id: globalId,
            scriptLocation: debuggerLocation,
            title: title || '',
            cpuProfilerModel: this,
        };
    }
    isRecordingProfile() {
        return this.#isRecording;
    }
    startRecording() {
        this.#isRecording = true;
        const intervalUs = 100;
        void this.#profilerAgent.invoke_setSamplingInterval({ interval: intervalUs });
        return this.#profilerAgent.invoke_start();
    }
    stopRecording() {
        this.#isRecording = false;
        return this.#profilerAgent.invoke_stop().then(response => response.profile || null);
    }
    startPreciseCoverage(jsCoveragePerBlock, preciseCoverageDeltaUpdateCallback) {
        const callCount = false;
        this.#preciseCoverageDeltaUpdateCallback = preciseCoverageDeltaUpdateCallback;
        const allowUpdatesTriggeredByBackend = true;
        return this.#profilerAgent.invoke_startPreciseCoverage({ callCount, detailed: jsCoveragePerBlock, allowTriggeredUpdates: allowUpdatesTriggeredByBackend });
    }
    async takePreciseCoverage() {
        const r = await this.#profilerAgent.invoke_takePreciseCoverage();
        const timestamp = (r && r.timestamp) || 0;
        const coverage = (r && r.result) || [];
        return { timestamp, coverage };
    }
    stopPreciseCoverage() {
        this.#preciseCoverageDeltaUpdateCallback = null;
        return this.#profilerAgent.invoke_stopPreciseCoverage();
    }
    preciseCoverageDeltaUpdate({ timestamp, occasion, result }) {
        if (this.#preciseCoverageDeltaUpdateCallback) {
            this.#preciseCoverageDeltaUpdateCallback(timestamp, occasion, result);
        }
    }
}
// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum
export var Events;
(function (Events) {
    Events["ConsoleProfileStarted"] = "ConsoleProfileStarted";
    Events["ConsoleProfileFinished"] = "ConsoleProfileFinished";
})(Events || (Events = {}));
SDKModel.register(CPUProfilerModel, { capabilities: Capability.JS, autostart: true });
//# sourceMappingURL=CPUProfilerModel.js.map