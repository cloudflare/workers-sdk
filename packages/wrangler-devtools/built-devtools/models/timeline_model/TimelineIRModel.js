// Copyright 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as i18n from '../../core/i18n/i18n.js';
const UIStrings = {
    /**
    * @description Error text in Timeline IRModel of the Performance panel. Indicates that two fling
    * gestures were detected at the same time, which should not be possible.
    *@example {2s} PH1
    *@example {3s} PH2
    */
    twoFlingsAtTheSameTimeSVsS: 'Two flings at the same time? {PH1} vs {PH2}',
    /**
    *@description Text in Timeline IRModel of the Performance panel
    *@example {2s} PH1
    *@example {3s} PH2
    */
    twoTouchesAtTheSameTimeSVsS: 'Two touches at the same time? {PH1} vs {PH2}',
};
const str_ = i18n.i18n.registerUIStrings('models/timeline_model/TimelineIRModel.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
const eventToPhase = new WeakMap();
export class TimelineIRModel {
    segments;
    drags;
    cssAnimations;
    responses;
    scrolls;
    constructor() {
        this.reset();
    }
    static phaseForEvent(event) {
        return eventToPhase.get(event);
    }
    populate(inputLatencies, animations) {
        this.reset();
        if (!inputLatencies) {
            return;
        }
        this.processInputLatencies(inputLatencies);
        if (animations) {
            this.processAnimations(animations);
        }
        const range = new Common.SegmentedRange.SegmentedRange();
        range.appendRange(this.drags); // Drags take lower precedence than animation, as we can't detect them reliably.
        range.appendRange(this.cssAnimations);
        range.appendRange(this.scrolls);
        range.appendRange(this.responses);
        this.segments = range.segments();
    }
    processInputLatencies(events) {
        const eventTypes = InputEvents;
        const phases = Phases;
        const thresholdsMs = TimelineIRModel._mergeThresholdsMs;
        let scrollStart;
        let flingStart;
        let touchStart;
        let firstTouchMove;
        let mouseWheel;
        let mouseDown;
        let mouseMove;
        for (let i = 0; i < events.length; ++i) {
            const event = events[i];
            if (i > 0 && events[i].startTime < events[i - 1].startTime) {
                console.assert(false, 'Unordered input events');
            }
            const type = this.inputEventType(event.name);
            switch (type) {
                case eventTypes.ScrollBegin:
                    this.scrolls.append(this.segmentForEvent(event, phases.Scroll));
                    scrollStart = event;
                    break;
                case eventTypes.ScrollEnd:
                    if (scrollStart) {
                        this.scrolls.append(this.segmentForEventRange(scrollStart, event, phases.Scroll));
                    }
                    else {
                        this.scrolls.append(this.segmentForEvent(event, phases.Scroll));
                    }
                    scrollStart = null;
                    break;
                case eventTypes.ScrollUpdate:
                    touchStart = null; // Since we're scrolling now, disregard other touch gestures.
                    this.scrolls.append(this.segmentForEvent(event, phases.Scroll));
                    break;
                case eventTypes.FlingStart:
                    if (flingStart) {
                        Common.Console.Console.instance().error(i18nString(UIStrings.twoFlingsAtTheSameTimeSVsS, { PH1: flingStart.startTime, PH2: event.startTime }));
                        break;
                    }
                    flingStart = event;
                    break;
                case eventTypes.FlingCancel:
                    // FIXME: also process renderer fling events.
                    if (!flingStart) {
                        break;
                    }
                    this.scrolls.append(this.segmentForEventRange(flingStart, event, phases.Fling));
                    flingStart = null;
                    break;
                case eventTypes.ImplSideFling:
                    this.scrolls.append(this.segmentForEvent(event, phases.Fling));
                    break;
                case eventTypes.ShowPress:
                case eventTypes.Tap:
                case eventTypes.KeyDown:
                case eventTypes.KeyDownRaw:
                case eventTypes.KeyUp:
                case eventTypes.Char:
                case eventTypes.Click:
                case eventTypes.ContextMenu:
                    this.responses.append(this.segmentForEvent(event, phases.Response));
                    break;
                case eventTypes.TouchStart:
                    // We do not produce any response segment for TouchStart -- there's either going to be one upon
                    // TouchMove for drag, or one for GestureTap.
                    if (touchStart) {
                        Common.Console.Console.instance().error(i18nString(UIStrings.twoTouchesAtTheSameTimeSVsS, { PH1: touchStart.startTime, PH2: event.startTime }));
                        break;
                    }
                    touchStart = event;
                    this.setPhaseForEvent(event, phases.Response);
                    firstTouchMove = null;
                    break;
                case eventTypes.TouchCancel:
                    touchStart = null;
                    break;
                case eventTypes.TouchMove:
                    if (firstTouchMove) {
                        this.drags.append(this.segmentForEvent(event, phases.Drag));
                    }
                    else if (touchStart) {
                        firstTouchMove = event;
                        this.responses.append(this.segmentForEventRange(touchStart, event, phases.Response));
                    }
                    break;
                case eventTypes.TouchEnd:
                    touchStart = null;
                    break;
                case eventTypes.MouseDown:
                    mouseDown = event;
                    mouseMove = null;
                    break;
                case eventTypes.MouseMove:
                    if (mouseDown && !mouseMove && mouseDown.startTime + thresholdsMs.mouse > event.startTime) {
                        this.responses.append(this.segmentForEvent(mouseDown, phases.Response));
                        this.responses.append(this.segmentForEvent(event, phases.Response));
                    }
                    else if (mouseDown) {
                        this.drags.append(this.segmentForEvent(event, phases.Drag));
                    }
                    mouseMove = event;
                    break;
                case eventTypes.MouseUp:
                    this.responses.append(this.segmentForEvent(event, phases.Response));
                    mouseDown = null;
                    break;
                case eventTypes.MouseWheel:
                    // Do not consider first MouseWheel as trace viewer's implementation does -- in case of MouseWheel it's not really special.
                    if (mouseWheel && canMerge(thresholdsMs.mouse, mouseWheel, event)) {
                        this.scrolls.append(this.segmentForEventRange(mouseWheel, event, phases.Scroll));
                    }
                    else {
                        this.scrolls.append(this.segmentForEvent(event, phases.Scroll));
                    }
                    mouseWheel = event;
                    break;
            }
        }
        function canMerge(threshold, first, second) {
            if (first.endTime === undefined) {
                return false;
            }
            return first.endTime < second.startTime && second.startTime < first.endTime + threshold;
        }
    }
    processAnimations(events) {
        for (let i = 0; i < events.length; ++i) {
            this.cssAnimations.append(this.segmentForEvent(events[i], Phases.Animation));
        }
    }
    segmentForEvent(event, phase) {
        this.setPhaseForEvent(event, phase);
        return new Common.SegmentedRange.Segment(event.startTime, event.endTime !== undefined ? event.endTime : Number.MAX_SAFE_INTEGER, phase);
    }
    segmentForEventRange(startEvent, endEvent, phase) {
        this.setPhaseForEvent(startEvent, phase);
        this.setPhaseForEvent(endEvent, phase);
        return new Common.SegmentedRange.Segment(startEvent.startTime, startEvent.endTime !== undefined ? startEvent.endTime : Number.MAX_SAFE_INTEGER, phase);
    }
    setPhaseForEvent(asyncEvent, phase) {
        eventToPhase.set(asyncEvent.steps[0], phase);
    }
    interactionRecords() {
        return this.segments;
    }
    reset() {
        const thresholdsMs = TimelineIRModel._mergeThresholdsMs;
        this.segments = [];
        this.drags = new Common.SegmentedRange.SegmentedRange(merge.bind(null, thresholdsMs.mouse));
        this.cssAnimations = new Common.SegmentedRange.SegmentedRange(merge.bind(null, thresholdsMs.animation));
        this.responses = new Common.SegmentedRange.SegmentedRange(merge.bind(null, 0));
        this.scrolls = new Common.SegmentedRange.SegmentedRange(merge.bind(null, thresholdsMs.animation));
        function merge(threshold, first, second) {
            return first.end + threshold >= second.begin && first.data === second.data ? first : null;
        }
    }
    inputEventType(eventName) {
        const prefix = 'InputLatency::';
        if (!eventName.startsWith(prefix)) {
            const inputEventName = eventName;
            if (inputEventName === InputEvents.ImplSideFling) {
                return inputEventName;
            }
            console.error('Unrecognized input latency event: ' + eventName);
            return null;
        }
        return eventName.substr(prefix.length);
    }
}
// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum
export var Phases;
(function (Phases) {
    Phases["Idle"] = "Idle";
    Phases["Response"] = "Response";
    Phases["Scroll"] = "Scroll";
    Phases["Fling"] = "Fling";
    Phases["Drag"] = "Drag";
    Phases["Animation"] = "Animation";
    Phases["Uncategorized"] = "Uncategorized";
})(Phases || (Phases = {}));
// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum
export var InputEvents;
(function (InputEvents) {
    InputEvents["Char"] = "Char";
    InputEvents["Click"] = "GestureClick";
    InputEvents["ContextMenu"] = "ContextMenu";
    InputEvents["FlingCancel"] = "GestureFlingCancel";
    InputEvents["FlingStart"] = "GestureFlingStart";
    InputEvents["ImplSideFling"] = "InputHandlerProxy::HandleGestureFling::started";
    InputEvents["KeyDown"] = "KeyDown";
    InputEvents["KeyDownRaw"] = "RawKeyDown";
    InputEvents["KeyUp"] = "KeyUp";
    InputEvents["LatencyScrollUpdate"] = "ScrollUpdate";
    InputEvents["MouseDown"] = "MouseDown";
    InputEvents["MouseMove"] = "MouseMove";
    InputEvents["MouseUp"] = "MouseUp";
    InputEvents["MouseWheel"] = "MouseWheel";
    InputEvents["PinchBegin"] = "GesturePinchBegin";
    InputEvents["PinchEnd"] = "GesturePinchEnd";
    InputEvents["PinchUpdate"] = "GesturePinchUpdate";
    InputEvents["ScrollBegin"] = "GestureScrollBegin";
    InputEvents["ScrollEnd"] = "GestureScrollEnd";
    InputEvents["ScrollUpdate"] = "GestureScrollUpdate";
    InputEvents["ScrollUpdateRenderer"] = "ScrollUpdate";
    InputEvents["ShowPress"] = "GestureShowPress";
    InputEvents["Tap"] = "GestureTap";
    InputEvents["TapCancel"] = "GestureTapCancel";
    InputEvents["TapDown"] = "GestureTapDown";
    InputEvents["TouchCancel"] = "TouchCancel";
    InputEvents["TouchEnd"] = "TouchEnd";
    InputEvents["TouchMove"] = "TouchMove";
    InputEvents["TouchStart"] = "TouchStart";
})(InputEvents || (InputEvents = {}));
(function (TimelineIRModel) {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    TimelineIRModel._mergeThresholdsMs = {
        animation: 1,
        mouse: 40,
    };
    // eslint-disable-next-line @typescript-eslint/naming-convention
    TimelineIRModel._eventIRPhase = Symbol('eventIRPhase');
})(TimelineIRModel || (TimelineIRModel = {}));
//# sourceMappingURL=TimelineIRModel.js.map