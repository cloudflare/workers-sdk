// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../common/common.js';
import * as i18n from '../i18n/i18n.js';
import * as Root from '../root/root.js';
import { DebuggerModel, Events as DebuggerModelEvents } from './DebuggerModel.js';
import { DeferredDOMNode, DOMModel, Events as DOMModelEvents } from './DOMModel.js';
import { OverlayPersistentHighlighter } from './OverlayPersistentHighlighter.js';
import { Capability } from './Target.js';
import { SDKModel } from './SDKModel.js';
import { TargetManager } from './TargetManager.js';
const UIStrings = {
    /**
    *@description Text in Overlay Model
    */
    pausedInDebugger: 'Paused in debugger',
};
const str_ = i18n.i18n.registerUIStrings('core/sdk/OverlayModel.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class OverlayModel extends SDKModel {
    #domModel;
    overlayAgent;
    #debuggerModel;
    #inspectModeEnabledInternal;
    #hideHighlightTimeout;
    #defaultHighlighter;
    #highlighter;
    #showPaintRectsSetting;
    #showLayoutShiftRegionsSetting;
    #showAdHighlightsSetting;
    #showDebugBordersSetting;
    #showFPSCounterSetting;
    #showScrollBottleneckRectsSetting;
    #showWebVitalsSetting;
    #registeredListeners;
    #showViewportSizeOnResize;
    #persistentHighlighter;
    #sourceOrderHighlighter;
    #sourceOrderModeActiveInternal;
    constructor(target) {
        super(target);
        this.#domModel = target.model(DOMModel);
        target.registerOverlayDispatcher(this);
        this.overlayAgent = target.overlayAgent();
        this.#debuggerModel = target.model(DebuggerModel);
        if (this.#debuggerModel) {
            Common.Settings.Settings.instance()
                .moduleSetting('disablePausedStateOverlay')
                .addChangeListener(this.updatePausedInDebuggerMessage, this);
            this.#debuggerModel.addEventListener(DebuggerModelEvents.DebuggerPaused, this.updatePausedInDebuggerMessage, this);
            this.#debuggerModel.addEventListener(DebuggerModelEvents.DebuggerResumed, this.updatePausedInDebuggerMessage, this);
            // TODO(dgozman): we should get DebuggerResumed on navigations instead of listening to GlobalObjectCleared.
            this.#debuggerModel.addEventListener(DebuggerModelEvents.GlobalObjectCleared, this.updatePausedInDebuggerMessage, this);
        }
        this.#inspectModeEnabledInternal = false;
        this.#hideHighlightTimeout = null;
        this.#defaultHighlighter = new DefaultHighlighter(this);
        this.#highlighter = this.#defaultHighlighter;
        this.#showPaintRectsSetting = Common.Settings.Settings.instance().moduleSetting('showPaintRects');
        this.#showLayoutShiftRegionsSetting =
            Common.Settings.Settings.instance().moduleSetting('showLayoutShiftRegions');
        this.#showAdHighlightsSetting = Common.Settings.Settings.instance().moduleSetting('showAdHighlights');
        this.#showDebugBordersSetting = Common.Settings.Settings.instance().moduleSetting('showDebugBorders');
        this.#showFPSCounterSetting = Common.Settings.Settings.instance().moduleSetting('showFPSCounter');
        this.#showScrollBottleneckRectsSetting =
            Common.Settings.Settings.instance().moduleSetting('showScrollBottleneckRects');
        this.#showWebVitalsSetting = Common.Settings.Settings.instance().moduleSetting('showWebVitals');
        this.#registeredListeners = [];
        this.#showViewportSizeOnResize = true;
        if (!target.suspended()) {
            void this.overlayAgent.invoke_enable();
            void this.wireAgentToSettings();
        }
        this.#persistentHighlighter = new OverlayPersistentHighlighter(this);
        this.#domModel.addEventListener(DOMModelEvents.NodeRemoved, () => {
            this.#persistentHighlighter && this.#persistentHighlighter.refreshHighlights();
        });
        this.#domModel.addEventListener(DOMModelEvents.DocumentUpdated, () => {
            this.#persistentHighlighter && this.#persistentHighlighter.hideAllInOverlay();
        });
        this.#sourceOrderHighlighter = new SourceOrderHighlighter(this);
        this.#sourceOrderModeActiveInternal = false;
    }
    static highlightObjectAsDOMNode(object) {
        const domModel = object.runtimeModel().target().model(DOMModel);
        if (domModel) {
            domModel.overlayModel().highlightInOverlay({ object, selectorList: undefined });
        }
    }
    static hideDOMNodeHighlight() {
        for (const overlayModel of TargetManager.instance().models(OverlayModel)) {
            overlayModel.delayedHideHighlight(0);
        }
    }
    static async muteHighlight() {
        return Promise.all(TargetManager.instance().models(OverlayModel).map(model => model.suspendModel()));
    }
    static async unmuteHighlight() {
        return Promise.all(TargetManager.instance().models(OverlayModel).map(model => model.resumeModel()));
    }
    static highlightRect(rect) {
        for (const overlayModel of TargetManager.instance().models(OverlayModel)) {
            void overlayModel.highlightRect(rect);
        }
    }
    static clearHighlight() {
        for (const overlayModel of TargetManager.instance().models(OverlayModel)) {
            void overlayModel.clearHighlight();
        }
    }
    getDOMModel() {
        return this.#domModel;
    }
    highlightRect({ x, y, width, height, color, outlineColor }) {
        const highlightColor = color || { r: 255, g: 0, b: 255, a: 0.3 };
        const highlightOutlineColor = outlineColor || { r: 255, g: 0, b: 255, a: 0.5 };
        return this.overlayAgent.invoke_highlightRect({ x, y, width, height, color: highlightColor, outlineColor: highlightOutlineColor });
    }
    clearHighlight() {
        return this.overlayAgent.invoke_hideHighlight();
    }
    async wireAgentToSettings() {
        this.#registeredListeners = [
            this.#showPaintRectsSetting.addChangeListener(() => this.overlayAgent.invoke_setShowPaintRects({ result: this.#showPaintRectsSetting.get() })),
            this.#showLayoutShiftRegionsSetting.addChangeListener(() => this.overlayAgent.invoke_setShowLayoutShiftRegions({ result: this.#showLayoutShiftRegionsSetting.get() })),
            this.#showAdHighlightsSetting.addChangeListener(() => this.overlayAgent.invoke_setShowAdHighlights({ show: this.#showAdHighlightsSetting.get() })),
            this.#showDebugBordersSetting.addChangeListener(() => this.overlayAgent.invoke_setShowDebugBorders({ show: this.#showDebugBordersSetting.get() })),
            this.#showFPSCounterSetting.addChangeListener(() => this.overlayAgent.invoke_setShowFPSCounter({ show: this.#showFPSCounterSetting.get() })),
            this.#showScrollBottleneckRectsSetting.addChangeListener(() => this.overlayAgent.invoke_setShowScrollBottleneckRects({ show: this.#showScrollBottleneckRectsSetting.get() })),
            this.#showWebVitalsSetting.addChangeListener(() => this.overlayAgent.invoke_setShowWebVitals({ show: this.#showWebVitalsSetting.get() })),
        ];
        if (this.#showPaintRectsSetting.get()) {
            void this.overlayAgent.invoke_setShowPaintRects({ result: true });
        }
        if (this.#showLayoutShiftRegionsSetting.get()) {
            void this.overlayAgent.invoke_setShowLayoutShiftRegions({ result: true });
        }
        if (this.#showAdHighlightsSetting.get()) {
            void this.overlayAgent.invoke_setShowAdHighlights({ show: true });
        }
        if (this.#showDebugBordersSetting.get()) {
            void this.overlayAgent.invoke_setShowDebugBorders({ show: true });
        }
        if (this.#showFPSCounterSetting.get()) {
            void this.overlayAgent.invoke_setShowFPSCounter({ show: true });
        }
        if (this.#showScrollBottleneckRectsSetting.get()) {
            void this.overlayAgent.invoke_setShowScrollBottleneckRects({ show: true });
        }
        if (this.#showWebVitalsSetting.get()) {
            void this.overlayAgent.invoke_setShowWebVitals({ show: true });
        }
        if (this.#debuggerModel && this.#debuggerModel.isPaused()) {
            this.updatePausedInDebuggerMessage();
        }
        await this.overlayAgent.invoke_setShowViewportSizeOnResize({ show: this.#showViewportSizeOnResize });
    }
    async suspendModel() {
        Common.EventTarget.removeEventListeners(this.#registeredListeners);
        await this.overlayAgent.invoke_disable();
    }
    async resumeModel() {
        await Promise.all([this.overlayAgent.invoke_enable(), this.wireAgentToSettings()]);
    }
    setShowViewportSizeOnResize(show) {
        if (this.#showViewportSizeOnResize === show) {
            return;
        }
        this.#showViewportSizeOnResize = show;
        if (this.target().suspended()) {
            return;
        }
        void this.overlayAgent.invoke_setShowViewportSizeOnResize({ show });
    }
    updatePausedInDebuggerMessage() {
        if (this.target().suspended()) {
            return;
        }
        const message = this.#debuggerModel && this.#debuggerModel.isPaused() &&
            !Common.Settings.Settings.instance().moduleSetting('disablePausedStateOverlay').get() ?
            i18nString(UIStrings.pausedInDebugger) :
            undefined;
        void this.overlayAgent.invoke_setPausedInDebuggerMessage({ message });
    }
    setHighlighter(highlighter) {
        this.#highlighter = highlighter || this.#defaultHighlighter;
    }
    async setInspectMode(mode, showDetailedTooltip = true) {
        await this.#domModel.requestDocument();
        this.#inspectModeEnabledInternal = mode !== "none" /* None */;
        this.dispatchEventToListeners(Events.InspectModeWillBeToggled, this);
        void this.#highlighter.setInspectMode(mode, this.buildHighlightConfig('all', showDetailedTooltip));
    }
    inspectModeEnabled() {
        return this.#inspectModeEnabledInternal;
    }
    highlightInOverlay(data, mode, showInfo) {
        if (this.#sourceOrderModeActiveInternal) {
            // Return early if the source order is currently being shown the in the
            // overlay, so that it is not cleared by the highlight
            return;
        }
        if (this.#hideHighlightTimeout) {
            clearTimeout(this.#hideHighlightTimeout);
            this.#hideHighlightTimeout = null;
        }
        const highlightConfig = this.buildHighlightConfig(mode);
        if (typeof showInfo !== 'undefined') {
            highlightConfig.showInfo = showInfo;
        }
        this.#highlighter.highlightInOverlay(data, highlightConfig);
    }
    highlightInOverlayForTwoSeconds(data) {
        this.highlightInOverlay(data);
        this.delayedHideHighlight(2000);
    }
    highlightGridInPersistentOverlay(nodeId) {
        if (!this.#persistentHighlighter) {
            return;
        }
        this.#persistentHighlighter.highlightGridInOverlay(nodeId);
        this.dispatchEventToListeners(Events.PersistentGridOverlayStateChanged, { nodeId, enabled: true });
    }
    isHighlightedGridInPersistentOverlay(nodeId) {
        if (!this.#persistentHighlighter) {
            return false;
        }
        return this.#persistentHighlighter.isGridHighlighted(nodeId);
    }
    hideGridInPersistentOverlay(nodeId) {
        if (!this.#persistentHighlighter) {
            return;
        }
        this.#persistentHighlighter.hideGridInOverlay(nodeId);
        this.dispatchEventToListeners(Events.PersistentGridOverlayStateChanged, { nodeId, enabled: false });
    }
    highlightScrollSnapInPersistentOverlay(nodeId) {
        if (!this.#persistentHighlighter) {
            return;
        }
        this.#persistentHighlighter.highlightScrollSnapInOverlay(nodeId);
        this.dispatchEventToListeners(Events.PersistentScrollSnapOverlayStateChanged, { nodeId, enabled: true });
    }
    isHighlightedScrollSnapInPersistentOverlay(nodeId) {
        if (!this.#persistentHighlighter) {
            return false;
        }
        return this.#persistentHighlighter.isScrollSnapHighlighted(nodeId);
    }
    hideScrollSnapInPersistentOverlay(nodeId) {
        if (!this.#persistentHighlighter) {
            return;
        }
        this.#persistentHighlighter.hideScrollSnapInOverlay(nodeId);
        this.dispatchEventToListeners(Events.PersistentScrollSnapOverlayStateChanged, { nodeId, enabled: false });
    }
    highlightFlexContainerInPersistentOverlay(nodeId) {
        if (!this.#persistentHighlighter) {
            return;
        }
        this.#persistentHighlighter.highlightFlexInOverlay(nodeId);
        this.dispatchEventToListeners(Events.PersistentFlexContainerOverlayStateChanged, { nodeId, enabled: true });
    }
    isHighlightedFlexContainerInPersistentOverlay(nodeId) {
        if (!this.#persistentHighlighter) {
            return false;
        }
        return this.#persistentHighlighter.isFlexHighlighted(nodeId);
    }
    hideFlexContainerInPersistentOverlay(nodeId) {
        if (!this.#persistentHighlighter) {
            return;
        }
        this.#persistentHighlighter.hideFlexInOverlay(nodeId);
        this.dispatchEventToListeners(Events.PersistentFlexContainerOverlayStateChanged, { nodeId, enabled: false });
    }
    highlightContainerQueryInPersistentOverlay(nodeId) {
        if (!this.#persistentHighlighter) {
            return;
        }
        this.#persistentHighlighter.highlightContainerQueryInOverlay(nodeId);
        this.dispatchEventToListeners(Events.PersistentContainerQueryOverlayStateChanged, { nodeId, enabled: true });
    }
    isHighlightedContainerQueryInPersistentOverlay(nodeId) {
        if (!this.#persistentHighlighter) {
            return false;
        }
        return this.#persistentHighlighter.isContainerQueryHighlighted(nodeId);
    }
    hideContainerQueryInPersistentOverlay(nodeId) {
        if (!this.#persistentHighlighter) {
            return;
        }
        this.#persistentHighlighter.hideContainerQueryInOverlay(nodeId);
        this.dispatchEventToListeners(Events.PersistentContainerQueryOverlayStateChanged, { nodeId, enabled: false });
    }
    highlightSourceOrderInOverlay(node) {
        const sourceOrderConfig = {
            parentOutlineColor: Common.Color.SourceOrderHighlight.ParentOutline.toProtocolRGBA(),
            childOutlineColor: Common.Color.SourceOrderHighlight.ChildOutline.toProtocolRGBA(),
        };
        this.#sourceOrderHighlighter.highlightSourceOrderInOverlay(node, sourceOrderConfig);
    }
    colorOfGridInPersistentOverlay(nodeId) {
        if (!this.#persistentHighlighter) {
            return null;
        }
        return this.#persistentHighlighter.colorOfGrid(nodeId).asString(Common.Color.Format.HEX);
    }
    setColorOfGridInPersistentOverlay(nodeId, colorStr) {
        if (!this.#persistentHighlighter) {
            return;
        }
        const color = Common.Color.Color.parse(colorStr);
        if (!color) {
            return;
        }
        this.#persistentHighlighter.setColorOfGrid(nodeId, color);
        this.#persistentHighlighter.resetOverlay();
    }
    colorOfFlexInPersistentOverlay(nodeId) {
        if (!this.#persistentHighlighter) {
            return null;
        }
        return this.#persistentHighlighter.colorOfFlex(nodeId).asString(Common.Color.Format.HEX);
    }
    setColorOfFlexInPersistentOverlay(nodeId, colorStr) {
        if (!this.#persistentHighlighter) {
            return;
        }
        const color = Common.Color.Color.parse(colorStr);
        if (!color) {
            return;
        }
        this.#persistentHighlighter.setColorOfFlex(nodeId, color);
        this.#persistentHighlighter.resetOverlay();
    }
    hideSourceOrderInOverlay() {
        this.#sourceOrderHighlighter.hideSourceOrderHighlight();
    }
    setSourceOrderActive(isActive) {
        this.#sourceOrderModeActiveInternal = isActive;
    }
    sourceOrderModeActive() {
        return this.#sourceOrderModeActiveInternal;
    }
    highlightIsolatedElementInPersistentOverlay(nodeId) {
        if (!this.#persistentHighlighter) {
            return;
        }
        this.#persistentHighlighter.highlightIsolatedElementInOverlay(nodeId);
    }
    hideIsolatedElementInPersistentOverlay(nodeId) {
        if (!this.#persistentHighlighter) {
            return;
        }
        this.#persistentHighlighter.hideIsolatedElementInOverlay(nodeId);
    }
    isHighlightedIsolatedElementInPersistentOverlay(nodeId) {
        if (!this.#persistentHighlighter) {
            return false;
        }
        return this.#persistentHighlighter.isIsolatedElementHighlighted(nodeId);
    }
    delayedHideHighlight(delay) {
        if (this.#hideHighlightTimeout === null) {
            this.#hideHighlightTimeout = window.setTimeout(() => this.highlightInOverlay({ clear: true }), delay);
        }
    }
    highlightFrame(frameId) {
        if (this.#hideHighlightTimeout) {
            clearTimeout(this.#hideHighlightTimeout);
            this.#hideHighlightTimeout = null;
        }
        this.#highlighter.highlightFrame(frameId);
    }
    showHingeForDualScreen(hinge) {
        if (hinge) {
            const { x, y, width, height, contentColor, outlineColor } = hinge;
            void this.overlayAgent.invoke_setShowHinge({
                hingeConfig: { rect: { x: x, y: y, width: width, height: height }, contentColor: contentColor, outlineColor: outlineColor },
            });
        }
        else {
            void this.overlayAgent.invoke_setShowHinge({});
        }
    }
    buildHighlightConfig(mode = 'all', showDetailedToolip = false) {
        const showRulers = Common.Settings.Settings.instance().moduleSetting('showMetricsRulers').get();
        const colorFormat = Common.Settings.Settings.instance().moduleSetting('colorFormat').get();
        const highlightConfig = {
            showInfo: mode === 'all' || mode === 'container-outline',
            showRulers: showRulers,
            showStyles: showDetailedToolip,
            showAccessibilityInfo: showDetailedToolip,
            showExtensionLines: showRulers,
            gridHighlightConfig: {},
            flexContainerHighlightConfig: {},
            flexItemHighlightConfig: {},
            contrastAlgorithm: Root.Runtime.experiments.isEnabled('APCA') ? "apca" /* Apca */ :
                "aa" /* Aa */,
        };
        if (mode === 'all' || mode === 'content') {
            highlightConfig.contentColor = Common.Color.PageHighlight.Content.toProtocolRGBA();
        }
        if (mode === 'all' || mode === 'padding') {
            highlightConfig.paddingColor = Common.Color.PageHighlight.Padding.toProtocolRGBA();
        }
        if (mode === 'all' || mode === 'border') {
            highlightConfig.borderColor = Common.Color.PageHighlight.Border.toProtocolRGBA();
        }
        if (mode === 'all' || mode === 'margin') {
            highlightConfig.marginColor = Common.Color.PageHighlight.Margin.toProtocolRGBA();
        }
        if (mode === 'all') {
            highlightConfig.eventTargetColor = Common.Color.PageHighlight.EventTarget.toProtocolRGBA();
            highlightConfig.shapeColor = Common.Color.PageHighlight.Shape.toProtocolRGBA();
            highlightConfig.shapeMarginColor = Common.Color.PageHighlight.ShapeMargin.toProtocolRGBA();
            highlightConfig.gridHighlightConfig = {
                rowGapColor: Common.Color.PageHighlight.GapBackground.toProtocolRGBA(),
                rowHatchColor: Common.Color.PageHighlight.GapHatch.toProtocolRGBA(),
                columnGapColor: Common.Color.PageHighlight.GapBackground.toProtocolRGBA(),
                columnHatchColor: Common.Color.PageHighlight.GapHatch.toProtocolRGBA(),
                rowLineColor: Common.Color.PageHighlight.LayoutLine.toProtocolRGBA(),
                columnLineColor: Common.Color.PageHighlight.LayoutLine.toProtocolRGBA(),
                rowLineDash: true,
                columnLineDash: true,
            };
            highlightConfig.flexContainerHighlightConfig = {
                containerBorder: {
                    color: Common.Color.PageHighlight.LayoutLine.toProtocolRGBA(),
                    pattern: "dashed" /* Dashed */,
                },
                itemSeparator: {
                    color: Common.Color.PageHighlight.LayoutLine.toProtocolRGBA(),
                    pattern: "dotted" /* Dotted */,
                },
                lineSeparator: {
                    color: Common.Color.PageHighlight.LayoutLine.toProtocolRGBA(),
                    pattern: "dashed" /* Dashed */,
                },
                mainDistributedSpace: {
                    hatchColor: Common.Color.PageHighlight.GapHatch.toProtocolRGBA(),
                    fillColor: Common.Color.PageHighlight.GapBackground.toProtocolRGBA(),
                },
                crossDistributedSpace: {
                    hatchColor: Common.Color.PageHighlight.GapHatch.toProtocolRGBA(),
                    fillColor: Common.Color.PageHighlight.GapBackground.toProtocolRGBA(),
                },
                rowGapSpace: {
                    hatchColor: Common.Color.PageHighlight.GapHatch.toProtocolRGBA(),
                    fillColor: Common.Color.PageHighlight.GapBackground.toProtocolRGBA(),
                },
                columnGapSpace: {
                    hatchColor: Common.Color.PageHighlight.GapHatch.toProtocolRGBA(),
                    fillColor: Common.Color.PageHighlight.GapBackground.toProtocolRGBA(),
                },
            };
            highlightConfig.flexItemHighlightConfig = {
                baseSizeBox: {
                    hatchColor: Common.Color.PageHighlight.GapHatch.toProtocolRGBA(),
                },
                baseSizeBorder: {
                    color: Common.Color.PageHighlight.LayoutLine.toProtocolRGBA(),
                    pattern: "dotted" /* Dotted */,
                },
                flexibilityArrow: {
                    color: Common.Color.PageHighlight.LayoutLine.toProtocolRGBA(),
                },
            };
        }
        if (mode.endsWith('gap')) {
            highlightConfig.gridHighlightConfig = {
                gridBorderColor: Common.Color.PageHighlight.GridBorder.toProtocolRGBA(),
                gridBorderDash: true,
            };
            if (mode === 'gap' || mode === 'row-gap') {
                highlightConfig.gridHighlightConfig.rowGapColor = Common.Color.PageHighlight.GapBackground.toProtocolRGBA();
                highlightConfig.gridHighlightConfig.rowHatchColor = Common.Color.PageHighlight.GapHatch.toProtocolRGBA();
            }
            if (mode === 'gap' || mode === 'column-gap') {
                highlightConfig.gridHighlightConfig.columnGapColor = Common.Color.PageHighlight.GapBackground.toProtocolRGBA();
                highlightConfig.gridHighlightConfig.columnHatchColor = Common.Color.PageHighlight.GapHatch.toProtocolRGBA();
            }
        }
        if (mode.endsWith('gap')) {
            highlightConfig.flexContainerHighlightConfig = {
                containerBorder: {
                    color: Common.Color.PageHighlight.LayoutLine.toProtocolRGBA(),
                    pattern: "dashed" /* Dashed */,
                },
            };
            if (mode === 'gap' || mode === 'row-gap') {
                highlightConfig.flexContainerHighlightConfig.rowGapSpace = {
                    hatchColor: Common.Color.PageHighlight.GapHatch.toProtocolRGBA(),
                    fillColor: Common.Color.PageHighlight.GapBackground.toProtocolRGBA(),
                };
            }
            if (mode === 'gap' || mode === 'column-gap') {
                highlightConfig.flexContainerHighlightConfig.columnGapSpace = {
                    hatchColor: Common.Color.PageHighlight.GapHatch.toProtocolRGBA(),
                    fillColor: Common.Color.PageHighlight.GapBackground.toProtocolRGBA(),
                };
            }
        }
        if (mode === 'grid-areas') {
            highlightConfig.gridHighlightConfig = {
                rowLineColor: Common.Color.PageHighlight.LayoutLine.toProtocolRGBA(),
                columnLineColor: Common.Color.PageHighlight.LayoutLine.toProtocolRGBA(),
                rowLineDash: true,
                columnLineDash: true,
                showAreaNames: true,
                areaBorderColor: Common.Color.PageHighlight.GridAreaBorder.toProtocolRGBA(),
            };
        }
        if (mode === 'grid-template-columns') {
            highlightConfig.contentColor = Common.Color.PageHighlight.Content.toProtocolRGBA();
            highlightConfig.gridHighlightConfig = {
                columnLineColor: Common.Color.PageHighlight.LayoutLine.toProtocolRGBA(),
                columnLineDash: true,
            };
        }
        if (mode === 'grid-template-rows') {
            highlightConfig.contentColor = Common.Color.PageHighlight.Content.toProtocolRGBA();
            highlightConfig.gridHighlightConfig = {
                rowLineColor: Common.Color.PageHighlight.LayoutLine.toProtocolRGBA(),
                rowLineDash: true,
            };
        }
        if (mode === 'justify-content') {
            highlightConfig.flexContainerHighlightConfig = {
                containerBorder: {
                    color: Common.Color.PageHighlight.LayoutLine.toProtocolRGBA(),
                    pattern: "dashed" /* Dashed */,
                },
                mainDistributedSpace: {
                    hatchColor: Common.Color.PageHighlight.GapHatch.toProtocolRGBA(),
                    fillColor: Common.Color.PageHighlight.GapBackground.toProtocolRGBA(),
                },
            };
        }
        if (mode === 'align-content') {
            highlightConfig.flexContainerHighlightConfig = {
                containerBorder: {
                    color: Common.Color.PageHighlight.LayoutLine.toProtocolRGBA(),
                    pattern: "dashed" /* Dashed */,
                },
                crossDistributedSpace: {
                    hatchColor: Common.Color.PageHighlight.GapHatch.toProtocolRGBA(),
                    fillColor: Common.Color.PageHighlight.GapBackground.toProtocolRGBA(),
                },
            };
        }
        if (mode === 'align-items') {
            highlightConfig.flexContainerHighlightConfig = {
                containerBorder: {
                    color: Common.Color.PageHighlight.LayoutLine.toProtocolRGBA(),
                    pattern: "dashed" /* Dashed */,
                },
                lineSeparator: {
                    color: Common.Color.PageHighlight.LayoutLine.toProtocolRGBA(),
                    pattern: "dashed" /* Dashed */,
                },
                crossAlignment: { color: Common.Color.PageHighlight.LayoutLine.toProtocolRGBA() },
            };
        }
        if (mode === 'flexibility') {
            highlightConfig.flexItemHighlightConfig = {
                baseSizeBox: {
                    hatchColor: Common.Color.PageHighlight.GapHatch.toProtocolRGBA(),
                },
                baseSizeBorder: {
                    color: Common.Color.PageHighlight.LayoutLine.toProtocolRGBA(),
                    pattern: "dotted" /* Dotted */,
                },
                flexibilityArrow: {
                    color: Common.Color.PageHighlight.LayoutLine.toProtocolRGBA(),
                },
            };
        }
        if (mode === 'container-outline') {
            highlightConfig.containerQueryContainerHighlightConfig = {
                containerBorder: {
                    color: Common.Color.PageHighlight.LayoutLine.toProtocolRGBA(),
                    pattern: "dashed" /* Dashed */,
                },
            };
        }
        // the backend does not support the 'original' format because
        // it currently cannot retrieve the original format using computed styles
        const supportedColorFormats = new Set(['rgb', 'hsl', 'hex']);
        if (supportedColorFormats.has(colorFormat)) {
            highlightConfig.colorFormat = colorFormat;
        }
        return highlightConfig;
    }
    nodeHighlightRequested({ nodeId }) {
        const node = this.#domModel.nodeForId(nodeId);
        if (node) {
            this.dispatchEventToListeners(Events.HighlightNodeRequested, node);
        }
    }
    static setInspectNodeHandler(handler) {
        OverlayModel.inspectNodeHandler = handler;
    }
    inspectNodeRequested({ backendNodeId }) {
        const deferredNode = new DeferredDOMNode(this.target(), backendNodeId);
        if (OverlayModel.inspectNodeHandler) {
            void deferredNode.resolvePromise().then(node => {
                if (node && OverlayModel.inspectNodeHandler) {
                    OverlayModel.inspectNodeHandler(node);
                }
            });
        }
        else {
            void Common.Revealer.reveal(deferredNode);
        }
        this.dispatchEventToListeners(Events.ExitedInspectMode);
    }
    screenshotRequested({ viewport }) {
        this.dispatchEventToListeners(Events.ScreenshotRequested, viewport);
        this.dispatchEventToListeners(Events.ExitedInspectMode);
    }
    inspectModeCanceled() {
        this.dispatchEventToListeners(Events.ExitedInspectMode);
    }
    static inspectNodeHandler = null;
    getOverlayAgent() {
        return this.overlayAgent;
    }
}
// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum
export var Events;
(function (Events) {
    Events["InspectModeWillBeToggled"] = "InspectModeWillBeToggled";
    Events["ExitedInspectMode"] = "InspectModeExited";
    Events["HighlightNodeRequested"] = "HighlightNodeRequested";
    Events["ScreenshotRequested"] = "ScreenshotRequested";
    Events["PersistentGridOverlayStateChanged"] = "PersistentGridOverlayStateChanged";
    Events["PersistentFlexContainerOverlayStateChanged"] = "PersistentFlexContainerOverlayStateChanged";
    Events["PersistentScrollSnapOverlayStateChanged"] = "PersistentScrollSnapOverlayStateChanged";
    Events["PersistentContainerQueryOverlayStateChanged"] = "PersistentContainerQueryOverlayStateChanged";
})(Events || (Events = {}));
class DefaultHighlighter {
    #model;
    constructor(model) {
        this.#model = model;
    }
    highlightInOverlay(data, highlightConfig) {
        const { node, deferredNode, object, selectorList } = { node: undefined, deferredNode: undefined, object: undefined, selectorList: undefined, ...data };
        const nodeId = node ? node.id : undefined;
        const backendNodeId = deferredNode ? deferredNode.backendNodeId() : undefined;
        const objectId = object ? object.objectId : undefined;
        if (nodeId || backendNodeId || objectId) {
            void this.#model.target().overlayAgent().invoke_highlightNode({ highlightConfig, nodeId, backendNodeId, objectId, selector: selectorList });
        }
        else {
            void this.#model.target().overlayAgent().invoke_hideHighlight();
        }
    }
    async setInspectMode(mode, highlightConfig) {
        await this.#model.target().overlayAgent().invoke_setInspectMode({ mode, highlightConfig });
    }
    highlightFrame(frameId) {
        void this.#model.target().overlayAgent().invoke_highlightFrame({
            frameId,
            contentColor: Common.Color.PageHighlight.Content.toProtocolRGBA(),
            contentOutlineColor: Common.Color.PageHighlight.ContentOutline.toProtocolRGBA(),
        });
    }
}
export class SourceOrderHighlighter {
    #model;
    constructor(model) {
        this.#model = model;
    }
    highlightSourceOrderInOverlay(node, sourceOrderConfig) {
        this.#model.setSourceOrderActive(true);
        this.#model.setShowViewportSizeOnResize(false);
        void this.#model.getOverlayAgent().invoke_highlightSourceOrder({ sourceOrderConfig, nodeId: node.id });
    }
    hideSourceOrderHighlight() {
        this.#model.setSourceOrderActive(false);
        this.#model.setShowViewportSizeOnResize(true);
        void this.#model.clearHighlight();
    }
}
SDKModel.register(OverlayModel, { capabilities: Capability.DOM, autostart: true });
//# sourceMappingURL=OverlayModel.js.map