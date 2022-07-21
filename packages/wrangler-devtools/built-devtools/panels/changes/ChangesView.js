// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as Host from '../../core/host/host.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as Root from '../../core/root/root.js';
import { formatCSSChangesFromDiff } from '../../panels/utils/utils.js';
import * as Diff from '../../third_party/diff/diff.js';
import * as DiffView from '../../ui/components/diff_view/diff_view.js';
import * as UI from '../../ui/legacy/legacy.js';
import changesViewStyles from './changesView.css.js';
import * as WorkspaceDiff from '../../models/workspace_diff/workspace_diff.js';
import { ChangesSidebar } from './ChangesSidebar.js';
const UIStrings = {
    /**
    *@description Screen reader/tooltip label for a button in the Changes tool that reverts all changes to the currently open file.
    */
    revertAllChangesToCurrentFile: 'Revert all changes to current file',
    /**
    *@description Screen reader/tooltip label for a button in the Changes tool that copies all changes from the currently open file.
    */
    copyAllChangesFromCurrentFile: 'Copy all changes from current file',
    /**
    *@description Text in Changes View of the Changes tab
    */
    noChanges: 'No changes',
    /**
    *@description Text in Changes View of the Changes tab
    */
    binaryData: 'Binary data',
    /**
    * @description Text in the Changes tab that indicates how many lines of code have changed in the
    * selected file. An insertion refers to an added line of code. The (+) is a visual cue to indicate
    * lines were added (not translatable).
    */
    sInsertions: '{n, plural, =1 {# insertion (+)} other {# insertions (+)}}',
    /**
    * @description Text in the Changes tab that indicates how many lines of code have changed in the
    * selected file. A deletion refers to a removed line of code. The (-) is a visual cue to indicate
    * lines were removed (not translatable).
    */
    sDeletions: '{n, plural, =1 {# deletion (-)} other {# deletions (-)}}',
    /**
    *@description Text for a button in the Changes tool that copies all the changes from the currently open file.
    */
    copy: 'Copy',
};
const str_ = i18n.i18n.registerUIStrings('panels/changes/ChangesView.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
function diffStats(diff) {
    const insertions = diff.reduce((ins, token) => ins + (token[0] === Diff.Diff.Operation.Insert ? token[1].length : 0), 0);
    const deletions = diff.reduce((ins, token) => ins + (token[0] === Diff.Diff.Operation.Delete ? token[1].length : 0), 0);
    const deletionText = i18nString(UIStrings.sDeletions, { n: deletions });
    const insertionText = i18nString(UIStrings.sInsertions, { n: insertions });
    return `${insertionText}, ${deletionText}`;
}
let changesViewInstance;
export class ChangesView extends UI.Widget.VBox {
    emptyWidget;
    workspaceDiff;
    changesSidebar;
    selectedUISourceCode;
    #selectedSourceCodeFormattedMapping;
    diffContainer;
    toolbar;
    diffStats;
    diffView;
    copyButton;
    copyButtonSeparator;
    constructor() {
        super(true);
        const splitWidget = new UI.SplitWidget.SplitWidget(true /* vertical */, false /* sidebar on left */);
        const mainWidget = new UI.Widget.Widget();
        splitWidget.setMainWidget(mainWidget);
        splitWidget.show(this.contentElement);
        this.emptyWidget = new UI.EmptyWidget.EmptyWidget('');
        this.emptyWidget.show(mainWidget.element);
        this.workspaceDiff = WorkspaceDiff.WorkspaceDiff.workspaceDiff();
        this.changesSidebar = new ChangesSidebar(this.workspaceDiff);
        this.changesSidebar.addEventListener("SelectedUISourceCodeChanged" /* SelectedUISourceCodeChanged */, this.selectedUISourceCodeChanged, this);
        splitWidget.setSidebarWidget(this.changesSidebar);
        this.selectedUISourceCode = null;
        this.diffContainer = mainWidget.element.createChild('div', 'diff-container');
        UI.ARIAUtils.markAsTabpanel(this.diffContainer);
        this.diffContainer.addEventListener('click', event => this.click(event));
        this.diffView = this.diffContainer.appendChild(new DiffView.DiffView.DiffView());
        this.toolbar = new UI.Toolbar.Toolbar('changes-toolbar', mainWidget.element);
        const revertButton = new UI.Toolbar.ToolbarButton(i18nString(UIStrings.revertAllChangesToCurrentFile), 'largeicon-undo');
        revertButton.addEventListener(UI.Toolbar.ToolbarButton.Events.Click, this.revert.bind(this));
        this.toolbar.appendToolbarItem(revertButton);
        this.diffStats = new UI.Toolbar.ToolbarText('');
        this.toolbar.appendToolbarItem(this.diffStats);
        this.copyButton = new UI.Toolbar.ToolbarButton(i18nString(UIStrings.copyAllChangesFromCurrentFile), 'largeicon-copy', UIStrings.copy);
        this.copyButton.addEventListener(UI.Toolbar.ToolbarButton.Events.Click, this.copyChanges.bind(this));
        this.copyButtonSeparator = new UI.Toolbar.ToolbarSeparator();
        this.toolbar.setEnabled(false);
        this.hideDiff(i18nString(UIStrings.noChanges));
        this.selectedUISourceCodeChanged();
    }
    static instance(opts = { forceNew: null }) {
        const { forceNew } = opts;
        if (!changesViewInstance || forceNew) {
            changesViewInstance = new ChangesView();
        }
        return changesViewInstance;
    }
    selectedUISourceCodeChanged() {
        this.revealUISourceCode(this.changesSidebar.selectedUISourceCode());
        if (this.selectedUISourceCode?.contentType() === Common.ResourceType.resourceTypes.Stylesheet) {
            this.toolbar.appendToolbarItem(this.copyButtonSeparator);
            this.toolbar.appendToolbarItem(this.copyButton);
        }
        else {
            this.toolbar.removeToolbarItem(this.copyButtonSeparator);
            this.toolbar.removeToolbarItem(this.copyButton);
        }
    }
    revert() {
        const uiSourceCode = this.selectedUISourceCode;
        if (!uiSourceCode) {
            return;
        }
        void this.workspaceDiff.revertToOriginal(uiSourceCode);
    }
    async copyChanges() {
        const uiSourceCode = this.selectedUISourceCode;
        if (!uiSourceCode) {
            return;
        }
        const diffResponse = await this.workspaceDiff.requestDiff(uiSourceCode, { shouldFormatDiff: true });
        // Diff array with real diff will contain at least 2 lines.
        if (!diffResponse || diffResponse?.diff.length < 2) {
            return;
        }
        const changes = await formatCSSChangesFromDiff(diffResponse.diff);
        Host.InspectorFrontendHost.InspectorFrontendHostInstance.copyText(changes);
    }
    click(event) {
        if (!this.selectedUISourceCode) {
            return;
        }
        for (const target of event.composedPath()) {
            if (!(target instanceof HTMLElement)) {
                continue;
            }
            const selection = target.ownerDocument.getSelection();
            if (selection?.toString()) {
                // We abort source revelation when user has text selection.
                break;
            }
            if (target.classList.contains('diff-line-content') && target.hasAttribute('data-line-number')) {
                let lineNumber = Number(target.dataset.lineNumber) - 1;
                // Unfortunately, caretRangeFromPoint is broken in shadow
                // roots, which makes determining the character offset more
                // work than justified here.
                if (Root.Runtime.experiments.isEnabled(Root.Runtime.ExperimentName.PRECISE_CHANGES) &&
                    this.#selectedSourceCodeFormattedMapping) {
                    lineNumber = this.#selectedSourceCodeFormattedMapping.formattedToOriginal(lineNumber, 0)[0];
                }
                void Common.Revealer.reveal(this.selectedUISourceCode.uiLocation(lineNumber, 0), false);
                event.consume(true);
                break;
            }
            else if (target.classList.contains('diff-listing')) {
                break;
            }
        }
    }
    revealUISourceCode(uiSourceCode) {
        if (this.selectedUISourceCode === uiSourceCode) {
            return;
        }
        if (this.selectedUISourceCode) {
            this.workspaceDiff.unsubscribeFromDiffChange(this.selectedUISourceCode, this.refreshDiff, this);
        }
        if (uiSourceCode && this.isShowing()) {
            this.workspaceDiff.subscribeToDiffChange(uiSourceCode, this.refreshDiff, this);
        }
        this.selectedUISourceCode = uiSourceCode;
        void this.refreshDiff();
    }
    wasShown() {
        void this.refreshDiff();
        this.registerCSSFiles([changesViewStyles]);
    }
    async refreshDiff() {
        if (!this.isShowing()) {
            return;
        }
        if (!this.selectedUISourceCode) {
            this.renderDiffRows();
            return;
        }
        const uiSourceCode = this.selectedUISourceCode;
        if (!uiSourceCode.contentType().isTextType()) {
            this.hideDiff(i18nString(UIStrings.binaryData));
            return;
        }
        const diffResponse = await this.workspaceDiff.requestDiff(uiSourceCode, { shouldFormatDiff: Root.Runtime.experiments.isEnabled(Root.Runtime.ExperimentName.PRECISE_CHANGES) });
        if (this.selectedUISourceCode !== uiSourceCode) {
            return;
        }
        this.#selectedSourceCodeFormattedMapping = diffResponse?.formattedCurrentMapping;
        this.renderDiffRows(diffResponse?.diff);
    }
    hideDiff(message) {
        this.diffStats.setText('');
        this.toolbar.setEnabled(false);
        this.diffContainer.style.display = 'none';
        this.emptyWidget.text = message;
        this.emptyWidget.showWidget();
    }
    renderDiffRows(diff) {
        if (!diff || (diff.length === 1 && diff[0][0] === Diff.Diff.Operation.Equal)) {
            this.hideDiff(i18nString(UIStrings.noChanges));
        }
        else {
            this.diffStats.setText(diffStats(diff));
            this.toolbar.setEnabled(true);
            this.emptyWidget.hideWidget();
            const mimeType = this.selectedUISourceCode.mimeType();
            this.diffContainer.style.display = 'block';
            this.diffView.data = { diff, mimeType };
        }
    }
}
let diffUILocationRevealerInstance;
export class DiffUILocationRevealer {
    static instance(opts = { forceNew: false }) {
        const { forceNew } = opts;
        if (!diffUILocationRevealerInstance || forceNew) {
            diffUILocationRevealerInstance = new DiffUILocationRevealer();
        }
        return diffUILocationRevealerInstance;
    }
    async reveal(diffUILocation, omitFocus) {
        if (!(diffUILocation instanceof WorkspaceDiff.WorkspaceDiff.DiffUILocation)) {
            throw new Error('Internal error: not a diff ui location');
        }
        await UI.ViewManager.ViewManager.instance().showView('changes.changes');
        ChangesView.instance().changesSidebar.selectUISourceCode(diffUILocation.uiSourceCode, omitFocus);
    }
}
//# sourceMappingURL=ChangesView.js.map