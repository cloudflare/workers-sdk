// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as Platform from '../../core/platform/platform.js';
import * as UI from '../../ui/legacy/legacy.js';
import timelineHistoryManagerStyles from './timelineHistoryManager.css.js';
import { TimelineEventOverviewCPUActivity, TimelineEventOverviewNetwork, TimelineEventOverviewResponsiveness, } from './TimelineEventOverview.js';
const UIStrings = {
    /**
    *@description Screen reader label for the Timeline History dropdown button
    *@example {example.com #3} PH1
    *@example {Show recent timeline sessions} PH2
    */
    currentSessionSS: 'Current Session: {PH1}. {PH2}',
    /**
    *@description Text that shows there is no recording
    */
    noRecordings: '(no recordings)',
    /**
    *@description Text in Timeline History Manager of the Performance panel
    *@example {2s} PH1
    */
    sAgo: '({PH1} ago)',
    /**
    *@description Text in Timeline History Manager of the Performance panel
    */
    moments: 'moments',
    /**
     * @description Text in Timeline History Manager of the Performance panel.
     * Placeholder is a number and the 'm' is the short form for 'minutes'.
     * @example {2} PH1
     */
    sM: '{PH1} m',
    /**
     * @description Text in Timeline History Manager of the Performance panel.
     * Placeholder is a number and the 'h' is the short form for 'hours'.
     * @example {2} PH1
     */
    sH: '{PH1} h',
    /**
    *@description Text in Timeline History Manager of the Performance panel
    *@example {example.com} PH1
    *@example {2} PH2
    */
    sD: '{PH1} #{PH2}',
    /**
    *@description Accessible label for the timeline session selection menu
    */
    selectTimelineSession: 'Select Timeline Session',
};
const str_ = i18n.i18n.registerUIStrings('panels/timeline/TimelineHistoryManager.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class TimelineHistoryManager {
    recordings;
    action;
    nextNumberByDomain;
    buttonInternal;
    allOverviews;
    totalHeight;
    enabled;
    lastActiveModel;
    constructor() {
        this.recordings = [];
        this.action =
            UI.ActionRegistry.ActionRegistry.instance().action('timeline.show-history');
        this.nextNumberByDomain = new Map();
        this.buttonInternal = new ToolbarButton(this.action);
        UI.ARIAUtils.markAsMenuButton(this.buttonInternal.element);
        this.clear();
        this.allOverviews = [
            { constructor: TimelineEventOverviewResponsiveness, height: 3 },
            { constructor: TimelineEventOverviewCPUActivity, height: 20 },
            { constructor: TimelineEventOverviewNetwork, height: 8 },
        ];
        this.totalHeight = this.allOverviews.reduce((acc, entry) => acc + entry.height, 0);
        this.enabled = true;
        this.lastActiveModel = null;
    }
    addRecording(performanceModel) {
        this.lastActiveModel = performanceModel;
        this.recordings.unshift(performanceModel);
        this.buildPreview(performanceModel);
        const modelTitle = this.title(performanceModel);
        this.buttonInternal.setText(modelTitle);
        const buttonTitle = this.action.title();
        UI.ARIAUtils.setAccessibleName(this.buttonInternal.element, i18nString(UIStrings.currentSessionSS, { PH1: modelTitle, PH2: buttonTitle }));
        this.updateState();
        if (this.recordings.length <= maxRecordings) {
            return;
        }
        const lruModel = this.recordings.reduce((a, b) => lastUsedTime(a) < lastUsedTime(b) ? a : b);
        this.recordings.splice(this.recordings.indexOf(lruModel), 1);
        lruModel.dispose();
        function lastUsedTime(model) {
            const data = TimelineHistoryManager.dataForModel(model);
            if (!data) {
                throw new Error('Unable to find data for model');
            }
            return data.lastUsed;
        }
    }
    setEnabled(enabled) {
        this.enabled = enabled;
        this.updateState();
    }
    button() {
        return this.buttonInternal;
    }
    clear() {
        this.recordings.forEach(model => model.dispose());
        this.recordings = [];
        this.lastActiveModel = null;
        this.updateState();
        this.buttonInternal.setText(i18nString(UIStrings.noRecordings));
        this.nextNumberByDomain.clear();
    }
    async showHistoryDropDown() {
        if (this.recordings.length < 2 || !this.enabled) {
            return null;
        }
        // DropDown.show() function finishes when the dropdown menu is closed via selection or losing focus
        const model = await DropDown.show(this.recordings, this.lastActiveModel, this.buttonInternal.element);
        if (!model) {
            return null;
        }
        const index = this.recordings.indexOf(model);
        if (index < 0) {
            console.assert(false, 'selected recording not found');
            return null;
        }
        this.setCurrentModel(model);
        return model;
    }
    cancelIfShowing() {
        DropDown.cancelIfShowing();
    }
    navigate(direction) {
        if (!this.enabled || !this.lastActiveModel) {
            return null;
        }
        const index = this.recordings.indexOf(this.lastActiveModel);
        if (index < 0) {
            return null;
        }
        const newIndex = Platform.NumberUtilities.clamp(index + direction, 0, this.recordings.length - 1);
        const model = this.recordings[newIndex];
        this.setCurrentModel(model);
        return model;
    }
    setCurrentModel(model) {
        const data = TimelineHistoryManager.dataForModel(model);
        if (!data) {
            throw new Error('Unable to find data for model');
        }
        data.lastUsed = Date.now();
        this.lastActiveModel = model;
        const modelTitle = this.title(model);
        const buttonTitle = this.action.title();
        this.buttonInternal.setText(modelTitle);
        UI.ARIAUtils.setAccessibleName(this.buttonInternal.element, i18nString(UIStrings.currentSessionSS, { PH1: modelTitle, PH2: buttonTitle }));
    }
    updateState() {
        this.action.setEnabled(this.recordings.length > 1 && this.enabled);
    }
    static previewElement(performanceModel) {
        const data = TimelineHistoryManager.dataForModel(performanceModel);
        if (!data) {
            throw new Error('Unable to find data for model');
        }
        const startedAt = performanceModel.recordStartTime();
        data.time.textContent =
            startedAt ? i18nString(UIStrings.sAgo, { PH1: TimelineHistoryManager.coarseAge(startedAt) }) : '';
        return data.preview;
    }
    static coarseAge(time) {
        const seconds = Math.round((Date.now() - time) / 1000);
        if (seconds < 50) {
            return i18nString(UIStrings.moments);
        }
        const minutes = Math.round(seconds / 60);
        if (minutes < 50) {
            return i18nString(UIStrings.sM, { PH1: minutes });
        }
        const hours = Math.round(minutes / 60);
        return i18nString(UIStrings.sH, { PH1: hours });
    }
    title(performanceModel) {
        const data = TimelineHistoryManager.dataForModel(performanceModel);
        if (!data) {
            throw new Error('Unable to find data for model');
        }
        return data.title;
    }
    buildPreview(performanceModel) {
        const parsedURL = Common.ParsedURL.ParsedURL.fromString(performanceModel.timelineModel().pageURL());
        const domain = parsedURL ? parsedURL.host : '';
        const sequenceNumber = this.nextNumberByDomain.get(domain) || 1;
        const title = i18nString(UIStrings.sD, { PH1: domain, PH2: sequenceNumber });
        this.nextNumberByDomain.set(domain, sequenceNumber + 1);
        const timeElement = document.createElement('span');
        const preview = document.createElement('div');
        preview.classList.add('preview-item');
        preview.classList.add('vbox');
        const data = { preview: preview, title: title, time: timeElement, lastUsed: Date.now() };
        modelToPerformanceData.set(performanceModel, data);
        preview.appendChild(this.buildTextDetails(performanceModel, title, timeElement));
        const screenshotAndOverview = preview.createChild('div', 'hbox');
        screenshotAndOverview.appendChild(this.buildScreenshotThumbnail(performanceModel));
        screenshotAndOverview.appendChild(this.buildOverview(performanceModel));
        return data.preview;
    }
    buildTextDetails(performanceModel, title, timeElement) {
        const container = document.createElement('div');
        container.classList.add('text-details');
        container.classList.add('hbox');
        const nameSpan = container.createChild('span', 'name');
        nameSpan.textContent = title;
        UI.ARIAUtils.setAccessibleName(nameSpan, title);
        const tracingModel = performanceModel.tracingModel();
        const duration = i18n.TimeUtilities.millisToString(tracingModel.maximumRecordTime() - tracingModel.minimumRecordTime(), false);
        const timeContainer = container.createChild('span', 'time');
        timeContainer.appendChild(document.createTextNode(duration));
        timeContainer.appendChild(timeElement);
        return container;
    }
    buildScreenshotThumbnail(performanceModel) {
        const container = document.createElement('div');
        container.classList.add('screenshot-thumb');
        const thumbnailAspectRatio = 3 / 2;
        container.style.width = this.totalHeight * thumbnailAspectRatio + 'px';
        container.style.height = this.totalHeight + 'px';
        const filmStripModel = performanceModel.filmStripModel();
        const frames = filmStripModel.frames();
        const lastFrame = frames[frames.length - 1];
        if (!lastFrame) {
            return container;
        }
        void lastFrame.imageDataPromise()
            .then(data => UI.UIUtils.loadImageFromData(data))
            // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .then(image => image && container.appendChild(image));
        return container;
    }
    buildOverview(performanceModel) {
        const container = document.createElement('div');
        container.style.width = previewWidth + 'px';
        container.style.height = this.totalHeight + 'px';
        const canvas = container.createChild('canvas');
        canvas.width = window.devicePixelRatio * previewWidth;
        canvas.height = window.devicePixelRatio * this.totalHeight;
        const ctx = canvas.getContext('2d');
        let yOffset = 0;
        for (const overview of this.allOverviews) {
            const timelineOverview = new overview.constructor();
            timelineOverview.setCanvasSize(previewWidth, overview.height);
            timelineOverview.setModel(performanceModel);
            timelineOverview.update();
            const sourceContext = timelineOverview.context();
            const imageData = sourceContext.getImageData(0, 0, sourceContext.canvas.width, sourceContext.canvas.height);
            if (ctx) {
                ctx.putImageData(imageData, 0, yOffset);
            }
            yOffset += overview.height * window.devicePixelRatio;
        }
        return container;
    }
    static dataForModel(model) {
        return modelToPerformanceData.get(model) || null;
    }
}
export const maxRecordings = 5;
export const previewWidth = 450;
const modelToPerformanceData = new WeakMap();
export class DropDown {
    glassPane;
    listControl;
    focusRestorer;
    selectionDone;
    constructor(models) {
        this.glassPane = new UI.GlassPane.GlassPane();
        this.glassPane.setSizeBehavior("MeasureContent" /* MeasureContent */);
        this.glassPane.setOutsideClickCallback(() => this.close(null));
        this.glassPane.setPointerEventsBehavior("BlockedByGlassPane" /* BlockedByGlassPane */);
        this.glassPane.setAnchorBehavior("PreferBottom" /* PreferBottom */);
        this.glassPane.element.addEventListener('blur', () => this.close(null));
        const shadowRoot = UI.Utils.createShadowRootWithCoreStyles(this.glassPane.contentElement, {
            cssFile: [timelineHistoryManagerStyles],
            delegatesFocus: undefined,
        });
        const contentElement = shadowRoot.createChild('div', 'drop-down');
        const listModel = new UI.ListModel.ListModel();
        this.listControl =
            new UI.ListControl.ListControl(listModel, this, UI.ListControl.ListMode.NonViewport);
        this.listControl.element.addEventListener('mousemove', this.onMouseMove.bind(this), false);
        listModel.replaceAll(models);
        UI.ARIAUtils.markAsMenu(this.listControl.element);
        UI.ARIAUtils.setAccessibleName(this.listControl.element, i18nString(UIStrings.selectTimelineSession));
        contentElement.appendChild(this.listControl.element);
        contentElement.addEventListener('keydown', this.onKeyDown.bind(this), false);
        contentElement.addEventListener('click', this.onClick.bind(this), false);
        this.focusRestorer = new UI.UIUtils.ElementFocusRestorer(this.listControl.element);
        this.selectionDone = null;
    }
    static show(models, currentModel, anchor) {
        if (DropDown.instance) {
            return Promise.resolve(null);
        }
        const instance = new DropDown(models);
        return instance.show(anchor, currentModel);
    }
    static cancelIfShowing() {
        if (!DropDown.instance) {
            return;
        }
        DropDown.instance.close(null);
    }
    show(anchor, currentModel) {
        DropDown.instance = this;
        this.glassPane.setContentAnchorBox(anchor.boxInWindow());
        this.glassPane.show(this.glassPane.contentElement.ownerDocument);
        this.listControl.element.focus();
        this.listControl.selectItem(currentModel);
        return new Promise(fulfill => {
            this.selectionDone = fulfill;
        });
    }
    onMouseMove(event) {
        const node = event.target.enclosingNodeOrSelfWithClass('preview-item');
        const listItem = node && this.listControl.itemForNode(node);
        if (!listItem) {
            return;
        }
        this.listControl.selectItem(listItem);
    }
    onClick(event) {
        // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
        // @ts-expect-error
        if (!(event.target).enclosingNodeOrSelfWithClass('preview-item')) {
            return;
        }
        this.close(this.listControl.selectedItem());
    }
    onKeyDown(event) {
        switch (event.key) {
            case 'Tab':
            case 'Escape':
                this.close(null);
                break;
            case 'Enter':
                this.close(this.listControl.selectedItem());
                break;
            default:
                return;
        }
        event.consume(true);
    }
    close(model) {
        if (this.selectionDone) {
            this.selectionDone(model);
        }
        this.focusRestorer.restore();
        this.glassPane.hide();
        DropDown.instance = null;
    }
    createElementForItem(item) {
        const element = TimelineHistoryManager.previewElement(item);
        UI.ARIAUtils.markAsMenuItem(element);
        element.classList.remove('selected');
        return element;
    }
    heightForItem(_item) {
        console.assert(false, 'Should not be called');
        return 0;
    }
    isItemSelectable(_item) {
        return true;
    }
    selectedItemChanged(from, to, fromElement, toElement) {
        if (fromElement) {
            fromElement.classList.remove('selected');
        }
        if (toElement) {
            toElement.classList.add('selected');
        }
    }
    updateSelectedItemARIA(_fromElement, _toElement) {
        return false;
    }
    static instance = null;
}
export class ToolbarButton extends UI.Toolbar.ToolbarItem {
    contentElement;
    constructor(action) {
        const element = document.createElement('button');
        element.classList.add('history-dropdown-button');
        super(element);
        this.contentElement = this.element.createChild('span', 'content');
        const dropdownArrowIcon = UI.Icon.Icon.create('smallicon-triangle-down');
        this.element.appendChild(dropdownArrowIcon);
        this.element.addEventListener('click', () => void action.execute(), false);
        this.setEnabled(action.enabled());
        action.addEventListener("Enabled" /* Enabled */, event => this.setEnabled(event.data));
        this.setTitle(action.title());
    }
    setText(text) {
        this.contentElement.textContent = text;
    }
}
//# sourceMappingURL=TimelineHistoryManager.js.map