
export type ComponentName = '3pFilter' | 'audit' | 'categoryHeader' | 'chevron' | 'clump' | 'crc' | 'crcChain' | 'elementScreenshot' | 'footer' | 'fraction' | 'gauge' | 'gaugePwa' | 'heading' | 'metric' | 'opportunity' | 'opportunityHeader' | 'scorescale' | 'scoresWrapper' | 'snippet' | 'snippetContent' | 'snippetHeader' | 'snippetLine' | 'styles' | 'topbar' | 'warningsToplevel';
export type I18n<T> = any;
export type DetailsRenderer = any;
export type CRCSegment = {
    node: LH.Audit.Details.SimpleCriticalRequestNode;
    isLastChild: boolean;
    hasChildren: boolean;
    startTime: number;
    transferSize: number;
    treeMarkers: boolean[];
};
/**
 * @license
 * Copyright 2017 The Lighthouse Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
export class DOM {
    /**
     * @param {Document} document
     * @param {HTMLElement} rootEl
     */
    constructor(document: Document, rootEl: HTMLElement);
    /** @type {Document} */
    _document: Document;
    /** @type {string} */
    _lighthouseChannel: string;
    /** @type {Map<string, DocumentFragment>} */
    _componentCache: Map<string, DocumentFragment>;
    /** @type {HTMLElement} */
    rootEl: HTMLElement;
    /**
     * @template {string} T
     * @param {T} name
     * @param {string=} className
     * @return {HTMLElementByTagName[T]}
     */
    createElement<T extends string>(name: T, className?: string | undefined): HTMLElementByTagName;
    /**
     * @param {string} namespaceURI
     * @param {string} name
     * @param {string=} className
     * @return {Element}
     */
    createElementNS(namespaceURI: string, name: string, className?: string | undefined): Element;
    /**
     * @return {!DocumentFragment}
     */
    createFragment(): DocumentFragment;
    /**
     * @param {string} data
     * @return {!Node}
     */
    createTextNode(data: string): Node;
    /**
     * @template {string} T
     * @param {Element} parentElem
     * @param {T} elementName
     * @param {string=} className
     * @return {HTMLElementByTagName[T]}
     */
    createChildOf<T_1 extends string>(parentElem: Element, elementName: T_1, className?: string | undefined): HTMLElementByTagName;
    /**
     * @param {import('./components.js').ComponentName} componentName
     * @return {!DocumentFragment} A clone of the cached component.
     */
    createComponent(componentName: any): DocumentFragment;
    clearComponentCache(): void;
    /**
     * @param {string} text
     * @return {Element}
     */
    convertMarkdownLinkSnippets(text: string): Element;
    /**
     * Set link href, but safely, preventing `javascript:` protocol, etc.
     * @see https://github.com/google/safevalues/
     * @param {HTMLAnchorElement} elem
     * @param {string} url
     */
    safelySetHref(elem: HTMLAnchorElement, url: string): void;
    /**
     * Only create blob URLs for JSON & HTML
     * @param {HTMLAnchorElement} elem
     * @param {Blob} blob
     */
    safelySetBlobHref(elem: HTMLAnchorElement, blob: Blob): void;
    /**
     * @param {string} markdownText
     * @return {Element}
     */
    convertMarkdownCodeSnippets(markdownText: string): Element;
    /**
     * The channel to use for UTM data when rendering links to the documentation.
     * @param {string} lighthouseChannel
     */
    setLighthouseChannel(lighthouseChannel: string): void;
    /**
     * ONLY use if `dom.rootEl` isn't sufficient for your needs. `dom.rootEl` is preferred
     * for all scoping, because a document can have multiple reports within it.
     * @return {Document}
     */
    document(): Document;
    /**
     * TODO(paulirish): import and conditionally apply the DevTools frontend subclasses instead of this
     * @return {boolean}
     */
    isDevTools(): boolean;
    /**
     * Guaranteed context.querySelector. Always returns an element or throws if
     * nothing matches query.
     * @template {string} T
     * @param {T} query
     * @param {ParentNode} context
     * @return {ParseSelector<T>}
     */
    find<T_2 extends string>(query: T_2, context: ParentNode): ParseSelector<T_3>;
    /**
     * Helper for context.querySelectorAll. Returns an Array instead of a NodeList.
     * @template {string} T
     * @param {T} query
     * @param {ParentNode} context
     */
    findAll<T_4 extends string>(query: T_4, context: ParentNode): Element[];
    /**
     * Fires a custom DOM event on target.
     * @param {string} name Name of the event.
     * @param {Node=} target DOM node to fire the event on.
     * @param {*=} detail Custom data to include.
     */
    fireEventOn(name: string, target?: Node | undefined, detail?: any | undefined): void;
    /**
     * Downloads a file (blob) using a[download].
     * @param {Blob|File} blob The file to save.
     * @param {string} filename
     */
    saveFile(blob: Blob | File, filename: string): void;
}
/**
 * @license
 * Copyright 2017 The Lighthouse Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Dummy text for ensuring report robustness: </script> pre$`post %%LIGHTHOUSE_JSON%%
 * (this is handled by terser)
 */
export class ReportRenderer {
    /**
     * @param {DOM} dom
     */
    constructor(dom: DOM);
    /** @type {DOM} */
    _dom: DOM;
    /** @type {LH.Renderer.Options} */
    _opts: LH.Renderer.Options;
    /**
     * @param {LH.Result} lhr
     * @param {HTMLElement?} rootEl Report root element containing the report
     * @param {LH.Renderer.Options=} opts
     * @return {!Element}
     */
    renderReport(lhr: LH.Result, rootEl: HTMLElement | null, opts?: LH.Renderer.Options): Element;
    /**
     * @param {LH.ReportResult} report
     * @return {DocumentFragment}
     */
    _renderReportTopbar(report: LH.ReportResult): DocumentFragment;
    /**
     * @return {DocumentFragment}
     */
    _renderReportHeader(): DocumentFragment;
    /**
     * @param {LH.ReportResult} report
     * @return {DocumentFragment}
     */
    _renderReportFooter(report: LH.ReportResult): DocumentFragment;
    /**
     * @param {LH.ReportResult} report
     * @param {DocumentFragment} footer
     */
    _renderMetaBlock(report: LH.ReportResult, footer: DocumentFragment): void;
    /**
     * Returns a div with a list of top-level warnings, or an empty div if no warnings.
     * @param {LH.ReportResult} report
     * @return {Node}
     */
    _renderReportWarnings(report: LH.ReportResult): Node;
    /**
     * @param {LH.ReportResult} report
     * @param {CategoryRenderer} categoryRenderer
     * @param {Record<string, CategoryRenderer>} specificCategoryRenderers
     * @return {!DocumentFragment[]}
     */
    _renderScoreGauges(report: LH.ReportResult, categoryRenderer: CategoryRenderer, specificCategoryRenderers: Record<string, CategoryRenderer>): DocumentFragment[];
    /**
     * @param {LH.ReportResult} report
     * @return {!DocumentFragment}
     */
    _renderReport(report: LH.ReportResult): DocumentFragment;
}
export class ReportUIFeatures {
    /**
     * @param {DOM} dom
     * @param {LH.Renderer.Options} opts
     */
    constructor(dom: DOM, opts?: LH.Renderer.Options);
    /** @type {LH.Result} */
    json: LH.Result;
    /** @type {DOM} */
    _dom: DOM;
    _opts: LH.Renderer.Options;
    _topbar: TopbarFeatures;
    /**
     * Handle media query change events.
     * @param {MediaQueryList|MediaQueryListEvent} mql
     */
    onMediaQueryChange(mql: MediaQueryList | MediaQueryListEvent): void;
    /**
     * Adds tools button, print, and other functionality to the report. The method
     * should be called whenever the report needs to be re-rendered.
     * @param {LH.Result} lhr
     */
    initFeatures(lhr: LH.Result): void;
    /**
     * @param {{text: string, icon?: string, onClick: () => void}} opts
     */
    addButton(opts: {
        text: string;
        icon?: string;
        onClick: () => void;
    }): HTMLElementByTagName;
    resetUIState(): void;
    /**
     * Returns the html that recreates this report.
     * @return {string}
     */
    getReportHtml(): string;
    /**
     * Save json as a gist. Unimplemented in base UI features.
     */
    saveAsGist(): void;
    _enableFireworks(): void;
    _setupMediaQueryListeners(): void;
    /**
     * Resets the state of page before capturing the page for export.
     * When the user opens the exported HTML page, certain UI elements should
     * be in their closed state (not opened) and the templates should be unstamped.
     */
    _resetUIState(): void;
    _setupThirdPartyFilter(): void;
    /**
     * @param {Element} rootEl
     */
    _setupElementScreenshotOverlay(rootEl: Element): void;
    /**
     * From a table with URL entries, finds the rows containing third-party URLs
     * and returns them.
     * @param {HTMLElement[]} rowEls
     * @param {string} finalUrl
     * @return {Array<HTMLElement>}
     */
    _getThirdPartyRows(rowEls: HTMLElement[], finalUrl: string): Array<HTMLElement>;
    /**
     * @param {Blob|File} blob
     */
    _saveFile(blob: Blob | File): void;
}
export namespace format {
    export { registerLocaleData };
}
/**
 * @license Copyright 2021 The Lighthouse Authors. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
/**
 * @param {LH.Result} lhr
 * @param {LH.Renderer.Options} opts
 * @return {HTMLElement}
 */
export function renderReport(lhr: LH.Result, opts?: LH.Renderer.Options): HTMLElement;
/**
 * Returns a new LHR with all strings changed to the new requestedLocale.
 * @param {LH.Result} lhr
 * @param {LH.Locale} requestedLocale
 * @return {{lhr: LH.Result, missingIcuMessageIds: string[]}}
 */
export function swapLocale(lhr: LH.Result, requestedLocale: LH.Locale): {
    lhr: LH.Result;
    missingIcuMessageIds: string[];
};
/**
 * @license
 * Copyright 2017 The Lighthouse Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
declare class CategoryRenderer {
    /**
     * @param {DOM} dom
     * @param {DetailsRenderer} detailsRenderer
     */
    constructor(dom: DOM, detailsRenderer: DetailsRenderer);
    /** @type {DOM} */
    dom: DOM;
    /** @type {DetailsRenderer} */
    detailsRenderer: DetailsRenderer;
    /**
     * Display info per top-level clump. Define on class to avoid race with Util init.
     */
    get _clumpTitles(): {
        warning: string;
        manual: string;
        passed: string;
        notApplicable: string;
    };
    /**
     * @param {LH.ReportResult.AuditRef} audit
     * @return {Element}
     */
    renderAudit(audit: LH.ReportResult.AuditRef): Element;
    /**
     * Populate an DOM tree with audit details. Used by renderAudit and renderOpportunity
     * @param {LH.ReportResult.AuditRef} audit
     * @param {DocumentFragment} component
     * @return {!Element}
     */
    populateAuditValues(audit: LH.ReportResult.AuditRef, component: DocumentFragment): Element;
    /**
     * Inject the final screenshot next to the score gauge of the first category (likely Performance)
     * @param {HTMLElement} categoriesEl
     * @param {LH.ReportResult['audits']} audits
     * @param {Element} scoreScaleEl
     */
    injectFinalScreenshot(categoriesEl: HTMLElement, audits: LH.ReportResult, scoreScaleEl: Element): any;
    /**
     * @return {Element}
     */
    _createChevron(): Element;
    /**
     * @param {Element} element DOM node to populate with values.
     * @param {number|null} score
     * @param {string} scoreDisplayMode
     * @return {!Element}
     */
    _setRatingClass(element: Element, score: number | null, scoreDisplayMode: string): Element;
    /**
     * @param {LH.ReportResult.Category} category
     * @param {Record<string, LH.Result.ReportGroup>} groupDefinitions
     * @param {{gatherMode: LH.Result.GatherMode}=} options
     * @return {DocumentFragment}
     */
    renderCategoryHeader(category: LH.ReportResult.Category, groupDefinitions: Record<string, LH.Result.ReportGroup>, options?: {
        gatherMode: LH.Result.GatherMode;
    } | undefined): DocumentFragment;
    /**
     * Renders the group container for a group of audits. Individual audit elements can be added
     * directly to the returned element.
     * @param {LH.Result.ReportGroup} group
     * @return {[Element, Element | null]}
     */
    renderAuditGroup(group: LH.Result.ReportGroup): [Element, Element | null];
    /**
     * Takes an array of auditRefs, groups them if requested, then returns an
     * array of audit and audit-group elements.
     * @param {Array<LH.ReportResult.AuditRef>} auditRefs
     * @param {Object<string, LH.Result.ReportGroup>} groupDefinitions
     * @return {Array<Element>}
     */
    _renderGroupedAudits(auditRefs: Array<LH.ReportResult.AuditRef>, groupDefinitions: {
        [x: string]: LH.Result.ReportGroup;
    }): Array<Element>;
    /**
     * Take a set of audits, group them if they have groups, then render in a top-level
     * clump that can't be expanded/collapsed.
     * @param {Array<LH.ReportResult.AuditRef>} auditRefs
     * @param {Object<string, LH.Result.ReportGroup>} groupDefinitions
     * @return {Element}
     */
    renderUnexpandableClump(auditRefs: Array<LH.ReportResult.AuditRef>, groupDefinitions: {
        [x: string]: LH.Result.ReportGroup;
    }): Element;
    /**
     * Take a set of audits and render in a top-level, expandable clump that starts
     * in a collapsed state.
     * @param {Exclude<TopLevelClumpId, 'failed'>} clumpId
     * @param {{auditRefs: Array<LH.ReportResult.AuditRef>, description?: string}} clumpOpts
     * @return {!Element}
     */
    renderClump(clumpId: Exclude<TopLevelClumpId, 'failed'>, { auditRefs, description }: {
        auditRefs: Array<LH.ReportResult.AuditRef>;
        description?: string;
    }): Element;
    /**
     * @param {LH.ReportResult.Category} category
     * @param {Record<string, LH.Result.ReportGroup>} groupDefinitions
     * @param {{gatherMode: LH.Result.GatherMode, omitLabel?: boolean, onPageAnchorRendered?: (link: HTMLAnchorElement) => void}=} options
     * @return {DocumentFragment}
     */
    renderCategoryScore(category: LH.ReportResult.Category, groupDefinitions: Record<string, LH.Result.ReportGroup>, options?: {
        gatherMode: LH.Result.GatherMode;
        omitLabel?: boolean;
        onPageAnchorRendered?: (link: HTMLAnchorElement) => void;
    }): DocumentFragment;
    /**
     * @param {LH.ReportResult.Category} category
     * @param {Record<string, LH.Result.ReportGroup>} groupDefinitions
     * @return {DocumentFragment}
     */
    renderScoreGauge(category: LH.ReportResult.Category, groupDefinitions: Record<string, LH.Result.ReportGroup>): DocumentFragment;
    /**
     * @param {LH.ReportResult.Category} category
     * @return {DocumentFragment}
     */
    renderCategoryFraction(category: LH.ReportResult.Category): DocumentFragment;
    /**
     * Returns true if an LH category has any non-"notApplicable" audits.
     * @param {LH.ReportResult.Category} category
     * @return {boolean}
     */
    hasApplicableAudits(category: LH.ReportResult.Category): boolean;
    /**
     * Define the score arc of the gauge
     * Credit to xgad for the original technique: https://codepen.io/xgad/post/svg-radial-progress-meters
     * @param {SVGCircleElement} arcElem
     * @param {number} percent
     */
    _setGaugeArc(arcElem: SVGCircleElement, percent: number): void;
    /**
     * @param {LH.ReportResult.AuditRef} audit
     * @return {boolean}
     */
    _auditHasWarning(audit: LH.ReportResult.AuditRef): boolean;
    /**
     * Returns the id of the top-level clump to put this audit in.
     * @param {LH.ReportResult.AuditRef} auditRef
     * @return {TopLevelClumpId}
     */
    _getClumpIdForAuditRef(auditRef: LH.ReportResult.AuditRef): TopLevelClumpId;
    /**
     * Renders a set of top level sections (clumps), under a status of failed, warning,
     * manual, passed, or notApplicable. The result ends up something like:
     *
     * failed clump
     *   ├── audit 1 (w/o group)
     *   ├── audit 2 (w/o group)
     *   ├── audit group
     *   |  ├── audit 3
     *   |  └── audit 4
     *   └── audit group
     *      ├── audit 5
     *      └── audit 6
     * other clump (e.g. 'manual')
     *   ├── audit 1
     *   ├── audit 2
     *   ├── …
     *   ⋮
     * @param {LH.ReportResult.Category} category
     * @param {Object<string, LH.Result.ReportGroup>=} groupDefinitions
     * @param {{gatherMode: LH.Result.GatherMode}=} options
     * @return {Element}
     */
    render(category: LH.ReportResult.Category, groupDefinitions?: {
        [x: string]: LH.Result.ReportGroup;
    } | undefined, options?: {
        gatherMode: LH.Result.GatherMode;
    } | undefined): Element;
}
/**
 * @license Copyright 2021 The Lighthouse Authors. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
declare class TopbarFeatures {
    /**
     * @param {ReportUIFeatures} reportUIFeatures
     * @param {DOM} dom
     */
    constructor(reportUIFeatures: ReportUIFeatures, dom: DOM);
    /** @type {LH.Result} */
    lhr: LH.Result;
    _reportUIFeatures: ReportUIFeatures;
    _dom: DOM;
    _dropDownMenu: DropDownMenu;
    _copyAttempt: boolean;
    /** @type {HTMLElement} */
    topbarEl: HTMLElement;
    /** @type {HTMLElement} */
    categoriesEl: HTMLElement;
    /** @type {HTMLElement?} */
    stickyHeaderEl: HTMLElement | null;
    /** @type {HTMLElement} */
    highlightEl: HTMLElement;
    /**
     * Handler for tool button.
     * @param {Event} e
     */
    onDropDownMenuClick(e: Event): void;
    /**
     * Keyup handler for the document.
     * @param {KeyboardEvent} e
     */
    onKeyUp(e: KeyboardEvent): void;
    /**
     * Handle copy events.
     * @param {ClipboardEvent} e
     */
    onCopy(e: ClipboardEvent): void;
    /**
     * Collapses all audit `<details>`.
     * open a `<details>` element.
     */
    collapseAllDetails(): void;
    /**
     * @param {LH.Result} lhr
     */
    enable(lhr: LH.Result): void;
    /**
     * Copies the report JSON to the clipboard (if supported by the browser).
     */
    onCopyButtonClick(): void;
    /**
     * Expands all audit `<details>`.
     * Ideally, a print stylesheet could take care of this, but CSS has no way to
     * open a `<details>` element.
     */
    expandAllDetails(): void;
    _print(): void;
    /**
     * Resets the state of page before capturing the page for export.
     * When the user opens the exported HTML page, certain UI elements should
     * be in their closed state (not opened) and the templates should be unstamped.
     */
    resetUIState(): void;
    /**
     * Finds the first scrollable ancestor of `element`. Falls back to the document.
     * @param {Element} element
     * @return {Element | Document}
     */
    _getScrollParent(element: Element): Element | Document;
    /**
     * Sets up listeners to collapse audit `<details>` when the user closes the
     * print dialog, all `<details>` are collapsed.
     */
    _setUpCollapseDetailsAfterPrinting(): void;
    _setupStickyHeader(): void;
    /**
     * Toggle visibility and update highlighter position
     */
    _updateStickyHeader(): void;
}
/**
 * Populate the i18n string lookup dict with locale data
 * Used when the host environment selects the locale and serves lighthouse the intended locale file
 * @see https://docs.google.com/document/d/1jnt3BqKB-4q3AE94UWFA0Gqspx8Sd_jivlB7gQMlmfk/edit
 * @param {LH.Locale} locale
 * @param {Record<string, {message: string}>} lhlMessages
 */
declare function registerLocaleData(locale: LH.Locale, lhlMessages: Record<string, {
    message: string;
}>): void;
declare class DetailsRenderer {
    /**
     * @param {DOM} dom
     * @param {{fullPageScreenshot?: LH.Audit.Details.FullPageScreenshot}} [options]
     */
    constructor(dom: DOM, options?: {
        fullPageScreenshot?: LH.Audit.Details.FullPageScreenshot;
    });
    _dom: DOM;
    _fullPageScreenshot: LH.Audit.Details.FullPageScreenshot;
    /**
     * @param {AuditDetails} details
     * @return {Element|null}
     */
    render(details: AuditDetails): Element | null;
    /**
     * @param {{value: number, granularity?: number}} details
     * @return {Element}
     */
    _renderBytes(details: {
        value: number;
        granularity?: number;
    }): Element;
    /**
     * @param {{value: number, granularity?: number, displayUnit?: string}} details
     * @return {Element}
     */
    _renderMilliseconds(details: {
        value: number;
        granularity?: number;
        displayUnit?: string;
    }): Element;
    /**
     * @param {string} text
     * @return {HTMLElement}
     */
    renderTextURL(text: string): HTMLElement;
    /**
     * @param {{text: string, url: string}} details
     * @return {HTMLElement}
     */
    _renderLink(details: {
        text: string;
        url: string;
    }): HTMLElement;
    /**
     * @param {string} text
     * @return {HTMLDivElement}
     */
    _renderText(text: string): HTMLDivElement;
    /**
     * @param {{value: number, granularity?: number}} details
     * @return {Element}
     */
    _renderNumeric(details: {
        value: number;
        granularity?: number;
    }): Element;
    /**
     * Create small thumbnail with scaled down image asset.
     * @param {string} details
     * @return {Element}
     */
    _renderThumbnail(details: string): Element;
    /**
     * @param {string} type
     * @param {*} value
     */
    _renderUnknown(type: string, value: any): HTMLElementByTagName;
    /**
     * Render a details item value for embedding in a table. Renders the value
     * based on the heading's valueType, unless the value itself has a `type`
     * property to override it.
     * @param {TableItemValue} value
     * @param {LH.Audit.Details.OpportunityColumnHeading} heading
     * @return {Element|null}
     */
    _renderTableValue(value: TableItemValue, heading: LH.Audit.Details.OpportunityColumnHeading): Element | null;
    /**
     * Get the headings of a table-like details object, converted into the
     * OpportunityColumnHeading type until we have all details use the same
     * heading format.
     * @param {Table|OpportunityTable} tableLike
     * @return {OpportunityTable['headings']}
     */
    _getCanonicalizedHeadingsFromTable(tableLike: Table | OpportunityTable): OpportunityTable;
    /**
     * Get the headings of a table-like details object, converted into the
     * OpportunityColumnHeading type until we have all details use the same
     * heading format.
     * @param {Table['headings'][number]} heading
     * @return {OpportunityTable['headings'][number]}
     */
    _getCanonicalizedHeading(heading: Table): OpportunityTable;
    /**
     * @param {Exclude<LH.Audit.Details.TableColumnHeading['subItemsHeading'], undefined>} subItemsHeading
     * @param {LH.Audit.Details.TableColumnHeading} parentHeading
     * @return {LH.Audit.Details.OpportunityColumnHeading['subItemsHeading']}
     */
    _getCanonicalizedsubItemsHeading(subItemsHeading: Exclude<LH.Audit.Details.TableColumnHeading['subItemsHeading'], undefined>, parentHeading: LH.Audit.Details.TableColumnHeading): LH.Audit.Details.OpportunityColumnHeading;
    /**
     * Returns a new heading where the values are defined first by `heading.subItemsHeading`,
     * and secondly by `heading`. If there is no subItemsHeading, returns null, which will
     * be rendered as an empty column.
     * @param {LH.Audit.Details.OpportunityColumnHeading} heading
     * @return {LH.Audit.Details.OpportunityColumnHeading | null}
     */
    _getDerivedsubItemsHeading(heading: LH.Audit.Details.OpportunityColumnHeading): LH.Audit.Details.OpportunityColumnHeading | null;
    /**
     * @param {TableItem} item
     * @param {(LH.Audit.Details.OpportunityColumnHeading | null)[]} headings
     */
    _renderTableRow(item: TableItem, headings: (LH.Audit.Details.OpportunityColumnHeading | null)[]): HTMLElementByTagName;
    /**
     * Renders one or more rows from a details table item. A single table item can
     * expand into multiple rows, if there is a subItemsHeading.
     * @param {TableItem} item
     * @param {LH.Audit.Details.OpportunityColumnHeading[]} headings
     */
    _renderTableRowsFromItem(item: TableItem, headings: LH.Audit.Details.OpportunityColumnHeading[]): DocumentFragment;
    /**
     * @param {OpportunityTable|Table} details
     * @return {Element}
     */
    _renderTable(details: OpportunityTable | Table): Element;
    /**
     * @param {LH.FormattedIcu<LH.Audit.Details.List>} details
     * @return {Element}
     */
    _renderList(details: LH.FormattedIcu<LH.Audit.Details.List>): Element;
    /**
     * @param {LH.Audit.Details.NodeValue} item
     * @return {Element}
     */
    renderNode(item: LH.Audit.Details.NodeValue): Element;
    /**
     * @param {LH.Audit.Details.SourceLocationValue} item
     * @return {Element|null}
     * @protected
     */
    protected renderSourceLocation(item: LH.Audit.Details.SourceLocationValue): Element | null;
    /**
     * @param {LH.Audit.Details.Filmstrip} details
     * @return {Element}
     */
    _renderFilmstrip(details: LH.Audit.Details.Filmstrip): Element;
    /**
     * @param {string} text
     * @return {Element}
     */
    _renderCode(text: string): Element;
}
/**
 * @license Copyright 2021 The Lighthouse Authors. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
/** @typedef {import('./dom.js').DOM} DOM */
declare class DropDownMenu {
    /**
     * @param {DOM} dom
     */
    constructor(dom: DOM);
    /** @type {DOM} */
    _dom: DOM;
    /** @type {HTMLElement} */
    _toggleEl: HTMLElement;
    /** @type {HTMLElement} */
    _menuEl: HTMLElement;
    /**
     * Keydown handler for the document.
     * @param {KeyboardEvent} e
     */
    onDocumentKeyDown(e: KeyboardEvent): void;
    /**
     * Click handler for tools button.
     * @param {Event} e
     */
    onToggleClick(e: Event): void;
    /**
     * Handler for tool button.
     * @param {KeyboardEvent} e
     */
    onToggleKeydown(e: KeyboardEvent): void;
    /**
     * Focus out handler for the drop down menu.
     * @param {FocusEvent} e
     */
    onMenuFocusOut(e: FocusEvent): void;
    /**
     * Handler for tool DropDown.
     * @param {KeyboardEvent} e
     */
    onMenuKeydown(e: KeyboardEvent): void;
    /**
     * @param {?HTMLElement=} startEl
     * @return {HTMLElement}
     */
    _getNextMenuItem(startEl?: (HTMLElement | null) | undefined): HTMLElement;
    /**
     * @param {Array<Node>} allNodes
     * @param {?HTMLElement=} startNode
     * @return {HTMLElement}
     */
    _getNextSelectableNode(allNodes: Array<Node>, startNode?: (HTMLElement | null) | undefined): HTMLElement;
    /**
     * @param {?HTMLElement=} startEl
     * @return {HTMLElement}
     */
    _getPreviousMenuItem(startEl?: (HTMLElement | null) | undefined): HTMLElement;
    /**
     * @param {function(MouseEvent): any} menuClickHandler
     */
    setup(menuClickHandler: (arg0: MouseEvent) => any): void;
    close(): void;
    /**
     * @param {HTMLElement} firstFocusElement
     */
    open(firstFocusElement: HTMLElement): void;
}
export {};
