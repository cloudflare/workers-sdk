// Copyright (c) 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as SDK from '../../core/sdk/sdk.js';
export class AnimationModel extends SDK.SDKModel.SDKModel {
    runtimeModel;
    agent;
    #animationsById;
    animationGroups;
    #pendingAnimations;
    playbackRate;
    #screenshotCapture;
    #enabled;
    constructor(target) {
        super(target);
        this.runtimeModel = target.model(SDK.RuntimeModel.RuntimeModel);
        this.agent = target.animationAgent();
        target.registerAnimationDispatcher(new AnimationDispatcher(this));
        this.#animationsById = new Map();
        this.animationGroups = new Map();
        this.#pendingAnimations = new Set();
        this.playbackRate = 1;
        const resourceTreeModel = target.model(SDK.ResourceTreeModel.ResourceTreeModel);
        resourceTreeModel.addEventListener(SDK.ResourceTreeModel.Events.MainFrameNavigated, this.reset, this);
        const screenCaptureModel = target.model(SDK.ScreenCaptureModel.ScreenCaptureModel);
        if (screenCaptureModel) {
            this.#screenshotCapture = new ScreenshotCapture(this, screenCaptureModel);
        }
    }
    reset() {
        this.#animationsById.clear();
        this.animationGroups.clear();
        this.#pendingAnimations.clear();
        this.dispatchEventToListeners(Events.ModelReset);
    }
    animationCreated(id) {
        this.#pendingAnimations.add(id);
    }
    animationCanceled(id) {
        this.#pendingAnimations.delete(id);
        this.flushPendingAnimationsIfNeeded();
    }
    animationStarted(payload) {
        // We are not interested in animations without effect or target.
        if (!payload.source || !payload.source.backendNodeId) {
            return;
        }
        const animation = AnimationImpl.parsePayload(this, payload);
        if (!animation) {
            return;
        }
        // Ignore Web Animations custom effects & groups.
        const keyframesRule = animation.source().keyframesRule();
        if (animation.type() === 'WebAnimation' && keyframesRule && keyframesRule.keyframes().length === 0) {
            this.#pendingAnimations.delete(animation.id());
        }
        else {
            this.#animationsById.set(animation.id(), animation);
            this.#pendingAnimations.add(animation.id());
        }
        this.flushPendingAnimationsIfNeeded();
    }
    flushPendingAnimationsIfNeeded() {
        for (const id of this.#pendingAnimations) {
            if (!this.#animationsById.get(id)) {
                return;
            }
        }
        while (this.#pendingAnimations.size) {
            this.matchExistingGroups(this.createGroupFromPendingAnimations());
        }
    }
    matchExistingGroups(incomingGroup) {
        let matchedGroup = null;
        for (const group of this.animationGroups.values()) {
            if (group.matches(incomingGroup)) {
                matchedGroup = group;
                group.update(incomingGroup);
                break;
            }
        }
        if (!matchedGroup) {
            this.animationGroups.set(incomingGroup.id(), incomingGroup);
            if (this.#screenshotCapture) {
                this.#screenshotCapture.captureScreenshots(incomingGroup.finiteDuration(), incomingGroup.screenshotsInternal);
            }
        }
        this.dispatchEventToListeners(Events.AnimationGroupStarted, matchedGroup || incomingGroup);
        return Boolean(matchedGroup);
    }
    createGroupFromPendingAnimations() {
        console.assert(this.#pendingAnimations.size > 0);
        const firstAnimationId = this.#pendingAnimations.values().next().value;
        this.#pendingAnimations.delete(firstAnimationId);
        const firstAnimation = this.#animationsById.get(firstAnimationId);
        if (!firstAnimation) {
            throw new Error('Unable to locate first animation');
        }
        const groupedAnimations = [firstAnimation];
        const groupStartTime = firstAnimation.startTime();
        const remainingAnimations = new Set();
        for (const id of this.#pendingAnimations) {
            const anim = this.#animationsById.get(id);
            if (anim.startTime() === groupStartTime) {
                groupedAnimations.push(anim);
            }
            else {
                remainingAnimations.add(id);
            }
        }
        this.#pendingAnimations = remainingAnimations;
        return new AnimationGroup(this, firstAnimationId, groupedAnimations);
    }
    setPlaybackRate(playbackRate) {
        this.playbackRate = playbackRate;
        void this.agent.invoke_setPlaybackRate({ playbackRate });
    }
    releaseAnimations(animations) {
        void this.agent.invoke_releaseAnimations({ animations });
    }
    async suspendModel() {
        this.reset();
        await this.agent.invoke_disable();
    }
    async resumeModel() {
        if (!this.#enabled) {
            return;
        }
        await this.agent.invoke_enable();
    }
    async ensureEnabled() {
        if (this.#enabled) {
            return;
        }
        await this.agent.invoke_enable();
        this.#enabled = true;
    }
}
// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum
export var Events;
(function (Events) {
    Events["AnimationGroupStarted"] = "AnimationGroupStarted";
    Events["ModelReset"] = "ModelReset";
})(Events || (Events = {}));
export class AnimationImpl {
    #animationModel;
    #payloadInternal;
    #sourceInternal;
    #playStateInternal;
    constructor(animationModel, payload) {
        this.#animationModel = animationModel;
        this.#payloadInternal = payload;
        this.#sourceInternal =
            new AnimationEffect(animationModel, this.#payloadInternal.source);
    }
    static parsePayload(animationModel, payload) {
        return new AnimationImpl(animationModel, payload);
    }
    payload() {
        return this.#payloadInternal;
    }
    id() {
        return this.#payloadInternal.id;
    }
    name() {
        return this.#payloadInternal.name;
    }
    paused() {
        return this.#payloadInternal.pausedState;
    }
    playState() {
        return this.#playStateInternal || this.#payloadInternal.playState;
    }
    setPlayState(playState) {
        this.#playStateInternal = playState;
    }
    playbackRate() {
        return this.#payloadInternal.playbackRate;
    }
    startTime() {
        return this.#payloadInternal.startTime;
    }
    endTime() {
        if (!this.source().iterations) {
            return Infinity;
        }
        return this.startTime() + this.source().delay() + this.source().duration() * this.source().iterations() +
            this.source().endDelay();
    }
    finiteDuration() {
        const iterations = Math.min(this.source().iterations(), 3);
        return this.source().delay() + this.source().duration() * iterations;
    }
    currentTime() {
        return this.#payloadInternal.currentTime;
    }
    source() {
        return this.#sourceInternal;
    }
    type() {
        return this.#payloadInternal.type;
    }
    overlaps(animation) {
        // Infinite animations
        if (!this.source().iterations() || !animation.source().iterations()) {
            return true;
        }
        const firstAnimation = this.startTime() < animation.startTime() ? this : animation;
        const secondAnimation = firstAnimation === this ? animation : this;
        return firstAnimation.endTime() >= secondAnimation.startTime();
    }
    setTiming(duration, delay) {
        void this.#sourceInternal.node().then(node => {
            if (!node) {
                throw new Error('Unable to find node');
            }
            this.updateNodeStyle(duration, delay, node);
        });
        this.#sourceInternal.durationInternal = duration;
        this.#sourceInternal.delayInternal = delay;
        void this.#animationModel.agent.invoke_setTiming({ animationId: this.id(), duration, delay });
    }
    updateNodeStyle(duration, delay, node) {
        let animationPrefix;
        if (this.type() === "CSSTransition" /* CSSTransition */) {
            animationPrefix = 'transition-';
        }
        else if (this.type() === "CSSAnimation" /* CSSAnimation */) {
            animationPrefix = 'animation-';
        }
        else {
            return;
        }
        if (!node.id) {
            throw new Error('Node has no id');
        }
        const cssModel = node.domModel().cssModel();
        cssModel.setEffectivePropertyValueForNode(node.id, animationPrefix + 'duration', duration + 'ms');
        cssModel.setEffectivePropertyValueForNode(node.id, animationPrefix + 'delay', delay + 'ms');
    }
    async remoteObjectPromise() {
        const payload = await this.#animationModel.agent.invoke_resolveAnimation({ animationId: this.id() });
        if (!payload) {
            return null;
        }
        return this.#animationModel.runtimeModel.createRemoteObject(payload.remoteObject);
    }
    cssId() {
        return this.#payloadInternal.cssId || '';
    }
}
export class AnimationEffect {
    #animationModel;
    #payload;
    #keyframesRuleInternal;
    delayInternal;
    durationInternal;
    #deferredNodeInternal;
    constructor(animationModel, payload) {
        this.#animationModel = animationModel;
        this.#payload = payload;
        if (payload.keyframesRule) {
            this.#keyframesRuleInternal = new KeyframesRule(payload.keyframesRule);
        }
        this.delayInternal = this.#payload.delay;
        this.durationInternal = this.#payload.duration;
    }
    delay() {
        return this.delayInternal;
    }
    endDelay() {
        return this.#payload.endDelay;
    }
    iterationStart() {
        return this.#payload.iterationStart;
    }
    iterations() {
        // Animations with zero duration, zero delays and infinite iterations can't be shown.
        if (!this.delay() && !this.endDelay() && !this.duration()) {
            return 0;
        }
        return this.#payload.iterations || Infinity;
    }
    duration() {
        return this.durationInternal;
    }
    direction() {
        return this.#payload.direction;
    }
    fill() {
        return this.#payload.fill;
    }
    node() {
        if (!this.#deferredNodeInternal) {
            this.#deferredNodeInternal =
                new SDK.DOMModel.DeferredDOMNode(this.#animationModel.target(), this.backendNodeId());
        }
        return this.#deferredNodeInternal.resolvePromise();
    }
    deferredNode() {
        return new SDK.DOMModel.DeferredDOMNode(this.#animationModel.target(), this.backendNodeId());
    }
    backendNodeId() {
        return this.#payload.backendNodeId;
    }
    keyframesRule() {
        return this.#keyframesRuleInternal || null;
    }
    easing() {
        return this.#payload.easing;
    }
}
export class KeyframesRule {
    #payload;
    #keyframesInternal;
    constructor(payload) {
        this.#payload = payload;
        this.#keyframesInternal = this.#payload.keyframes.map(function (keyframeStyle) {
            return new KeyframeStyle(keyframeStyle);
        });
    }
    setKeyframesPayload(payload) {
        this.#keyframesInternal = payload.map(function (keyframeStyle) {
            return new KeyframeStyle(keyframeStyle);
        });
    }
    name() {
        return this.#payload.name;
    }
    keyframes() {
        return this.#keyframesInternal;
    }
}
export class KeyframeStyle {
    #payload;
    #offsetInternal;
    constructor(payload) {
        this.#payload = payload;
        this.#offsetInternal = this.#payload.offset;
    }
    offset() {
        return this.#offsetInternal;
    }
    setOffset(offset) {
        this.#offsetInternal = offset * 100 + '%';
    }
    offsetAsNumber() {
        return parseFloat(this.#offsetInternal) / 100;
    }
    easing() {
        return this.#payload.easing;
    }
}
export class AnimationGroup {
    #animationModel;
    #idInternal;
    #animationsInternal;
    #pausedInternal;
    screenshotsInternal;
    #screenshotImages;
    constructor(animationModel, id, animations) {
        this.#animationModel = animationModel;
        this.#idInternal = id;
        this.#animationsInternal = animations;
        this.#pausedInternal = false;
        this.screenshotsInternal = [];
        this.#screenshotImages = [];
    }
    id() {
        return this.#idInternal;
    }
    animations() {
        return this.#animationsInternal;
    }
    release() {
        this.#animationModel.animationGroups.delete(this.id());
        this.#animationModel.releaseAnimations(this.animationIds());
    }
    animationIds() {
        function extractId(animation) {
            return animation.id();
        }
        return this.#animationsInternal.map(extractId);
    }
    startTime() {
        return this.#animationsInternal[0].startTime();
    }
    finiteDuration() {
        let maxDuration = 0;
        for (let i = 0; i < this.#animationsInternal.length; ++i) {
            maxDuration = Math.max(maxDuration, this.#animationsInternal[i].finiteDuration());
        }
        return maxDuration;
    }
    seekTo(currentTime) {
        void this.#animationModel.agent.invoke_seekAnimations({ animations: this.animationIds(), currentTime });
    }
    paused() {
        return this.#pausedInternal;
    }
    togglePause(paused) {
        if (paused === this.#pausedInternal) {
            return;
        }
        this.#pausedInternal = paused;
        void this.#animationModel.agent.invoke_setPaused({ animations: this.animationIds(), paused });
    }
    currentTimePromise() {
        let longestAnim = null;
        for (const anim of this.#animationsInternal) {
            if (!longestAnim || anim.endTime() > longestAnim.endTime()) {
                longestAnim = anim;
            }
        }
        if (!longestAnim) {
            throw new Error('No longest animation found');
        }
        return this.#animationModel.agent.invoke_getCurrentTime({ id: longestAnim.id() })
            .then(({ currentTime }) => currentTime || 0);
    }
    matches(group) {
        function extractId(anim) {
            if (anim.type() === "WebAnimation" /* WebAnimation */) {
                return anim.type() + anim.id();
            }
            return anim.cssId();
        }
        if (this.#animationsInternal.length !== group.#animationsInternal.length) {
            return false;
        }
        const left = this.#animationsInternal.map(extractId).sort();
        const right = group.#animationsInternal.map(extractId).sort();
        for (let i = 0; i < left.length; i++) {
            if (left[i] !== right[i]) {
                return false;
            }
        }
        return true;
    }
    update(group) {
        this.#animationModel.releaseAnimations(this.animationIds());
        this.#animationsInternal = group.#animationsInternal;
    }
    screenshots() {
        for (let i = 0; i < this.screenshotsInternal.length; ++i) {
            const image = new Image();
            image.src = 'data:image/jpeg;base64,' + this.screenshotsInternal[i];
            this.#screenshotImages.push(image);
        }
        this.screenshotsInternal = [];
        return this.#screenshotImages;
    }
}
export class AnimationDispatcher {
    #animationModel;
    constructor(animationModel) {
        this.#animationModel = animationModel;
    }
    animationCreated({ id }) {
        this.#animationModel.animationCreated(id);
    }
    animationCanceled({ id }) {
        this.#animationModel.animationCanceled(id);
    }
    animationStarted({ animation }) {
        this.#animationModel.animationStarted(animation);
    }
}
export class ScreenshotCapture {
    #requests;
    #screenCaptureModel;
    #animationModel;
    #stopTimer;
    #endTime;
    #capturing;
    constructor(animationModel, screenCaptureModel) {
        this.#requests = [];
        this.#screenCaptureModel = screenCaptureModel;
        this.#animationModel = animationModel;
        this.#animationModel.addEventListener(Events.ModelReset, this.stopScreencast, this);
    }
    captureScreenshots(duration, screenshots) {
        const screencastDuration = Math.min(duration / this.#animationModel.playbackRate, 3000);
        const endTime = screencastDuration + window.performance.now();
        this.#requests.push({ endTime: endTime, screenshots: screenshots });
        if (!this.#endTime || endTime > this.#endTime) {
            clearTimeout(this.#stopTimer);
            this.#stopTimer = window.setTimeout(this.stopScreencast.bind(this), screencastDuration);
            this.#endTime = endTime;
        }
        if (this.#capturing) {
            return;
        }
        this.#capturing = true;
        this.#screenCaptureModel.startScreencast("jpeg" /* Jpeg */, 80, undefined, 300, 2, this.screencastFrame.bind(this), _visible => { });
    }
    screencastFrame(base64Data, _metadata) {
        function isAnimating(request) {
            return request.endTime >= now;
        }
        if (!this.#capturing) {
            return;
        }
        const now = window.performance.now();
        this.#requests = this.#requests.filter(isAnimating);
        for (const request of this.#requests) {
            request.screenshots.push(base64Data);
        }
    }
    stopScreencast() {
        if (!this.#capturing) {
            return;
        }
        this.#stopTimer = undefined;
        this.#endTime = undefined;
        this.#requests = [];
        this.#capturing = false;
        this.#screenCaptureModel.stopScreencast();
    }
}
SDK.SDKModel.SDKModel.register(AnimationModel, { capabilities: SDK.Target.Capability.DOM, autostart: false });
//# sourceMappingURL=AnimationModel.js.map