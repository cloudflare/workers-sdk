// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../i18n/i18n.js';
import { CategorizedBreakpoint } from './CategorizedBreakpoint.js';
import { Capability } from './Target.js';
import { SDKModel } from './SDKModel.js';
import { TargetManager } from './TargetManager.js';
const UIStrings = {
    /**
     * @description Category of breakpoints
     */
    auctionWorklet: 'Ad Auction Worklet',
    /**
     * @description Name of a breakpoint type.
     * https://github.com/WICG/turtledove/blob/main/FLEDGE.md#32-on-device-bidding
     */
    beforeBidderWorkletBiddingStart: 'Bidder Bidding Phase Start',
    /**
     * @description Name of a breakpoint type.
     * https://github.com/WICG/turtledove/blob/main/FLEDGE.md#52-buyer-reporting-on-render-and-ad-events
     */
    beforeBidderWorkletReportingStart: 'Bidder Reporting Phase Start',
    /**
     * @description Name of a breakpoint type.
     * https://github.com/WICG/turtledove/blob/main/FLEDGE.md#23-scoring-bids
     */
    beforeSellerWorkletScoringStart: 'Seller Scoring Phase Start',
    /**
     * @description Name of a breakpoint type.
     * https://github.com/WICG/turtledove/blob/main/FLEDGE.md#51-seller-reporting-on-render
     */
    beforeSellerWorkletReportingStart: 'Seller Reporting Phase Start',
};
const str_ = i18n.i18n.registerUIStrings('core/sdk/EventBreakpointsModel.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
function getTitleForInstrumentationName(instrumentationName) {
    switch (instrumentationName) {
        case "beforeBidderWorkletBiddingStart" /* BeforeBidderWorkletBiddingStart */:
            return i18nString(UIStrings.beforeBidderWorkletBiddingStart);
        case "beforeBidderWorkletReportingStart" /* BeforeBidderWorkletReportingStart */:
            return i18nString(UIStrings.beforeBidderWorkletReportingStart);
        case "beforeSellerWorkletScoringStart" /* BeforeSellerWorkletScoringStart */:
            return i18nString(UIStrings.beforeSellerWorkletScoringStart);
        case "beforeSellerWorkletReportingStart" /* BeforeSellerWorkletReportingStart */:
            return i18nString(UIStrings.beforeSellerWorkletReportingStart);
    }
}
export class EventBreakpointsModel extends SDKModel {
    agent;
    constructor(target) {
        super(target);
        this.agent = target.eventBreakpointsAgent();
    }
}
// This implementation (as opposed to similar class in DOMDebuggerModel) is for
// instrumentation breakpoints in targets that run JS but do not have a DOM.
class EventListenerBreakpoint extends CategorizedBreakpoint {
    instrumentationName;
    constructor(instrumentationName, category) {
        super(category, getTitleForInstrumentationName(instrumentationName));
        this.instrumentationName = instrumentationName;
    }
    setEnabled(enabled) {
        if (this.enabled() === enabled) {
            return;
        }
        super.setEnabled(enabled);
        for (const model of TargetManager.instance().models(EventBreakpointsModel)) {
            this.updateOnModel(model);
        }
    }
    updateOnModel(model) {
        if (this.enabled()) {
            void model.agent.invoke_setInstrumentationBreakpoint({ eventName: this.instrumentationName });
        }
        else {
            void model.agent.invoke_removeInstrumentationBreakpoint({ eventName: this.instrumentationName });
        }
    }
    static instrumentationPrefix = 'instrumentation:';
}
let eventBreakpointManagerInstance;
export class EventBreakpointsManager {
    #eventListenerBreakpointsInternal = [];
    constructor() {
        this.createInstrumentationBreakpoints(i18nString(UIStrings.auctionWorklet), [
            "beforeBidderWorkletBiddingStart" /* BeforeBidderWorkletBiddingStart */,
            "beforeBidderWorkletReportingStart" /* BeforeBidderWorkletReportingStart */,
            "beforeSellerWorkletScoringStart" /* BeforeSellerWorkletScoringStart */,
            "beforeSellerWorkletReportingStart" /* BeforeSellerWorkletReportingStart */,
        ]);
        TargetManager.instance().observeModels(EventBreakpointsModel, this);
    }
    static instance(opts = { forceNew: null }) {
        const { forceNew } = opts;
        if (!eventBreakpointManagerInstance || forceNew) {
            eventBreakpointManagerInstance = new EventBreakpointsManager();
        }
        return eventBreakpointManagerInstance;
    }
    createInstrumentationBreakpoints(category, instrumentationNames) {
        for (const instrumentationName of instrumentationNames) {
            this.#eventListenerBreakpointsInternal.push(new EventListenerBreakpoint(instrumentationName, category));
        }
    }
    eventListenerBreakpoints() {
        return this.#eventListenerBreakpointsInternal.slice();
    }
    resolveEventListenerBreakpointTitle(auxData) {
        const breakpoint = this.resolveEventListenerBreakpoint(auxData);
        return breakpoint ? breakpoint.title() : null;
    }
    resolveEventListenerBreakpoint(auxData) {
        const eventName = auxData.eventName;
        if (!eventName.startsWith(EventListenerBreakpoint.instrumentationPrefix)) {
            return null;
        }
        const instrumentationName = eventName.substring(EventListenerBreakpoint.instrumentationPrefix.length);
        return this.#eventListenerBreakpointsInternal.find(b => b.instrumentationName === instrumentationName) || null;
    }
    modelAdded(eventBreakpointModel) {
        for (const breakpoint of this.#eventListenerBreakpointsInternal) {
            if (breakpoint.enabled()) {
                breakpoint.updateOnModel(eventBreakpointModel);
            }
        }
    }
    modelRemoved(_eventBreakpointModel) {
    }
}
SDKModel.register(EventBreakpointsModel, { capabilities: Capability.EventBreakpoints, autostart: false });
//# sourceMappingURL=EventBreakpointsModel.js.map