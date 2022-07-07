// Copyright 2012 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../core/i18n/i18n.js';
import * as Persistence from '../../models/persistence/persistence.js';
import * as Workspace from '../../models/workspace/workspace.js';
import * as QuickOpen from '../../ui/legacy/components/quick_open/quick_open.js';
import * as UI from '../../ui/legacy/legacy.js';
import { FilePathScoreFunction } from './FilePathScoreFunction.js';
const UIStrings = {
    /**
    *@description Text in Filtered UISource Code List Provider of the Sources panel
    */
    noFilesFound: 'No files found',
};
const str_ = i18n.i18n.registerUIStrings('panels/sources/FilteredUISourceCodeListProvider.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class FilteredUISourceCodeListProvider extends QuickOpen.FilteredListWidget.Provider {
    queryLineNumberAndColumnNumber;
    defaultScores;
    scorer;
    uiSourceCodes;
    uiSourceCodeUrls;
    query;
    constructor() {
        super();
        this.queryLineNumberAndColumnNumber = '';
        this.defaultScores = null;
        this.scorer = new FilePathScoreFunction('');
        this.uiSourceCodes = [];
        this.uiSourceCodeUrls = new Set();
    }
    projectRemoved(event) {
        const project = event.data;
        this.populate(project);
        this.refresh();
    }
    populate(skipProject) {
        this.uiSourceCodes = [];
        this.uiSourceCodeUrls.clear();
        for (const project of Workspace.Workspace.WorkspaceImpl.instance().projects()) {
            if (project !== skipProject && this.filterProject(project)) {
                for (const uiSourceCode of project.uiSourceCodes()) {
                    if (this.filterUISourceCode(uiSourceCode)) {
                        this.uiSourceCodes.push(uiSourceCode);
                        this.uiSourceCodeUrls.add(uiSourceCode.url());
                    }
                }
            }
        }
    }
    filterUISourceCode(uiSourceCode) {
        if (this.uiSourceCodeUrls.has(uiSourceCode.url())) {
            return false;
        }
        const binding = Persistence.Persistence.PersistenceImpl.instance().binding(uiSourceCode);
        return !binding || binding.fileSystem === uiSourceCode;
    }
    uiSourceCodeSelected(_uiSourceCode, _lineNumber, _columnNumber) {
        // Overridden by subclasses
    }
    filterProject(_project) {
        return true;
        // Overridden by subclasses
    }
    itemCount() {
        return this.uiSourceCodes.length;
    }
    itemContentTypeAt(itemIndex) {
        return this.uiSourceCodes[itemIndex].contentType();
    }
    itemKeyAt(itemIndex) {
        return this.uiSourceCodes[itemIndex].url();
    }
    setDefaultScores(defaultScores) {
        this.defaultScores = defaultScores;
    }
    itemScoreAt(itemIndex, query) {
        const uiSourceCode = this.uiSourceCodes[itemIndex];
        const score = this.defaultScores ? (this.defaultScores.get(uiSourceCode) || 0) : 0;
        if (!query || query.length < 2) {
            return score;
        }
        if (this.query !== query) {
            this.query = query;
            this.scorer = new FilePathScoreFunction(query);
        }
        let multiplier = 10;
        if (uiSourceCode.project().type() === Workspace.Workspace.projectTypes.FileSystem &&
            !Persistence.Persistence.PersistenceImpl.instance().binding(uiSourceCode)) {
            multiplier = 5;
        }
        let contentTypeBonus = 0;
        if (uiSourceCode.contentType().isFromSourceMap()) {
            contentTypeBonus = 100;
            // Maybe also have a bonus for being a script?
        }
        const fullDisplayName = uiSourceCode.fullDisplayName();
        return score + multiplier * (contentTypeBonus + this.scorer.calculateScore(fullDisplayName, null));
    }
    renderItem(itemIndex, query, titleElement, subtitleElement) {
        query = this.rewriteQuery(query);
        const uiSourceCode = this.uiSourceCodes[itemIndex];
        const fullDisplayName = uiSourceCode.fullDisplayName();
        const indexes = [];
        new FilePathScoreFunction(query).calculateScore(fullDisplayName, indexes);
        const fileNameIndex = fullDisplayName.lastIndexOf('/');
        titleElement.textContent = uiSourceCode.displayName() + (this.queryLineNumberAndColumnNumber || '');
        this.renderSubtitleElement(subtitleElement, fullDisplayName.substring(0, fileNameIndex + 1));
        UI.Tooltip.Tooltip.install(subtitleElement, fullDisplayName);
        const ranges = [];
        for (let i = 0; i < indexes.length; ++i) {
            ranges.push({ offset: indexes[i], length: 1 });
        }
        if (indexes[0] > fileNameIndex) {
            for (let i = 0; i < ranges.length; ++i) {
                ranges[i].offset -= fileNameIndex + 1;
            }
            UI.UIUtils.highlightRangesWithStyleClass(titleElement, ranges, 'highlight');
        }
        else {
            UI.UIUtils.highlightRangesWithStyleClass(subtitleElement, ranges, 'highlight');
        }
    }
    renderSubtitleElement(element, text) {
        element.removeChildren();
        let splitPosition = text.lastIndexOf('/');
        const maxTextLength = 43;
        if (text.length > maxTextLength) {
            splitPosition = text.length - maxTextLength;
        }
        const first = element.createChild('div', 'first-part');
        first.textContent = text.substring(0, splitPosition);
        const second = element.createChild('div', 'second-part');
        second.textContent = text.substring(splitPosition);
        UI.Tooltip.Tooltip.install(element, text);
    }
    selectItem(itemIndex, promptValue) {
        const parsedExpression = promptValue.trim().match(/^([^:]*)(:\d+)?(:\d+)?$/);
        if (!parsedExpression) {
            return;
        }
        let lineNumber;
        let columnNumber;
        if (parsedExpression[2]) {
            lineNumber = parseInt(parsedExpression[2].substr(1), 10) - 1;
        }
        if (parsedExpression[3]) {
            columnNumber = parseInt(parsedExpression[3].substr(1), 10) - 1;
        }
        const uiSourceCode = itemIndex !== null ? this.uiSourceCodes[itemIndex] : null;
        this.uiSourceCodeSelected(uiSourceCode, lineNumber, columnNumber);
    }
    rewriteQuery(query) {
        query = query ? query.trim() : '';
        if (!query || query === ':') {
            return '';
        }
        const lineNumberMatch = query.match(/^([^:]+)((?::[^:]*){0,2})$/);
        this.queryLineNumberAndColumnNumber = lineNumberMatch ? lineNumberMatch[2] : '';
        return lineNumberMatch ? lineNumberMatch[1] : query;
    }
    uiSourceCodeAdded(event) {
        const uiSourceCode = event.data;
        if (!this.filterUISourceCode(uiSourceCode) || !this.filterProject(uiSourceCode.project())) {
            return;
        }
        this.uiSourceCodes.push(uiSourceCode);
        this.uiSourceCodeUrls.add(uiSourceCode.url());
        this.refresh();
    }
    notFoundText() {
        return i18nString(UIStrings.noFilesFound);
    }
    attach() {
        Workspace.Workspace.WorkspaceImpl.instance().addEventListener(Workspace.Workspace.Events.UISourceCodeAdded, this.uiSourceCodeAdded, this);
        Workspace.Workspace.WorkspaceImpl.instance().addEventListener(Workspace.Workspace.Events.ProjectRemoved, this.projectRemoved, this);
        this.populate();
    }
    detach() {
        Workspace.Workspace.WorkspaceImpl.instance().removeEventListener(Workspace.Workspace.Events.UISourceCodeAdded, this.uiSourceCodeAdded, this);
        Workspace.Workspace.WorkspaceImpl.instance().removeEventListener(Workspace.Workspace.Events.ProjectRemoved, this.projectRemoved, this);
        this.queryLineNumberAndColumnNumber = '';
        this.defaultScores = null;
    }
}
//# sourceMappingURL=FilteredUISourceCodeListProvider.js.map