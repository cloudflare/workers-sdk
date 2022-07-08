// Copyright 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as Host from '../../core/host/host.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as Bindings from '../../models/bindings/bindings.js';
import * as TextUtils from '../../models/text_utils/text_utils.js';
import * as TimelineModel from '../../models/timeline_model/timeline_model.js';
const UIStrings = {
    /**
    *@description Text in Timeline Loader of the Performance panel
    */
    malformedTimelineDataUnknownJson: 'Malformed timeline data: Unknown JSON format',
    /**
    *@description Text in Timeline Loader of the Performance panel
    */
    malformedTimelineInputWrongJson: 'Malformed timeline input, wrong JSON brackets balance',
    /**
    *@description Text in Timeline Loader of the Performance panel
    *@example {Unknown JSON format} PH1
    */
    malformedTimelineDataS: 'Malformed timeline data: {PH1}',
    /**
    *@description Text in Timeline Loader of the Performance panel
    */
    legacyTimelineFormatIsNot: 'Legacy Timeline format is not supported.',
    /**
    *@description Text in Timeline Loader of the Performance panel
    */
    malformedCpuProfileFormat: 'Malformed CPU profile format',
};
const str_ = i18n.i18n.registerUIStrings('panels/timeline/TimelineLoader.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class TimelineLoader {
    client;
    backingStorage;
    tracingModel;
    canceledCallback;
    state;
    buffer;
    firstRawChunk;
    firstChunk;
    loadedBytes;
    totalSize;
    jsonTokenizer;
    constructor(client) {
        this.client = client;
        this.backingStorage = new Bindings.TempFile.TempFileBackingStorage();
        this.tracingModel = new SDK.TracingModel.TracingModel(this.backingStorage);
        this.canceledCallback = null;
        this.state = State.Initial;
        this.buffer = '';
        this.firstRawChunk = true;
        this.firstChunk = true;
        this.loadedBytes = 0;
        this.jsonTokenizer = new TextUtils.TextUtils.BalancedJSONTokenizer(this.writeBalancedJSON.bind(this), true);
    }
    static loadFromFile(file, client) {
        const loader = new TimelineLoader(client);
        const fileReader = new Bindings.FileUtils.ChunkedFileReader(file, TransferChunkLengthBytes);
        loader.canceledCallback = fileReader.cancel.bind(fileReader);
        loader.totalSize = file.size;
        void fileReader.read(loader).then(success => {
            if (!success && fileReader.error()) {
                // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                loader.reportErrorAndCancelLoading(fileReader.error().message);
            }
        });
        return loader;
    }
    static loadFromEvents(events, client) {
        const loader = new TimelineLoader(client);
        window.setTimeout(async () => {
            const eventsPerChunk = 5000;
            client.loadingStarted();
            for (let i = 0; i < events.length; i += eventsPerChunk) {
                const chunk = events.slice(i, i + eventsPerChunk);
                loader.tracingModel.addEvents(chunk);
                client.loadingProgress((i + chunk.length) / events.length);
                await new Promise(r => window.setTimeout(r)); // Yield event loop to paint.
            }
            void loader.close();
        });
        return loader;
    }
    static loadFromURL(url, client) {
        const loader = new TimelineLoader(client);
        Host.ResourceLoader.loadAsStream(url, null, loader);
        return loader;
    }
    cancel() {
        this.tracingModel = null;
        this.backingStorage.reset();
        if (this.client) {
            this.client.loadingComplete(null);
            this.client = null;
        }
        if (this.canceledCallback) {
            this.canceledCallback();
        }
    }
    async write(chunk) {
        if (!this.client) {
            return Promise.resolve();
        }
        this.loadedBytes += chunk.length;
        if (this.firstRawChunk) {
            await this.client.loadingStarted();
            // Ensure we paint the loading dialog before continuing
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        }
        else {
            let progress = undefined;
            if (this.totalSize) {
                progress = this.loadedBytes / this.totalSize;
                // For compressed traces, we can't provide a definite progress percentage. So, just keep it moving.
                progress = progress > 1 ? progress - Math.floor(progress) : progress;
            }
            await this.client.loadingProgress(progress);
        }
        this.firstRawChunk = false;
        if (this.state === State.Initial) {
            if (chunk.startsWith('{"nodes":[')) {
                this.state = State.LoadingCPUProfileFormat;
            }
            else if (chunk[0] === '{') {
                this.state = State.LookingForEvents;
            }
            else if (chunk[0] === '[') {
                this.state = State.ReadingEvents;
            }
            else {
                this.reportErrorAndCancelLoading(i18nString(UIStrings.malformedTimelineDataUnknownJson));
                return Promise.resolve();
            }
        }
        if (this.state === State.LoadingCPUProfileFormat) {
            this.buffer += chunk;
            return Promise.resolve();
        }
        if (this.state === State.LookingForEvents) {
            const objectName = '"traceEvents":';
            const startPos = this.buffer.length - objectName.length;
            this.buffer += chunk;
            const pos = this.buffer.indexOf(objectName, startPos);
            if (pos === -1) {
                return Promise.resolve();
            }
            chunk = this.buffer.slice(pos + objectName.length);
            this.state = State.ReadingEvents;
        }
        if (this.state !== State.ReadingEvents) {
            return Promise.resolve();
        }
        if (this.jsonTokenizer.write(chunk)) {
            return Promise.resolve();
        }
        this.state = State.SkippingTail;
        if (this.firstChunk) {
            this.reportErrorAndCancelLoading(i18nString(UIStrings.malformedTimelineInputWrongJson));
        }
        return Promise.resolve();
    }
    writeBalancedJSON(data) {
        let json = data + ']';
        if (!this.firstChunk) {
            const commaIndex = json.indexOf(',');
            if (commaIndex !== -1) {
                json = json.slice(commaIndex + 1);
            }
            json = '[' + json;
        }
        let items;
        try {
            items = JSON.parse(json);
        }
        catch (e) {
            this.reportErrorAndCancelLoading(i18nString(UIStrings.malformedTimelineDataS, { PH1: e.toString() }));
            return;
        }
        if (this.firstChunk) {
            this.firstChunk = false;
            if (this.looksLikeAppVersion(items[0])) {
                this.reportErrorAndCancelLoading(i18nString(UIStrings.legacyTimelineFormatIsNot));
                return;
            }
        }
        try {
            this.tracingModel.addEvents(items);
        }
        catch (e) {
            this.reportErrorAndCancelLoading(i18nString(UIStrings.malformedTimelineDataS, { PH1: e.toString() }));
        }
    }
    reportErrorAndCancelLoading(message) {
        if (message) {
            Common.Console.Console.instance().error(message);
        }
        this.cancel();
    }
    // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    looksLikeAppVersion(item) {
        return typeof item === 'string' && item.indexOf('Chrome') !== -1;
    }
    async close() {
        if (!this.client) {
            return;
        }
        this.client.processingStarted();
        window.setTimeout(() => this.finalizeTrace(), 0);
    }
    finalizeTrace() {
        if (this.state === State.LoadingCPUProfileFormat) {
            this.parseCPUProfileFormat(this.buffer);
            this.buffer = '';
        }
        this.tracingModel.tracingComplete();
        this.client.loadingComplete(this.tracingModel);
    }
    parseCPUProfileFormat(text) {
        let traceEvents;
        try {
            const profile = JSON.parse(text);
            traceEvents = TimelineModel.TimelineJSProfile.TimelineJSProfileProcessor.buildTraceProfileFromCpuProfile(profile, /* tid */ 1, /* injectPageEvent */ true);
        }
        catch (e) {
            this.reportErrorAndCancelLoading(i18nString(UIStrings.malformedCpuProfileFormat));
            return;
        }
        this.tracingModel.addEvents(traceEvents);
    }
}
export const TransferChunkLengthBytes = 5000000;
// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum
export var State;
(function (State) {
    State["Initial"] = "Initial";
    State["LookingForEvents"] = "LookingForEvents";
    State["ReadingEvents"] = "ReadingEvents";
    State["SkippingTail"] = "SkippingTail";
    State["LoadingCPUProfileFormat"] = "LoadingCPUProfileFormat";
})(State || (State = {}));
//# sourceMappingURL=TimelineLoader.js.map