// Copyright 2019 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../core/i18n/i18n.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as Formatter from '../../models/formatter/formatter.js';
import * as CodeMirror from '../../third_party/codemirror.next/codemirror.next.js';
import * as SourceFrame from '../../ui/legacy/components/source_frame/source_frame.js';
import * as UI from '../../ui/legacy/legacy.js';
import * as Coverage from '../coverage/coverage.js';
import { Plugin } from './Plugin.js';
// Plugin that shows a gutter with coverage information when available.
const UIStrings = {
    /**
    *@description Text for Coverage Status Bar Item in Sources Panel
    */
    clickToShowCoveragePanel: 'Click to show Coverage Panel',
    /**
    *@description Text for Coverage Status Bar Item in Sources Panel
    */
    showDetails: 'Show Details',
    /**
    *@description Text to show in the status bar if coverage data is available
    *@example {12.3} PH1
    */
    coverageS: 'Coverage: {PH1}',
    /**
    *@description Text to be shown in the status bar if no coverage data is available
    */
    coverageNa: 'Coverage: n/a',
};
const str_ = i18n.i18n.registerUIStrings('panels/sources/CoveragePlugin.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class CoveragePlugin extends Plugin {
    originalSourceCode;
    infoInToolbar;
    model;
    coverage;
    constructor(uiSourceCode) {
        super(uiSourceCode);
        this.originalSourceCode =
            Formatter.SourceFormatter.SourceFormatter.instance().getOriginalUISourceCode(this.uiSourceCode);
        this.infoInToolbar = new UI.Toolbar.ToolbarButton(i18nString(UIStrings.clickToShowCoveragePanel));
        this.infoInToolbar.setSecondary();
        this.infoInToolbar.addEventListener(UI.Toolbar.ToolbarButton.Events.Click, () => {
            void UI.ViewManager.ViewManager.instance().showView('coverage');
        });
        const mainTarget = SDK.TargetManager.TargetManager.instance().mainTarget();
        if (mainTarget) {
            this.model = mainTarget.model(Coverage.CoverageModel.CoverageModel);
            if (this.model) {
                this.model.addEventListener(Coverage.CoverageModel.Events.CoverageReset, this.handleReset, this);
                this.coverage = this.model.getCoverageForUrl(this.originalSourceCode.url());
                if (this.coverage) {
                    this.coverage.addEventListener(Coverage.CoverageModel.URLCoverageInfo.Events.SizesChanged, this.handleCoverageSizesChanged, this);
                }
            }
        }
        this.updateStats();
    }
    dispose() {
        if (this.coverage) {
            this.coverage.removeEventListener(Coverage.CoverageModel.URLCoverageInfo.Events.SizesChanged, this.handleCoverageSizesChanged, this);
        }
        if (this.model) {
            this.model.removeEventListener(Coverage.CoverageModel.Events.CoverageReset, this.handleReset, this);
        }
    }
    static accepts(uiSourceCode) {
        return uiSourceCode.contentType().isDocumentOrScriptOrStyleSheet();
    }
    handleReset() {
        this.coverage = null;
        this.updateStats();
    }
    handleCoverageSizesChanged() {
        this.updateStats();
    }
    updateStats() {
        if (this.coverage) {
            this.infoInToolbar.setTitle(i18nString(UIStrings.showDetails));
            const formatter = new Intl.NumberFormat(i18n.DevToolsLocale.DevToolsLocale.instance().locale, {
                style: 'percent',
                maximumFractionDigits: 1,
            });
            this.infoInToolbar.setText(i18nString(UIStrings.coverageS, { PH1: formatter.format(this.coverage.usedPercentage()) }));
        }
        else {
            this.infoInToolbar.setTitle(i18nString(UIStrings.clickToShowCoveragePanel));
            this.infoInToolbar.setText(i18nString(UIStrings.coverageNa));
        }
    }
    async rightToolbarItems() {
        return [this.infoInToolbar];
    }
    editorExtension() {
        return coverageCompartment.of([]);
    }
    getCoverageManager() {
        return this.uiSourceCode.getDecorationData(SourceFrame.SourceFrame.DecoratorType.COVERAGE);
    }
    editorInitialized(editor) {
        if (this.getCoverageManager()) {
            this.startDecoUpdate(editor);
        }
    }
    decorationChanged(type, editor) {
        if (type === SourceFrame.SourceFrame.DecoratorType.COVERAGE) {
            this.startDecoUpdate(editor);
        }
    }
    startDecoUpdate(editor) {
        const manager = this.getCoverageManager();
        void (manager ? manager.usageByLine(this.uiSourceCode) : Promise.resolve([])).then(usageByLine => {
            const enabled = Boolean(editor.state.field(coverageState, false));
            if (!usageByLine.length) {
                if (enabled) {
                    editor.dispatch({ effects: coverageCompartment.reconfigure([]) });
                }
            }
            else if (!enabled) {
                editor.dispatch({
                    effects: coverageCompartment.reconfigure([
                        coverageState.init(state => markersFromCoverageData(usageByLine, state)),
                        coverageGutter(this.uiSourceCode.url()),
                        theme,
                    ]),
                });
            }
            else {
                editor.dispatch({ effects: setCoverageState.of(usageByLine) });
            }
        });
    }
}
const coveredMarker = new (class extends CodeMirror.GutterMarker {
    elementClass = 'cm-coverageUsed';
})();
const notCoveredMarker = new (class extends CodeMirror.GutterMarker {
    elementClass = 'cm-coverageUnused';
})();
function markersFromCoverageData(usageByLine, state) {
    const builder = new CodeMirror.RangeSetBuilder();
    for (let line = 0; line < usageByLine.length; line++) {
        const usage = usageByLine[line];
        if (usage !== undefined && line < state.doc.lines) {
            const lineStart = state.doc.line(line + 1).from;
            builder.add(lineStart, lineStart, usage ? coveredMarker : notCoveredMarker);
        }
    }
    return builder.finish();
}
const setCoverageState = CodeMirror.StateEffect.define();
const coverageState = CodeMirror.StateField.define({
    create() {
        return CodeMirror.RangeSet.empty;
    },
    update(markers, tr) {
        return tr.effects.reduce((markers, effect) => {
            return effect.is(setCoverageState) ? markersFromCoverageData(effect.value, tr.state) : markers;
        }, markers.map(tr.changes));
    },
});
function coverageGutter(url) {
    return CodeMirror.gutter({
        markers: (view) => view.state.field(coverageState),
        domEventHandlers: {
            click() {
                void UI.ViewManager.ViewManager.instance()
                    .showView('coverage')
                    .then(() => {
                    const view = UI.ViewManager.ViewManager.instance().view('coverage');
                    return view && view.widget();
                })
                    .then(widget => {
                    const matchFormattedSuffix = url.match(/(.*):formatted$/);
                    const urlWithoutFormattedSuffix = (matchFormattedSuffix && matchFormattedSuffix[1]) || url;
                    widget.selectCoverageItemByUrl(urlWithoutFormattedSuffix);
                });
                return true;
            },
        },
        class: 'cm-coverageGutter',
    });
}
const coverageCompartment = new CodeMirror.Compartment();
const theme = CodeMirror.EditorView.baseTheme({
    '.cm-coverageGutter': {
        width: '5px',
        marginLeft: '3px',
    },
    '.cm-coverageUnused': {
        backgroundColor: 'var(--color-accent-red)',
    },
    '.cm-coverageUsed': {
        backgroundColor: 'var(--color-coverage-used)',
    },
});
//# sourceMappingURL=CoveragePlugin.js.map