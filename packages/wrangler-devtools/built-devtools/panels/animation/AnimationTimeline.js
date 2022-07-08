// Copyright (c) 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as Host from '../../core/host/host.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as Platform from '../../core/platform/platform.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as UI from '../../ui/legacy/legacy.js';
import { AnimationGroupPreviewUI } from './AnimationGroupPreviewUI.js';
import animationTimelineStyles from './animationTimeline.css.js';
import { AnimationModel, Events } from './AnimationModel.js';
import { AnimationScreenshotPopover } from './AnimationScreenshotPopover.js';
import { AnimationUI } from './AnimationUI.js';
const UIStrings = {
    /**
    *@description Timeline hint text content in Animation Timeline of the Animation Inspector
    */
    selectAnEffectAboveToInspectAnd: 'Select an effect above to inspect and modify.',
    /**
    *@description Text to clear everything
    */
    clearAll: 'Clear all',
    /**
    *@description Tooltip text that appears when hovering over largeicon pause button in Animation Timeline of the Animation Inspector
    */
    pauseAll: 'Pause all',
    /**
    *@description Title of the playback rate button listbox
    */
    playbackRates: 'Playback rates',
    /**
    *@description Text in Animation Timeline of the Animation Inspector
    *@example {50} PH1
    */
    playbackRatePlaceholder: '{PH1}%',
    /**
    *@description Text of an item that pause the running task
    */
    pause: 'Pause',
    /**
    *@description Button title in Animation Timeline of the Animation Inspector
    *@example {50%} PH1
    */
    setSpeedToS: 'Set speed to {PH1}',
    /**
    *@description Title of Animation Previews listbox
    */
    animationPreviews: 'Animation previews',
    /**
    *@description Empty buffer hint text content in Animation Timeline of the Animation Inspector
    */
    waitingForAnimations: 'Waiting for animations...',
    /**
    *@description Tooltip text that appears when hovering over largeicon replay animation button in Animation Timeline of the Animation Inspector
    */
    replayTimeline: 'Replay timeline',
    /**
    *@description Text in Animation Timeline of the Animation Inspector
    */
    resumeAll: 'Resume all',
    /**
    *@description Title of control button in animation timeline of the animation inspector
    */
    playTimeline: 'Play timeline',
    /**
    *@description Title of control button in animation timeline of the animation inspector
    */
    pauseTimeline: 'Pause timeline',
    /**
    *@description Title of a specific Animation Preview
    *@example {1} PH1
    */
    animationPreviewS: 'Animation Preview {PH1}',
};
const str_ = i18n.i18n.registerUIStrings('panels/animation/AnimationTimeline.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
const nodeUIsByNode = new WeakMap();
const playbackRates = new WeakMap();
let animationTimelineInstance;
export class AnimationTimeline extends UI.Widget.VBox {
    #gridWrapper;
    #grid;
    #playbackRate;
    #allPaused;
    #animationsContainer;
    #playbackRateButtons;
    #previewContainer;
    #timelineScrubber;
    #currentTime;
    #popoverHelper;
    #clearButton;
    #selectedGroup;
    #renderQueue;
    #defaultDuration;
    #durationInternal;
    #timelineControlsWidth;
    #nodesMap;
    #uiAnimations;
    #groupBuffer;
    #previewMap;
    #animationsMap;
    #timelineScrubberLine;
    #pauseButton;
    #controlButton;
    #controlState;
    #redrawing;
    #cachedTimelineWidth;
    #cachedTimelineHeight;
    #scrubberPlayer;
    #gridOffsetLeft;
    #originalScrubberTime;
    #originalMousePosition;
    constructor() {
        super(true);
        this.element.classList.add('animations-timeline');
        this.#gridWrapper = this.contentElement.createChild('div', 'grid-overflow-wrapper');
        this.#grid = UI.UIUtils.createSVGChild(this.#gridWrapper, 'svg', 'animation-timeline-grid');
        this.#playbackRate = 1;
        this.#allPaused = false;
        this.createHeader();
        this.#animationsContainer = this.contentElement.createChild('div', 'animation-timeline-rows');
        const timelineHint = this.contentElement.createChild('div', 'animation-timeline-rows-hint');
        timelineHint.textContent = i18nString(UIStrings.selectAnEffectAboveToInspectAnd);
        /** @const */ this.#defaultDuration = 100;
        this.#durationInternal = this.#defaultDuration;
        /** @const */ this.#timelineControlsWidth = 150;
        this.#nodesMap = new Map();
        this.#uiAnimations = [];
        this.#groupBuffer = [];
        this.#previewMap = new Map();
        this.#animationsMap = new Map();
        SDK.TargetManager.TargetManager.instance().addModelListener(SDK.DOMModel.DOMModel, SDK.DOMModel.Events.NodeRemoved, this.nodeRemoved, this);
        SDK.TargetManager.TargetManager.instance().observeModels(AnimationModel, this);
        UI.Context.Context.instance().addFlavorChangeListener(SDK.DOMModel.DOMNode, this.nodeChanged, this);
    }
    static instance() {
        if (!animationTimelineInstance) {
            animationTimelineInstance = new AnimationTimeline();
        }
        return animationTimelineInstance;
    }
    get previewMap() {
        return this.#previewMap;
    }
    get uiAnimations() {
        return this.#uiAnimations;
    }
    get groupBuffer() {
        return this.#groupBuffer;
    }
    wasShown() {
        for (const animationModel of SDK.TargetManager.TargetManager.instance().models(AnimationModel)) {
            this.addEventListeners(animationModel);
        }
        this.registerCSSFiles([animationTimelineStyles]);
    }
    willHide() {
        for (const animationModel of SDK.TargetManager.TargetManager.instance().models(AnimationModel)) {
            this.removeEventListeners(animationModel);
        }
        if (this.#popoverHelper) {
            this.#popoverHelper.hidePopover();
        }
    }
    modelAdded(animationModel) {
        if (this.isShowing()) {
            this.addEventListeners(animationModel);
        }
    }
    modelRemoved(animationModel) {
        this.removeEventListeners(animationModel);
    }
    addEventListeners(animationModel) {
        void animationModel.ensureEnabled();
        animationModel.addEventListener(Events.AnimationGroupStarted, this.animationGroupStarted, this);
        animationModel.addEventListener(Events.ModelReset, this.reset, this);
    }
    removeEventListeners(animationModel) {
        animationModel.removeEventListener(Events.AnimationGroupStarted, this.animationGroupStarted, this);
        animationModel.removeEventListener(Events.ModelReset, this.reset, this);
    }
    nodeChanged() {
        for (const nodeUI of this.#nodesMap.values()) {
            nodeUI.nodeChanged();
        }
    }
    createScrubber() {
        this.#timelineScrubber = document.createElement('div');
        this.#timelineScrubber.classList.add('animation-scrubber');
        this.#timelineScrubber.classList.add('hidden');
        this.#timelineScrubberLine = this.#timelineScrubber.createChild('div', 'animation-scrubber-line');
        this.#timelineScrubberLine.createChild('div', 'animation-scrubber-head');
        this.#timelineScrubber.createChild('div', 'animation-time-overlay');
        return this.#timelineScrubber;
    }
    createHeader() {
        const toolbarContainer = this.contentElement.createChild('div', 'animation-timeline-toolbar-container');
        const topToolbar = new UI.Toolbar.Toolbar('animation-timeline-toolbar', toolbarContainer);
        this.#clearButton = new UI.Toolbar.ToolbarButton(i18nString(UIStrings.clearAll), 'largeicon-clear');
        this.#clearButton.addEventListener(UI.Toolbar.ToolbarButton.Events.Click, this.reset.bind(this));
        topToolbar.appendToolbarItem(this.#clearButton);
        topToolbar.appendSeparator();
        this.#pauseButton =
            new UI.Toolbar.ToolbarToggle(i18nString(UIStrings.pauseAll), 'largeicon-pause', 'largeicon-resume');
        this.#pauseButton.addEventListener(UI.Toolbar.ToolbarButton.Events.Click, this.togglePauseAll.bind(this));
        topToolbar.appendToolbarItem(this.#pauseButton);
        const playbackRateControl = toolbarContainer.createChild('div', 'animation-playback-rate-control');
        playbackRateControl.addEventListener('keydown', this.handlePlaybackRateControlKeyDown.bind(this));
        UI.ARIAUtils.markAsListBox(playbackRateControl);
        UI.ARIAUtils.setAccessibleName(playbackRateControl, i18nString(UIStrings.playbackRates));
        this.#playbackRateButtons = [];
        for (const playbackRate of GlobalPlaybackRates) {
            const button = playbackRateControl.createChild('button', 'animation-playback-rate-button');
            button.textContent = playbackRate ? i18nString(UIStrings.playbackRatePlaceholder, { PH1: playbackRate * 100 }) :
                i18nString(UIStrings.pause);
            playbackRates.set(button, playbackRate);
            button.addEventListener('click', this.setPlaybackRate.bind(this, playbackRate));
            UI.ARIAUtils.markAsOption(button);
            UI.Tooltip.Tooltip.install(button, i18nString(UIStrings.setSpeedToS, { PH1: button.textContent }));
            button.tabIndex = -1;
            this.#playbackRateButtons.push(button);
        }
        this.updatePlaybackControls();
        this.#previewContainer = this.contentElement.createChild('div', 'animation-timeline-buffer');
        UI.ARIAUtils.markAsListBox(this.#previewContainer);
        UI.ARIAUtils.setAccessibleName(this.#previewContainer, i18nString(UIStrings.animationPreviews));
        this.#popoverHelper = new UI.PopoverHelper.PopoverHelper(this.#previewContainer, this.getPopoverRequest.bind(this));
        this.#popoverHelper.setDisableOnClick(true);
        this.#popoverHelper.setTimeout(0);
        const emptyBufferHint = this.contentElement.createChild('div', 'animation-timeline-buffer-hint');
        emptyBufferHint.textContent = i18nString(UIStrings.waitingForAnimations);
        const container = this.contentElement.createChild('div', 'animation-timeline-header');
        const controls = container.createChild('div', 'animation-controls');
        this.#currentTime = controls.createChild('div', 'animation-timeline-current-time monospace');
        const toolbar = new UI.Toolbar.Toolbar('animation-controls-toolbar', controls);
        this.#controlButton =
            new UI.Toolbar.ToolbarToggle(i18nString(UIStrings.replayTimeline), 'largeicon-replay-animation');
        this.#controlState = "replay-outline" /* Replay */;
        this.#controlButton.setToggled(true);
        this.#controlButton.addEventListener(UI.Toolbar.ToolbarButton.Events.Click, this.controlButtonToggle.bind(this));
        toolbar.appendToolbarItem(this.#controlButton);
        const gridHeader = container.createChild('div', 'animation-grid-header');
        UI.UIUtils.installDragHandle(gridHeader, this.repositionScrubber.bind(this), this.scrubberDragMove.bind(this), this.scrubberDragEnd.bind(this), 'text');
        this.#gridWrapper.appendChild(this.createScrubber());
        if (this.#timelineScrubberLine) {
            UI.UIUtils.installDragHandle(this.#timelineScrubberLine, this.scrubberDragStart.bind(this), this.scrubberDragMove.bind(this), this.scrubberDragEnd.bind(this), 'col-resize');
        }
        this.#currentTime.textContent = '';
        return container;
    }
    handlePlaybackRateControlKeyDown(event) {
        const keyboardEvent = event;
        switch (keyboardEvent.key) {
            case 'ArrowLeft':
            case 'ArrowUp':
                this.focusNextPlaybackRateButton(event.target, /* focusPrevious */ true);
                break;
            case 'ArrowRight':
            case 'ArrowDown':
                this.focusNextPlaybackRateButton(event.target);
                break;
        }
    }
    focusNextPlaybackRateButton(target, focusPrevious) {
        const button = target;
        const currentIndex = this.#playbackRateButtons.indexOf(button);
        const nextIndex = focusPrevious ? currentIndex - 1 : currentIndex + 1;
        if (nextIndex < 0 || nextIndex >= this.#playbackRateButtons.length) {
            return;
        }
        const nextButton = this.#playbackRateButtons[nextIndex];
        nextButton.tabIndex = 0;
        nextButton.focus();
        if (target) {
            target.tabIndex = -1;
        }
    }
    getPopoverRequest(event) {
        const element = event.target;
        if (!element || !element.isDescendant(this.#previewContainer)) {
            return null;
        }
        return {
            box: element.boxInWindow(),
            show: (popover) => {
                let animGroup;
                for (const [group, previewUI] of this.#previewMap) {
                    if (previewUI.element === element || previewUI.element === element.parentElement) {
                        animGroup = group;
                    }
                }
                console.assert(typeof animGroup !== 'undefined');
                if (!animGroup) {
                    return Promise.resolve(false);
                }
                const screenshots = animGroup.screenshots();
                if (!screenshots.length) {
                    return Promise.resolve(false);
                }
                let fulfill;
                const promise = new Promise(x => {
                    fulfill = x;
                });
                if (!screenshots[0].complete) {
                    screenshots[0].onload = onFirstScreenshotLoaded.bind(null, screenshots);
                }
                else {
                    onFirstScreenshotLoaded(screenshots);
                }
                return promise;
                function onFirstScreenshotLoaded(screenshots) {
                    new AnimationScreenshotPopover(screenshots).show(popover.contentElement);
                    fulfill(true);
                }
            },
            hide: undefined,
        };
    }
    togglePauseAll() {
        this.#allPaused = !this.#allPaused;
        if (this.#pauseButton) {
            this.#pauseButton.setToggled(this.#allPaused);
        }
        this.setPlaybackRate(this.#playbackRate);
        if (this.#pauseButton) {
            this.#pauseButton.setTitle(this.#allPaused ? i18nString(UIStrings.resumeAll) : i18nString(UIStrings.pauseAll));
        }
    }
    setPlaybackRate(playbackRate) {
        this.#playbackRate = playbackRate;
        for (const animationModel of SDK.TargetManager.TargetManager.instance().models(AnimationModel)) {
            animationModel.setPlaybackRate(this.#allPaused ? 0 : this.#playbackRate);
        }
        Host.userMetrics.actionTaken(Host.UserMetrics.Action.AnimationsPlaybackRateChanged);
        if (this.#scrubberPlayer) {
            this.#scrubberPlayer.playbackRate = this.effectivePlaybackRate();
        }
        this.updatePlaybackControls();
    }
    updatePlaybackControls() {
        for (const button of this.#playbackRateButtons) {
            const selected = this.#playbackRate === playbackRates.get(button);
            button.classList.toggle('selected', selected);
            button.tabIndex = selected ? 0 : -1;
        }
    }
    controlButtonToggle() {
        if (this.#controlState === "play-outline" /* Play */) {
            this.togglePause(false);
        }
        else if (this.#controlState === "replay-outline" /* Replay */) {
            this.replay();
        }
        else {
            this.togglePause(true);
        }
    }
    updateControlButton() {
        if (!this.#controlButton) {
            return;
        }
        this.#controlButton.setEnabled(Boolean(this.#selectedGroup));
        if (this.#selectedGroup && this.#selectedGroup.paused()) {
            this.#controlState = "play-outline" /* Play */;
            this.#controlButton.setToggled(true);
            this.#controlButton.setTitle(i18nString(UIStrings.playTimeline));
            this.#controlButton.setGlyph('largeicon-play-animation');
        }
        else if (!this.#scrubberPlayer || !this.#scrubberPlayer.currentTime ||
            this.#scrubberPlayer.currentTime >= this.duration()) {
            this.#controlState = "replay-outline" /* Replay */;
            this.#controlButton.setToggled(true);
            this.#controlButton.setTitle(i18nString(UIStrings.replayTimeline));
            this.#controlButton.setGlyph('largeicon-replay-animation');
        }
        else {
            this.#controlState = "pause-outline" /* Pause */;
            this.#controlButton.setToggled(false);
            this.#controlButton.setTitle(i18nString(UIStrings.pauseTimeline));
            this.#controlButton.setGlyph('largeicon-pause-animation');
        }
    }
    effectivePlaybackRate() {
        return (this.#allPaused || (this.#selectedGroup && this.#selectedGroup.paused())) ? 0 : this.#playbackRate;
    }
    togglePause(pause) {
        if (this.#selectedGroup) {
            this.#selectedGroup.togglePause(pause);
            const preview = this.#previewMap.get(this.#selectedGroup);
            if (preview) {
                preview.element.classList.toggle('paused', pause);
            }
        }
        if (this.#scrubberPlayer) {
            this.#scrubberPlayer.playbackRate = this.effectivePlaybackRate();
        }
        this.updateControlButton();
    }
    replay() {
        if (!this.#selectedGroup) {
            return;
        }
        this.#selectedGroup.seekTo(0);
        this.animateTime(0);
        this.updateControlButton();
    }
    duration() {
        return this.#durationInternal;
    }
    setDuration(duration) {
        this.#durationInternal = duration;
        this.scheduleRedraw();
    }
    clearTimeline() {
        this.#uiAnimations = [];
        this.#nodesMap.clear();
        this.#animationsMap.clear();
        this.#animationsContainer.removeChildren();
        this.#durationInternal = this.#defaultDuration;
        this.#timelineScrubber.classList.add('hidden');
        this.#selectedGroup = null;
        if (this.#scrubberPlayer) {
            this.#scrubberPlayer.cancel();
        }
        this.#scrubberPlayer = undefined;
        this.#currentTime.textContent = '';
        this.updateControlButton();
    }
    reset() {
        this.clearTimeline();
        if (this.#allPaused) {
            this.togglePauseAll();
        }
        else {
            this.setPlaybackRate(this.#playbackRate);
        }
        for (const group of this.#groupBuffer) {
            group.release();
        }
        this.#groupBuffer = [];
        this.#previewMap.clear();
        this.#previewContainer.removeChildren();
        this.#popoverHelper.hidePopover();
        this.renderGrid();
    }
    animationGroupStarted({ data }) {
        this.addAnimationGroup(data);
    }
    addAnimationGroup(group) {
        function startTimeComparator(left, right) {
            if (left.startTime() === right.startTime()) {
                return 0;
            }
            return left.startTime() > right.startTime() ? 1 : -1;
        }
        const previewGroup = this.#previewMap.get(group);
        if (previewGroup) {
            if (this.#selectedGroup === group) {
                this.syncScrubber();
            }
            else {
                previewGroup.replay();
            }
            return;
        }
        this.#groupBuffer.sort(startTimeComparator);
        // Discard oldest groups from buffer if necessary
        const groupsToDiscard = [];
        const bufferSize = this.width() / 50;
        while (this.#groupBuffer.length > bufferSize) {
            const toDiscard = this.#groupBuffer.splice(this.#groupBuffer[0] === this.#selectedGroup ? 1 : 0, 1);
            groupsToDiscard.push(toDiscard[0]);
        }
        for (const g of groupsToDiscard) {
            const discardGroup = this.#previewMap.get(g);
            if (!discardGroup) {
                continue;
            }
            discardGroup.element.remove();
            this.#previewMap.delete(g);
            g.release();
        }
        // Generate preview
        const preview = new AnimationGroupPreviewUI(group);
        this.#groupBuffer.push(group);
        this.#previewMap.set(group, preview);
        this.#previewContainer.appendChild(preview.element);
        preview.removeButton().addEventListener('click', this.removeAnimationGroup.bind(this, group));
        preview.element.addEventListener('click', this.selectAnimationGroup.bind(this, group));
        preview.element.addEventListener('keydown', this.handleAnimationGroupKeyDown.bind(this, group));
        UI.ARIAUtils.setAccessibleName(preview.element, i18nString(UIStrings.animationPreviewS, { PH1: this.#groupBuffer.indexOf(group) + 1 }));
        UI.ARIAUtils.markAsOption(preview.element);
        if (this.#previewMap.size === 1) {
            const preview = this.#previewMap.get(this.#groupBuffer[0]);
            if (preview) {
                preview.element.tabIndex = 0;
            }
        }
    }
    handleAnimationGroupKeyDown(group, event) {
        switch (event.key) {
            case ' ':
            case 'Enter':
                this.selectAnimationGroup(group);
                break;
            case 'Backspace':
            case 'Delete':
                this.removeAnimationGroup(group, event);
                break;
            case 'ArrowLeft':
            case 'ArrowUp':
                this.focusNextGroup(group, /* target */ event.target, /* focusPrevious */ true);
                break;
            case 'ArrowRight':
            case 'ArrowDown':
                this.focusNextGroup(group, /* target */ event.target);
        }
    }
    focusNextGroup(group, target, focusPrevious) {
        const currentGroupIndex = this.#groupBuffer.indexOf(group);
        const nextIndex = focusPrevious ? currentGroupIndex - 1 : currentGroupIndex + 1;
        if (nextIndex < 0 || nextIndex >= this.#groupBuffer.length) {
            return;
        }
        const preview = this.#previewMap.get(this.#groupBuffer[nextIndex]);
        if (preview) {
            preview.element.tabIndex = 0;
            preview.element.focus();
        }
        if (target) {
            target.tabIndex = -1;
        }
    }
    removeAnimationGroup(group, event) {
        const currentGroupIndex = this.#groupBuffer.indexOf(group);
        Platform.ArrayUtilities.removeElement(this.#groupBuffer, group);
        const previewGroup = this.#previewMap.get(group);
        if (previewGroup) {
            previewGroup.element.remove();
        }
        this.#previewMap.delete(group);
        group.release();
        event.consume(true);
        if (this.#selectedGroup === group) {
            this.clearTimeline();
            this.renderGrid();
        }
        const groupLength = this.#groupBuffer.length;
        if (groupLength === 0) {
            this.#clearButton.element.focus();
            return;
        }
        const nextGroup = currentGroupIndex >= this.#groupBuffer.length ?
            this.#previewMap.get(this.#groupBuffer[this.#groupBuffer.length - 1]) :
            this.#previewMap.get(this.#groupBuffer[currentGroupIndex]);
        if (nextGroup) {
            nextGroup.element.tabIndex = 0;
            nextGroup.element.focus();
        }
    }
    selectAnimationGroup(group) {
        function applySelectionClass(ui, group) {
            ui.element.classList.toggle('selected', this.#selectedGroup === group);
        }
        if (this.#selectedGroup === group) {
            this.togglePause(false);
            this.replay();
            return;
        }
        this.clearTimeline();
        this.#selectedGroup = group;
        this.#previewMap.forEach(applySelectionClass, this);
        this.setDuration(Math.max(500, group.finiteDuration() + 100));
        for (const anim of group.animations()) {
            this.addAnimation(anim);
        }
        this.scheduleRedraw();
        this.#timelineScrubber.classList.remove('hidden');
        this.togglePause(false);
        this.replay();
    }
    addAnimation(animation) {
        function nodeResolved(node) {
            uiAnimation.setNode(node);
            if (node && nodeUI) {
                nodeUI.nodeResolved(node);
                nodeUIsByNode.set(node, nodeUI);
            }
        }
        let nodeUI = this.#nodesMap.get(animation.source().backendNodeId());
        if (!nodeUI) {
            nodeUI = new NodeUI(animation.source());
            this.#animationsContainer.appendChild(nodeUI.element);
            this.#nodesMap.set(animation.source().backendNodeId(), nodeUI);
        }
        const nodeRow = nodeUI.createNewRow();
        const uiAnimation = new AnimationUI(animation, this, nodeRow);
        animation.source().deferredNode().resolve(nodeResolved.bind(this));
        this.#uiAnimations.push(uiAnimation);
        this.#animationsMap.set(animation.id(), animation);
    }
    nodeRemoved(event) {
        const { node } = event.data;
        const nodeUI = nodeUIsByNode.get(node);
        if (nodeUI) {
            nodeUI.nodeRemoved();
        }
    }
    renderGrid() {
        /** @const */ const gridSize = 250;
        const gridWidth = (this.width() + 10).toString();
        const gridHeight = ((this.#cachedTimelineHeight || 0) + 30).toString();
        this.#gridWrapper.style.width = gridWidth + 'px';
        this.#gridWrapper.style.height = gridHeight.toString() + 'px';
        this.#grid.setAttribute('width', gridWidth);
        this.#grid.setAttribute('height', gridHeight.toString());
        this.#grid.setAttribute('shape-rendering', 'crispEdges');
        this.#grid.removeChildren();
        let lastDraw = undefined;
        for (let time = 0; time < this.duration(); time += gridSize) {
            const line = UI.UIUtils.createSVGChild(this.#grid, 'rect', 'animation-timeline-grid-line');
            line.setAttribute('x', (time * this.pixelMsRatio() + 10).toString());
            line.setAttribute('y', '23');
            line.setAttribute('height', '100%');
            line.setAttribute('width', '1');
        }
        for (let time = 0; time < this.duration(); time += gridSize) {
            const gridWidth = time * this.pixelMsRatio();
            if (lastDraw === undefined || gridWidth - lastDraw > 50) {
                lastDraw = gridWidth;
                const label = UI.UIUtils.createSVGChild(this.#grid, 'text', 'animation-timeline-grid-label');
                label.textContent = i18n.TimeUtilities.millisToString(time);
                label.setAttribute('x', (gridWidth + 10).toString());
                label.setAttribute('y', '16');
            }
        }
    }
    scheduleRedraw() {
        this.#renderQueue = [];
        for (const ui of this.#uiAnimations) {
            this.#renderQueue.push(ui);
        }
        if (this.#redrawing) {
            return;
        }
        this.#redrawing = true;
        this.renderGrid();
        this.#animationsContainer.window().requestAnimationFrame(this.render.bind(this));
    }
    render(timestamp) {
        while (this.#renderQueue.length && (!timestamp || window.performance.now() - timestamp < 50)) {
            const animationUI = this.#renderQueue.shift();
            if (animationUI) {
                animationUI.redraw();
            }
        }
        if (this.#renderQueue.length) {
            this.#animationsContainer.window().requestAnimationFrame(this.render.bind(this));
        }
        else {
            this.#redrawing = undefined;
        }
    }
    onResize() {
        this.#cachedTimelineWidth = Math.max(0, this.#animationsContainer.offsetWidth - this.#timelineControlsWidth) || 0;
        this.#cachedTimelineHeight = this.#animationsContainer.offsetHeight;
        this.scheduleRedraw();
        if (this.#scrubberPlayer) {
            this.syncScrubber();
        }
        this.#gridOffsetLeft = undefined;
    }
    width() {
        return this.#cachedTimelineWidth || 0;
    }
    resizeWindow(animation) {
        let resized = false;
        // This shows at most 3 iterations
        const duration = animation.source().duration() * Math.min(2, animation.source().iterations());
        const requiredDuration = animation.source().delay() + duration + animation.source().endDelay();
        if (requiredDuration > this.#durationInternal) {
            resized = true;
            this.#durationInternal = requiredDuration + 200;
        }
        return resized;
    }
    syncScrubber() {
        if (!this.#selectedGroup) {
            return;
        }
        void this.#selectedGroup.currentTimePromise()
            .then(this.animateTime.bind(this))
            .then(this.updateControlButton.bind(this));
    }
    animateTime(currentTime) {
        if (this.#scrubberPlayer) {
            this.#scrubberPlayer.cancel();
        }
        this.#scrubberPlayer = this.#timelineScrubber.animate([{ transform: 'translateX(0px)' }, { transform: 'translateX(' + this.width() + 'px)' }], { duration: this.duration(), fill: 'forwards' });
        this.#scrubberPlayer.playbackRate = this.effectivePlaybackRate();
        this.#scrubberPlayer.onfinish = this.updateControlButton.bind(this);
        this.#scrubberPlayer.currentTime = currentTime;
        this.element.window().requestAnimationFrame(this.updateScrubber.bind(this));
    }
    pixelMsRatio() {
        return this.width() / this.duration() || 0;
    }
    updateScrubber(_timestamp) {
        if (!this.#scrubberPlayer) {
            return;
        }
        this.#currentTime.textContent = i18n.TimeUtilities.millisToString(this.#scrubberPlayer.currentTime || 0);
        if (this.#scrubberPlayer.playState.toString() === 'pending' || this.#scrubberPlayer.playState === 'running') {
            this.element.window().requestAnimationFrame(this.updateScrubber.bind(this));
        }
        else if (this.#scrubberPlayer.playState === 'finished') {
            this.#currentTime.textContent = '';
        }
    }
    repositionScrubber(event) {
        if (!this.#selectedGroup) {
            return false;
        }
        // Seek to current mouse position.
        if (!this.#gridOffsetLeft) {
            this.#gridOffsetLeft = this.#grid.totalOffsetLeft() + 10;
        }
        const { x } = event; // eslint-disable-line @typescript-eslint/no-explicit-any
        const seekTime = Math.max(0, x - this.#gridOffsetLeft) / this.pixelMsRatio();
        this.#selectedGroup.seekTo(seekTime);
        this.togglePause(true);
        this.animateTime(seekTime);
        // Interface with scrubber drag.
        this.#originalScrubberTime = seekTime;
        this.#originalMousePosition = x;
        return true;
    }
    scrubberDragStart(event) {
        if (!this.#scrubberPlayer || !this.#selectedGroup) {
            return false;
        }
        this.#originalScrubberTime = this.#scrubberPlayer.currentTime;
        this.#timelineScrubber.classList.remove('animation-timeline-end');
        this.#scrubberPlayer.pause();
        const { x } = event; // eslint-disable-line @typescript-eslint/no-explicit-any
        this.#originalMousePosition = x;
        this.togglePause(true);
        return true;
    }
    scrubberDragMove(event) {
        const { x } = event; // eslint-disable-line @typescript-eslint/no-explicit-any
        const delta = x - (this.#originalMousePosition || 0);
        const currentTime = Math.max(0, Math.min((this.#originalScrubberTime || 0) + delta / this.pixelMsRatio(), this.duration()));
        if (this.#scrubberPlayer) {
            this.#scrubberPlayer.currentTime = currentTime;
        }
        this.#currentTime.textContent = i18n.TimeUtilities.millisToString(Math.round(currentTime));
        if (this.#selectedGroup) {
            this.#selectedGroup.seekTo(currentTime);
        }
    }
    scrubberDragEnd(_event) {
        if (this.#scrubberPlayer) {
            const currentTime = Math.max(0, this.#scrubberPlayer.currentTime || 0);
            this.#scrubberPlayer.play();
            this.#scrubberPlayer.currentTime = currentTime;
        }
        this.#currentTime.window().requestAnimationFrame(this.updateScrubber.bind(this));
    }
}
export const GlobalPlaybackRates = [1, 0.25, 0.1];
export class NodeUI {
    element;
    #description;
    #timelineElement;
    #node;
    constructor(_animationEffect) {
        this.element = document.createElement('div');
        this.element.classList.add('animation-node-row');
        this.#description = this.element.createChild('div', 'animation-node-description');
        this.#timelineElement = this.element.createChild('div', 'animation-node-timeline');
        UI.ARIAUtils.markAsApplication(this.#timelineElement);
    }
    nodeResolved(node) {
        if (!node) {
            UI.UIUtils.createTextChild(this.#description, '<node>');
            return;
        }
        this.#node = node;
        this.nodeChanged();
        void Common.Linkifier.Linkifier.linkify(node).then(link => this.#description.appendChild(link));
        if (!node.ownerDocument) {
            this.nodeRemoved();
        }
    }
    createNewRow() {
        return this.#timelineElement.createChild('div', 'animation-timeline-row');
    }
    nodeRemoved() {
        this.element.classList.add('animation-node-removed');
        this.#node = null;
    }
    nodeChanged() {
        let animationNodeSelected = false;
        if (this.#node) {
            animationNodeSelected = (this.#node === UI.Context.Context.instance().flavor(SDK.DOMModel.DOMNode));
        }
        this.element.classList.toggle('animation-node-selected', animationNodeSelected);
    }
}
export class StepTimingFunction {
    steps;
    stepAtPosition;
    constructor(steps, stepAtPosition) {
        this.steps = steps;
        this.stepAtPosition = stepAtPosition;
    }
    static parse(text) {
        let match = text.match(/^steps\((\d+), (start|middle)\)$/);
        if (match) {
            return new StepTimingFunction(parseInt(match[1], 10), match[2]);
        }
        match = text.match(/^steps\((\d+)\)$/);
        if (match) {
            return new StepTimingFunction(parseInt(match[1], 10), 'end');
        }
        return null;
    }
}
//# sourceMappingURL=AnimationTimeline.js.map