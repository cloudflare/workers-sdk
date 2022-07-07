// Copyright 2019 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as CSSOverviewComponents from './components/components.js';
import cssOverviewStyles from './cssOverview.css.js';
import * as Host from '../../core/host/host.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as UI from '../../ui/legacy/legacy.js';
import { CSSOverviewCompletedView } from './CSSOverviewCompletedView.js';
import { OverviewController } from './CSSOverviewController.js';
import { CSSOverviewModel } from './CSSOverviewModel.js';
import { CSSOverviewProcessingView } from './CSSOverviewProcessingView.js';
// eslint-disable-next-line @typescript-eslint/naming-convention
let CSSOverviewPanelInstance;
export class CSSOverviewPanel extends UI.Panel.Panel {
    #controller;
    #startView;
    #processingView;
    #completedView;
    #model;
    #target;
    #backgroundColors;
    #textColors;
    #fillColors;
    #borderColors;
    #fontInfo;
    #mediaQueries;
    #unusedDeclarations;
    #elementCount;
    #globalStyleStats;
    #textColorContrastIssues;
    constructor() {
        super('css_overview');
        this.element.classList.add('css-overview-panel');
        this.#controller = new OverviewController();
        this.#startView = new CSSOverviewComponents.CSSOverviewStartView.CSSOverviewStartView();
        this.#startView.addEventListener('overviewstartrequested', () => this.#controller.dispatchEventToListeners("RequestOverviewStart" /* RequestOverviewStart */));
        this.#processingView = new CSSOverviewProcessingView(this.#controller);
        this.#completedView = new CSSOverviewCompletedView(this.#controller);
        SDK.TargetManager.TargetManager.instance().observeTargets(this);
        this.#controller.addEventListener("RequestOverviewStart" /* RequestOverviewStart */, _event => {
            Host.userMetrics.actionTaken(Host.UserMetrics.Action.CaptureCssOverviewClicked);
            void this.#startOverview();
        }, this);
        this.#controller.addEventListener("OverviewCompleted" /* OverviewCompleted */, this.#overviewCompleted, this);
        this.#controller.addEventListener("Reset" /* Reset */, this.#reset, this);
        this.#controller.addEventListener("RequestNodeHighlight" /* RequestNodeHighlight */, this.#requestNodeHighlight, this);
        this.#reset();
    }
    static instance() {
        if (!CSSOverviewPanelInstance) {
            CSSOverviewPanelInstance = new CSSOverviewPanel();
        }
        return CSSOverviewPanelInstance;
    }
    targetAdded(target) {
        if (this.#target) {
            return;
        }
        this.#target = target;
        this.#completedView.initializeModels(target);
        const [model] = SDK.TargetManager.TargetManager.instance().models(CSSOverviewModel);
        this.#model = model;
    }
    targetRemoved() {
    }
    #getModel() {
        if (!this.#model) {
            throw new Error('Did not retrieve model information yet.');
        }
        return this.#model;
    }
    #reset() {
        this.#backgroundColors = new Map();
        this.#textColors = new Map();
        this.#fillColors = new Map();
        this.#borderColors = new Map();
        this.#fontInfo = new Map();
        this.#mediaQueries = new Map();
        this.#unusedDeclarations = new Map();
        this.#elementCount = 0;
        this.#globalStyleStats = {
            styleRules: 0,
            inlineStyles: 0,
            externalSheets: 0,
            stats: {
                // Simple.
                type: 0,
                class: 0,
                id: 0,
                universal: 0,
                attribute: 0,
                // Non-simple.
                nonSimple: 0,
            },
        };
        this.#textColorContrastIssues = new Map();
        this.#renderInitialView();
    }
    #requestNodeHighlight(evt) {
        this.#getModel().highlightNode(evt.data);
    }
    #renderInitialView() {
        this.#processingView.hideWidget();
        this.#completedView.hideWidget();
        this.contentElement.append(this.#startView);
        this.#startView.show();
    }
    #renderOverviewStartedView() {
        this.#startView.hide();
        this.#completedView.hideWidget();
        this.#processingView.show(this.contentElement);
    }
    #renderOverviewCompletedView() {
        this.#startView.hide();
        this.#processingView.hideWidget();
        this.#completedView.show(this.contentElement);
        this.#completedView.setOverviewData({
            backgroundColors: this.#backgroundColors,
            textColors: this.#textColors,
            textColorContrastIssues: this.#textColorContrastIssues,
            fillColors: this.#fillColors,
            borderColors: this.#borderColors,
            globalStyleStats: this.#globalStyleStats,
            fontInfo: this.#fontInfo,
            elementCount: this.#elementCount,
            mediaQueries: this.#mediaQueries,
            unusedDeclarations: this.#unusedDeclarations,
        });
    }
    async #startOverview() {
        this.#renderOverviewStartedView();
        const model = this.#getModel();
        const [globalStyleStats, { elementCount, backgroundColors, textColors, textColorContrastIssues, fillColors, borderColors, fontInfo, unusedDeclarations }, mediaQueries] = await Promise.all([
            model.getGlobalStylesheetStats(),
            model.getNodeStyleStats(),
            model.getMediaQueries(),
        ]);
        if (elementCount) {
            this.#elementCount = elementCount;
        }
        if (globalStyleStats) {
            this.#globalStyleStats = globalStyleStats;
        }
        if (mediaQueries) {
            this.#mediaQueries = mediaQueries;
        }
        if (backgroundColors) {
            this.#backgroundColors = backgroundColors;
        }
        if (textColors) {
            this.#textColors = textColors;
        }
        if (textColorContrastIssues) {
            this.#textColorContrastIssues = textColorContrastIssues;
        }
        if (fillColors) {
            this.#fillColors = fillColors;
        }
        if (borderColors) {
            this.#borderColors = borderColors;
        }
        if (fontInfo) {
            this.#fontInfo = fontInfo;
        }
        if (unusedDeclarations) {
            this.#unusedDeclarations = unusedDeclarations;
        }
        this.#controller.dispatchEventToListeners("OverviewCompleted" /* OverviewCompleted */);
    }
    #overviewCompleted() {
        this.#renderOverviewCompletedView();
    }
    wasShown() {
        super.wasShown();
        this.registerCSSFiles([cssOverviewStyles]);
    }
}
//# sourceMappingURL=CSSOverviewPanel.js.map