// Copyright 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as Host from '../../core/host/host.js';
import * as PerfUI from '../../ui/legacy/components/perf_ui/perf_ui.js';
import * as UI from '../../ui/legacy/legacy.js';
import * as ThemeSupport from '../../ui/legacy/theme_support/theme_support.js';
import { Bounds, formatMillisecondsToSeconds } from './TickingFlameChartHelpers.js';
const defaultFont = '11px ' + Host.Platform.fontFamily();
const defaultColor = ThemeSupport.ThemeSupport.instance().getComputedValue('--color-text-primary');
const DefaultStyle = {
    height: 20,
    padding: 2,
    collapsible: false,
    font: defaultFont,
    color: defaultColor,
    backgroundColor: 'rgba(100 0 0 / 10%)',
    nestingLevel: 0,
    itemsHeight: 20,
    shareHeaderLine: false,
    useFirstLineForOverview: false,
    useDecoratorsForOverview: false,
};
export const HotColorScheme = ['#ffba08', '#faa307', '#f48c06', '#e85d04', '#dc2f02', '#d00000', '#9d0208'];
export const ColdColorScheme = ['#7400b8', '#6930c3', '#5e60ce', '#5390d9', '#4ea8de', '#48bfe3', '#56cfe1', '#64dfdf'];
function calculateFontColor(backgroundColor) {
    const parsedColor = Common.Color.Color.parse(backgroundColor);
    // Dark background needs a light font.
    if (parsedColor && parsedColor.hsla()[2] < 0.5) {
        return '#eee';
    }
    return '#444';
}
/**
 * Wrapper class for each event displayed on the timeline.
 */
export class Event {
    timelineData;
    setLive;
    setComplete;
    updateMaxTime;
    selfIndex;
    liveInternal;
    title;
    colorInternal;
    fontColorInternal;
    hoverData;
    constructor(timelineData, eventHandlers, eventProperties = { color: undefined, duration: undefined, hoverData: {}, level: 0, name: '', startTime: 0 }) {
        // These allow the event to privately change it's own data in the timeline.
        this.timelineData = timelineData;
        this.setLive = eventHandlers.setLive;
        this.setComplete = eventHandlers.setComplete;
        this.updateMaxTime = eventHandlers.updateMaxTime;
        // This is the index in the timelineData arrays we should be writing to.
        this.selfIndex = this.timelineData.entryLevels.length;
        this.liveInternal = false;
        // Can't use the dict||or||default syntax, since NaN is a valid expected duration.
        const duration = eventProperties['duration'] === undefined ? 0 : eventProperties['duration'];
        this.timelineData.entryLevels.push(eventProperties['level'] || 0);
        this.timelineData.entryStartTimes.push(eventProperties['startTime'] || 0);
        this.timelineData.entryTotalTimes.push(duration); // May initially push -1
        // If -1 was pushed, we need to update it. The set end time method helps with this.
        if (duration === -1) {
            this.endTime = -1;
        }
        this.title = eventProperties['name'] || '';
        this.colorInternal = eventProperties['color'] || HotColorScheme[0];
        this.fontColorInternal = calculateFontColor(this.colorInternal);
        this.hoverData = eventProperties['hoverData'] || {};
    }
    /**
     * Render hovertext into the |htmlElement|
     */
    decorate(htmlElement) {
        htmlElement.createChild('span').textContent = `Name: ${this.title}`;
        htmlElement.createChild('br');
        const startTimeReadable = formatMillisecondsToSeconds(this.startTime, 2);
        if (this.liveInternal) {
            htmlElement.createChild('span').textContent = `Duration: ${startTimeReadable} - LIVE!`;
        }
        else if (!isNaN(this.duration)) {
            const durationReadable = formatMillisecondsToSeconds(this.duration + this.startTime, 2);
            htmlElement.createChild('span').textContent = `Duration: ${startTimeReadable} - ${durationReadable}`;
        }
        else {
            htmlElement.createChild('span').textContent = `Time: ${startTimeReadable}`;
        }
    }
    /**
     * set an event to be "live" where it's ended time is always the chart maximum
     * or to be a fixed time.
     * @param {number} time
     */
    set endTime(time) {
        // Setting end time to -1 signals that an event becomes live
        if (time === -1) {
            this.timelineData.entryTotalTimes[this.selfIndex] = this.setLive(this.selfIndex);
            this.liveInternal = true;
        }
        else {
            this.liveInternal = false;
            const duration = time - this.timelineData.entryStartTimes[this.selfIndex];
            this.timelineData.entryTotalTimes[this.selfIndex] = duration;
            this.setComplete(this.selfIndex);
            this.updateMaxTime(time);
        }
    }
    get id() {
        return this.selfIndex;
    }
    set level(level) {
        this.timelineData.entryLevels[this.selfIndex] = level;
    }
    set color(color) {
        this.colorInternal = color;
        this.fontColorInternal = calculateFontColor(this.colorInternal);
    }
    get color() {
        return this.colorInternal;
    }
    get fontColor() {
        return this.fontColorInternal;
    }
    get startTime() {
        // Round it
        return this.timelineData.entryStartTimes[this.selfIndex];
    }
    get duration() {
        return this.timelineData.entryTotalTimes[this.selfIndex];
    }
    get live() {
        return this.liveInternal;
    }
}
export class TickingFlameChart extends UI.Widget.VBox {
    intervalTimer;
    lastTimestamp;
    canTickInternal;
    ticking;
    isShown;
    bounds;
    dataProvider;
    delegate;
    chartGroupExpansionSetting;
    chart;
    stoppedPermanently;
    constructor() {
        super();
        // set to update once per second _while the tab is active_
        this.intervalTimer = 0;
        this.lastTimestamp = 0;
        this.canTickInternal = true;
        this.ticking = false;
        this.isShown = false;
        // The max bounds for scroll-out.
        this.bounds = new Bounds(0, 1000, 30000, 1000);
        // Create the data provider with the initial max bounds,
        // as well as a function to attempt bounds updating everywhere.
        this.dataProvider = new TickingFlameChartDataProvider(this.bounds, this.updateMaxTime.bind(this));
        // Delegate doesn't do much for now.
        this.delegate = new TickingFlameChartDelegate();
        // Chart settings.
        this.chartGroupExpansionSetting =
            Common.Settings.Settings.instance().createSetting('mediaFlameChartGroupExpansion', {});
        // Create the chart.
        this.chart =
            // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
            // @ts-expect-error
            new PerfUI.FlameChart.FlameChart(this.dataProvider, this.delegate, this.chartGroupExpansionSetting);
        // TODO: needs to have support in the delegate for supporting this.
        this.chart.disableRangeSelection();
        // Scrolling should change the current bounds, and repaint the chart.
        this.chart.bindCanvasEvent('wheel', e => {
            this.onScroll(e);
        });
        // Add the chart.
        this.chart.show(this.contentElement);
    }
    /**
     * Add a marker with |properties| at |time|.
     */
    addMarker(properties) {
        properties['duration'] = NaN;
        this.startEvent(properties);
    }
    /**
     * Create an event which will be set to live by default.
     */
    startEvent(properties) {
        // Make sure that an unspecified event gets live duration.
        // Have to check for undefined, since NaN is allowed but evaluates to false.
        if (properties['duration'] === undefined) {
            properties['duration'] = -1;
        }
        const time = properties['startTime'] || 0;
        // Event has to be created before the updateMaxTime call.
        const event = this.dataProvider.startEvent(properties);
        this.updateMaxTime(time);
        return event;
    }
    /**
     * Add a group with |name| that can contain |depth| different tracks.
     */
    addGroup(name, depth) {
        this.dataProvider.addGroup(name, depth);
    }
    updateMaxTime(time) {
        if (this.bounds.pushMaxAtLeastTo(time)) {
            this.updateRender();
        }
    }
    onScroll(e) {
        // TODO: is this a good divisor? does it account for high presicision scroll wheels?
        // low precisision scroll wheels?
        const scrollTickCount = Math.round(e.deltaY / 50);
        const scrollPositionRatio = e.offsetX / e.srcElement.clientWidth;
        if (scrollTickCount > 0) {
            this.bounds.zoomOut(scrollTickCount, scrollPositionRatio);
        }
        else {
            this.bounds.zoomIn(-scrollTickCount, scrollPositionRatio);
        }
        this.updateRender();
    }
    willHide() {
        this.isShown = false;
        if (this.ticking) {
            this.stop();
        }
    }
    wasShown() {
        this.isShown = true;
        if (this.canTickInternal && !this.ticking) {
            this.start();
        }
    }
    set canTick(allowed) {
        this.canTickInternal = allowed;
        if (this.ticking && !allowed) {
            this.stop();
        }
        if (!this.ticking && this.isShown && allowed) {
            this.start();
        }
    }
    start() {
        if (this.lastTimestamp === 0) {
            this.lastTimestamp = Date.now();
        }
        if (this.intervalTimer !== 0 || this.stoppedPermanently) {
            return;
        }
        // 16 ms is roughly 60 fps.
        this.intervalTimer = window.setInterval(this.updateRender.bind(this), 16);
        this.ticking = true;
    }
    stop(permanently = false) {
        window.clearInterval(this.intervalTimer);
        this.intervalTimer = 0;
        if (permanently) {
            this.stoppedPermanently = true;
        }
        this.ticking = false;
    }
    updateRender() {
        if (this.ticking) {
            const currentTimestamp = Date.now();
            const duration = currentTimestamp - this.lastTimestamp;
            this.lastTimestamp = currentTimestamp;
            this.bounds.addMax(duration);
        }
        this.dataProvider.updateMaxTime(this.bounds);
        this.chart.setWindowTimes(this.bounds.low, this.bounds.high, true);
        this.chart.scheduleUpdate();
    }
}
/**
 * Doesn't do much right now, but can be used in the future for selecting events.
 */
class TickingFlameChartDelegate {
    constructor() {
    }
    windowChanged(_windowStartTime, _windowEndTime, _animate) {
    }
    updateRangeSelection(_startTime, _endTime) {
    }
    updateSelectedGroup(_flameChart, _group) {
    }
}
class TickingFlameChartDataProvider {
    updateMaxTimeHandle;
    bounds;
    liveEvents;
    eventMap;
    timelineDataInternal;
    maxLevel;
    constructor(initialBounds, updateMaxTime) {
        // do _not_ call this method from within this class - only for passing to events.
        this.updateMaxTimeHandle = updateMaxTime;
        this.bounds = initialBounds;
        // All the events which should have their time updated when the chart ticks.
        this.liveEvents = new Set();
        // All events.
        // Map<Event>
        this.eventMap = new Map();
        // Contains the numerical indicies. This is passed as a reference to the events
        // so that they can update it when they change.
        this.timelineDataInternal = new PerfUI.FlameChart.TimelineData([], [], [], []);
        // The current sum of all group heights.
        this.maxLevel = 0;
    }
    /**
     * Add a group with |name| that can contain |depth| different tracks.
     */
    addGroup(name, depth) {
        if (this.timelineDataInternal.groups) {
            this.timelineDataInternal.groups.push({
                name: name,
                startLevel: this.maxLevel,
                expanded: true,
                selectable: false,
                style: DefaultStyle,
                track: null,
            });
        }
        this.maxLevel += depth;
    }
    /**
     * Create an event which will be set to live by default.
     */
    startEvent(properties) {
        properties['level'] = properties['level'] || 0;
        if (properties['level'] > this.maxLevel) {
            throw `level ${properties['level']} is above the maximum allowed of ${this.maxLevel}`;
        }
        const event = new Event(this.timelineDataInternal, {
            setLive: this.setLive.bind(this),
            setComplete: this.setComplete.bind(this),
            updateMaxTime: this.updateMaxTimeHandle,
        }, properties);
        this.eventMap.set(event.id, event);
        return event;
    }
    setLive(index) {
        this.liveEvents.add(index);
        return this.bounds.max;
    }
    setComplete(index) {
        this.liveEvents.delete(index);
    }
    updateMaxTime(bounds) {
        this.bounds = bounds;
        for (const eventID of this.liveEvents.entries()) {
            // force recalculation of all live events.
            this.eventMap.get(eventID[0]).endTime = -1;
        }
    }
    maxStackDepth() {
        return this.maxLevel + 1;
    }
    timelineData() {
        return this.timelineDataInternal;
    }
    /** time in milliseconds
       */
    minimumBoundary() {
        return this.bounds.low;
    }
    totalTime() {
        return this.bounds.high;
    }
    entryColor(index) {
        return this.eventMap.get(index).color;
    }
    textColor(index) {
        return this.eventMap.get(index).fontColor;
    }
    entryTitle(index) {
        return this.eventMap.get(index).title;
    }
    entryFont(_index) {
        return defaultFont;
    }
    decorateEntry(_index, _context, _text, _barX, _barY, _barWidth, _barHeight, _unclippedBarX, _timeToPixelRatio) {
        return false;
    }
    forceDecoration(_index) {
        return false;
    }
    prepareHighlightedEntryInfo(index) {
        const element = document.createElement('div');
        this.eventMap.get(index).decorate(element);
        return element;
    }
    formatValue(value, _precision) {
        // value is always [0, X] so we need to add lower bound
        value += Math.round(this.bounds.low);
        // Magic numbers of pre-calculated logorithms.
        // we want to show additional decimals at the time when two adjacent labels
        // would otherwise show the same number. At 3840 pixels wide, that cutoff
        // happens to be about 30 seconds for one decimal and 2.8 for two decimals.
        if (this.bounds.range < 2800) {
            return formatMillisecondsToSeconds(value, 2);
        }
        if (this.bounds.range < 30000) {
            return formatMillisecondsToSeconds(value, 1);
        }
        return formatMillisecondsToSeconds(value, 0);
    }
    canJumpToEntry(_entryIndex) {
        return false;
    }
    navStartTimes() {
        return new Map();
    }
}
//# sourceMappingURL=TickingFlameChart.js.map