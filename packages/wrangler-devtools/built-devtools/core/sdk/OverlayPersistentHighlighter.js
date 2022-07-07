// Copyright 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../common/common.js';
import { OverlayColorGenerator } from './OverlayColorGenerator.js';
export class OverlayPersistentHighlighter {
    #model;
    #gridHighlights;
    #scrollSnapHighlights;
    #flexHighlights;
    #containerQueryHighlights;
    #isolatedElementHighlights;
    #colors;
    #gridColorGenerator;
    #flexColorGenerator;
    #flexEnabled;
    // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    #showGridLineLabelsSetting;
    // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    #extendGridLinesSetting;
    // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    #showGridAreasSetting;
    // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    #showGridTrackSizesSetting;
    constructor(model, flexEnabled = true) {
        this.#model = model;
        this.#gridHighlights = new Map();
        this.#scrollSnapHighlights = new Map();
        this.#flexHighlights = new Map();
        this.#containerQueryHighlights = new Map();
        this.#isolatedElementHighlights = new Map();
        this.#colors = new Map();
        this.#gridColorGenerator = new OverlayColorGenerator();
        this.#flexColorGenerator = new OverlayColorGenerator();
        this.#flexEnabled = flexEnabled;
        this.#showGridLineLabelsSetting = Common.Settings.Settings.instance().moduleSetting('showGridLineLabels');
        this.#showGridLineLabelsSetting.addChangeListener(this.onSettingChange, this);
        this.#extendGridLinesSetting = Common.Settings.Settings.instance().moduleSetting('extendGridLines');
        this.#extendGridLinesSetting.addChangeListener(this.onSettingChange, this);
        this.#showGridAreasSetting = Common.Settings.Settings.instance().moduleSetting('showGridAreas');
        this.#showGridAreasSetting.addChangeListener(this.onSettingChange, this);
        this.#showGridTrackSizesSetting = Common.Settings.Settings.instance().moduleSetting('showGridTrackSizes');
        this.#showGridTrackSizesSetting.addChangeListener(this.onSettingChange, this);
    }
    onSettingChange() {
        this.resetOverlay();
    }
    buildGridHighlightConfig(nodeId) {
        const mainColor = this.colorOfGrid(nodeId);
        const background = mainColor.setAlpha(0.1);
        const gapBackground = mainColor.setAlpha(0.3);
        const gapHatch = mainColor.setAlpha(0.8);
        const showGridExtensionLines = this.#extendGridLinesSetting.get();
        const showPositiveLineNumbers = this.#showGridLineLabelsSetting.get() === 'lineNumbers';
        const showNegativeLineNumbers = showPositiveLineNumbers;
        const showLineNames = this.#showGridLineLabelsSetting.get() === 'lineNames';
        return {
            rowGapColor: gapBackground.toProtocolRGBA(),
            rowHatchColor: gapHatch.toProtocolRGBA(),
            columnGapColor: gapBackground.toProtocolRGBA(),
            columnHatchColor: gapHatch.toProtocolRGBA(),
            gridBorderColor: mainColor.toProtocolRGBA(),
            gridBorderDash: false,
            rowLineColor: mainColor.toProtocolRGBA(),
            columnLineColor: mainColor.toProtocolRGBA(),
            rowLineDash: true,
            columnLineDash: true,
            showGridExtensionLines,
            showPositiveLineNumbers,
            showNegativeLineNumbers,
            showLineNames,
            showAreaNames: this.#showGridAreasSetting.get(),
            showTrackSizes: this.#showGridTrackSizesSetting.get(),
            areaBorderColor: mainColor.toProtocolRGBA(),
            gridBackgroundColor: background.toProtocolRGBA(),
        };
    }
    buildFlexContainerHighlightConfig(nodeId) {
        const mainColor = this.colorOfFlex(nodeId);
        return {
            containerBorder: { color: mainColor.toProtocolRGBA(), pattern: "dashed" /* Dashed */ },
            itemSeparator: { color: mainColor.toProtocolRGBA(), pattern: "dotted" /* Dotted */ },
            lineSeparator: { color: mainColor.toProtocolRGBA(), pattern: "dashed" /* Dashed */ },
            mainDistributedSpace: { hatchColor: mainColor.toProtocolRGBA() },
            crossDistributedSpace: { hatchColor: mainColor.toProtocolRGBA() },
        };
    }
    buildScrollSnapContainerHighlightConfig(_nodeId) {
        return {
            snapAreaBorder: {
                color: Common.Color.PageHighlight.GridBorder.toProtocolRGBA(),
                pattern: "dashed" /* Dashed */,
            },
            snapportBorder: { color: Common.Color.PageHighlight.GridBorder.toProtocolRGBA() },
            scrollMarginColor: Common.Color.PageHighlight.Margin.toProtocolRGBA(),
            scrollPaddingColor: Common.Color.PageHighlight.Padding.toProtocolRGBA(),
        };
    }
    highlightGridInOverlay(nodeId) {
        this.#gridHighlights.set(nodeId, this.buildGridHighlightConfig(nodeId));
        this.updateHighlightsInOverlay();
    }
    isGridHighlighted(nodeId) {
        return this.#gridHighlights.has(nodeId);
    }
    colorOfGrid(nodeId) {
        let color = this.#colors.get(nodeId);
        if (!color) {
            color = this.#gridColorGenerator.next();
            this.#colors.set(nodeId, color);
        }
        return color;
    }
    setColorOfGrid(nodeId, color) {
        this.#colors.set(nodeId, color);
    }
    hideGridInOverlay(nodeId) {
        if (this.#gridHighlights.has(nodeId)) {
            this.#gridHighlights.delete(nodeId);
            this.updateHighlightsInOverlay();
        }
    }
    highlightScrollSnapInOverlay(nodeId) {
        this.#scrollSnapHighlights.set(nodeId, this.buildScrollSnapContainerHighlightConfig(nodeId));
        this.updateHighlightsInOverlay();
    }
    isScrollSnapHighlighted(nodeId) {
        return this.#scrollSnapHighlights.has(nodeId);
    }
    hideScrollSnapInOverlay(nodeId) {
        if (this.#scrollSnapHighlights.has(nodeId)) {
            this.#scrollSnapHighlights.delete(nodeId);
            this.updateHighlightsInOverlay();
        }
    }
    highlightFlexInOverlay(nodeId) {
        this.#flexHighlights.set(nodeId, this.buildFlexContainerHighlightConfig(nodeId));
        this.updateHighlightsInOverlay();
    }
    isFlexHighlighted(nodeId) {
        return this.#flexHighlights.has(nodeId);
    }
    colorOfFlex(nodeId) {
        let color = this.#colors.get(nodeId);
        if (!color) {
            color = this.#flexColorGenerator.next();
            this.#colors.set(nodeId, color);
        }
        return color;
    }
    setColorOfFlex(nodeId, color) {
        this.#colors.set(nodeId, color);
    }
    hideFlexInOverlay(nodeId) {
        if (this.#flexHighlights.has(nodeId)) {
            this.#flexHighlights.delete(nodeId);
            this.updateHighlightsInOverlay();
        }
    }
    highlightContainerQueryInOverlay(nodeId) {
        this.#containerQueryHighlights.set(nodeId, this.buildContainerQueryContainerHighlightConfig());
        this.updateHighlightsInOverlay();
    }
    hideContainerQueryInOverlay(nodeId) {
        if (this.#containerQueryHighlights.has(nodeId)) {
            this.#containerQueryHighlights.delete(nodeId);
            this.updateHighlightsInOverlay();
        }
    }
    isContainerQueryHighlighted(nodeId) {
        return this.#containerQueryHighlights.has(nodeId);
    }
    buildContainerQueryContainerHighlightConfig() {
        return {
            containerBorder: {
                color: Common.Color.PageHighlight.LayoutLine.toProtocolRGBA(),
                pattern: "dashed" /* Dashed */,
            },
            descendantBorder: {
                color: Common.Color.PageHighlight.LayoutLine.toProtocolRGBA(),
                pattern: "dashed" /* Dashed */,
            },
        };
    }
    highlightIsolatedElementInOverlay(nodeId) {
        this.#isolatedElementHighlights.set(nodeId, this.buildIsolationModeHighlightConfig());
        this.updateHighlightsInOverlay();
    }
    hideIsolatedElementInOverlay(nodeId) {
        if (this.#isolatedElementHighlights.has(nodeId)) {
            this.#isolatedElementHighlights.delete(nodeId);
            this.updateHighlightsInOverlay();
        }
    }
    isIsolatedElementHighlighted(nodeId) {
        return this.#isolatedElementHighlights.has(nodeId);
    }
    buildIsolationModeHighlightConfig() {
        return {
            resizerColor: Common.Color.IsolationModeHighlight.Resizer.toProtocolRGBA(),
            resizerHandleColor: Common.Color.IsolationModeHighlight.ResizerHandle.toProtocolRGBA(),
            maskColor: Common.Color.IsolationModeHighlight.Mask.toProtocolRGBA(),
        };
    }
    hideAllInOverlay() {
        this.#flexHighlights.clear();
        this.#gridHighlights.clear();
        this.#scrollSnapHighlights.clear();
        this.#containerQueryHighlights.clear();
        this.#isolatedElementHighlights.clear();
        this.updateHighlightsInOverlay();
    }
    refreshHighlights() {
        const gridsNeedUpdate = this.updateHighlightsForDeletedNodes(this.#gridHighlights);
        const flexboxesNeedUpdate = this.updateHighlightsForDeletedNodes(this.#flexHighlights);
        const scrollSnapsNeedUpdate = this.updateHighlightsForDeletedNodes(this.#scrollSnapHighlights);
        const containerQueriesNeedUpdate = this.updateHighlightsForDeletedNodes(this.#containerQueryHighlights);
        const isolatedElementsNeedUpdate = this.updateHighlightsForDeletedNodes(this.#isolatedElementHighlights);
        if (flexboxesNeedUpdate || gridsNeedUpdate || scrollSnapsNeedUpdate || containerQueriesNeedUpdate ||
            isolatedElementsNeedUpdate) {
            this.updateHighlightsInOverlay();
        }
    }
    updateHighlightsForDeletedNodes(highlights) {
        let needsUpdate = false;
        for (const nodeId of highlights.keys()) {
            if (this.#model.getDOMModel().nodeForId(nodeId) === null) {
                highlights.delete(nodeId);
                needsUpdate = true;
            }
        }
        return needsUpdate;
    }
    resetOverlay() {
        for (const nodeId of this.#gridHighlights.keys()) {
            this.#gridHighlights.set(nodeId, this.buildGridHighlightConfig(nodeId));
        }
        for (const nodeId of this.#flexHighlights.keys()) {
            this.#flexHighlights.set(nodeId, this.buildFlexContainerHighlightConfig(nodeId));
        }
        for (const nodeId of this.#scrollSnapHighlights.keys()) {
            this.#scrollSnapHighlights.set(nodeId, this.buildScrollSnapContainerHighlightConfig(nodeId));
        }
        for (const nodeId of this.#containerQueryHighlights.keys()) {
            this.#containerQueryHighlights.set(nodeId, this.buildContainerQueryContainerHighlightConfig());
        }
        for (const nodeId of this.#isolatedElementHighlights.keys()) {
            this.#isolatedElementHighlights.set(nodeId, this.buildIsolationModeHighlightConfig());
        }
        this.updateHighlightsInOverlay();
    }
    updateHighlightsInOverlay() {
        const hasNodesToHighlight = this.#gridHighlights.size > 0 || this.#flexHighlights.size > 0 ||
            this.#containerQueryHighlights.size > 0 || this.#isolatedElementHighlights.size > 0;
        this.#model.setShowViewportSizeOnResize(!hasNodesToHighlight);
        this.updateGridHighlightsInOverlay();
        this.updateFlexHighlightsInOverlay();
        this.updateScrollSnapHighlightsInOverlay();
        this.updateContainerQueryHighlightsInOverlay();
        this.updateIsolatedElementHighlightsInOverlay();
    }
    updateGridHighlightsInOverlay() {
        const overlayModel = this.#model;
        const gridNodeHighlightConfigs = [];
        for (const [nodeId, gridHighlightConfig] of this.#gridHighlights.entries()) {
            gridNodeHighlightConfigs.push({ nodeId, gridHighlightConfig });
        }
        overlayModel.target().overlayAgent().invoke_setShowGridOverlays({ gridNodeHighlightConfigs });
    }
    updateFlexHighlightsInOverlay() {
        if (!this.#flexEnabled) {
            return;
        }
        const overlayModel = this.#model;
        const flexNodeHighlightConfigs = [];
        for (const [nodeId, flexContainerHighlightConfig] of this.#flexHighlights.entries()) {
            flexNodeHighlightConfigs.push({ nodeId, flexContainerHighlightConfig });
        }
        overlayModel.target().overlayAgent().invoke_setShowFlexOverlays({ flexNodeHighlightConfigs });
    }
    updateScrollSnapHighlightsInOverlay() {
        const overlayModel = this.#model;
        const scrollSnapHighlightConfigs = [];
        for (const [nodeId, scrollSnapContainerHighlightConfig] of this.#scrollSnapHighlights.entries()) {
            scrollSnapHighlightConfigs.push({ nodeId, scrollSnapContainerHighlightConfig });
        }
        overlayModel.target().overlayAgent().invoke_setShowScrollSnapOverlays({ scrollSnapHighlightConfigs });
    }
    updateContainerQueryHighlightsInOverlay() {
        const overlayModel = this.#model;
        const containerQueryHighlightConfigs = [];
        for (const [nodeId, containerQueryContainerHighlightConfig] of this.#containerQueryHighlights.entries()) {
            containerQueryHighlightConfigs.push({ nodeId, containerQueryContainerHighlightConfig });
        }
        overlayModel.target().overlayAgent().invoke_setShowContainerQueryOverlays({ containerQueryHighlightConfigs });
    }
    updateIsolatedElementHighlightsInOverlay() {
        const overlayModel = this.#model;
        const isolatedElementHighlightConfigs = [];
        for (const [nodeId, isolationModeHighlightConfig] of this.#isolatedElementHighlights.entries()) {
            isolatedElementHighlightConfigs.push({ nodeId, isolationModeHighlightConfig });
        }
        overlayModel.target().overlayAgent().invoke_setShowIsolatedElements({ isolatedElementHighlightConfigs });
    }
}
//# sourceMappingURL=OverlayPersistentHighlighter.js.map