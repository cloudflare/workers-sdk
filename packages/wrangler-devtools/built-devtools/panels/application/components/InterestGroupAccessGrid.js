// Copyright 2022 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../../core/i18n/i18n.js';
import * as DataGrid from '../../../ui/components/data_grid/data_grid.js';
import * as ComponentHelpers from '../../../ui/components/helpers/helpers.js';
import * as IconButton from '../../../ui/components/icon_button/icon_button.js';
import * as LitHtml from '../../../ui/lit-html/lit-html.js';
import interestGroupAccessGridStyles from './interestGroupAccessGrid.css.js';
const UIStrings = {
    /**
    *@description Hover text for an info icon in the Interest Group Event panel
    * An interest group is an ad targeting group stored on the browser that can
    * be used to show a certain set of advertisements in the future as the
    * outcome of a FLEDGE auction.
    */
    allInterestGroupStorageEvents: 'All interest group storage events.',
    /**
      *@description Text in InterestGroupStorage Items View of the Application panel
      * Date and time of an Interest Group storage event in a locale-
      * dependent format.
      */
    eventTime: 'Event Time',
    /**
    *@description Text in InterestGroupStorage Items View of the Application panel
    * Type of interest group event such as 'join', 'bid', 'win', or 'leave'.
    */
    eventType: 'Access Type',
    /**
     *@description Text in InterestGroupStorage Items View of the Application panel
     * Owner of the interest group. The origin that controls the
     * content of information associated with the interest group such as which
     * ads get displayed.
    */
    groupOwner: 'Owner',
    /**
     *@description Text in InterestGroupStorage Items View of the Application panel
     * Name of the interest group. The name is unique per-owner and identifies the
     * interest group.
    */
    groupName: 'Name',
    /**
     *@description Text shown instead of a table when the table would be empty.
    */
    noEvents: 'No interest group events recorded.',
};
const str_ = i18n.i18n.registerUIStrings('panels/application/components/InterestGroupAccessGrid.ts', UIStrings);
export const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class InterestGroupAccessGrid extends HTMLElement {
    static litTagName = LitHtml.literal `devtools-interest-group-access-grid`;
    #shadow = this.attachShadow({ mode: 'open' });
    #datastores = [];
    connectedCallback() {
        this.#shadow.adoptedStyleSheets = [interestGroupAccessGridStyles];
        this.#render();
    }
    set data(data) {
        this.#datastores = data;
        this.#render();
    }
    #render() {
        // clang-format off
        LitHtml.render(LitHtml.html `
      <div>
        <span class="heading">Interest Groups</span>
        <${IconButton.Icon.Icon.litTagName} class="info-icon" title=${i18nString(UIStrings.allInterestGroupStorageEvents)}
          .data=${{ iconName: 'ic_info_black_18dp', color: 'var(--color-link)', width: '14px' }}>
        </${IconButton.Icon.Icon.litTagName}>
        ${this.#renderGridOrNoDataMessage()}
      </div>
    `, this.#shadow, { host: this });
        // clang-format on
    }
    #renderGridOrNoDataMessage() {
        if (this.#datastores.length === 0) {
            return LitHtml.html `<div class="no-events-message">${i18nString(UIStrings.noEvents)}</div>`;
        }
        const gridData = {
            columns: [
                {
                    id: 'event-time',
                    title: i18nString(UIStrings.eventTime),
                    widthWeighting: 10,
                    hideable: false,
                    visible: true,
                    sortable: true,
                },
                {
                    id: 'event-type',
                    title: i18nString(UIStrings.eventType),
                    widthWeighting: 5,
                    hideable: false,
                    visible: true,
                    sortable: true,
                },
                {
                    id: 'event-group-owner',
                    title: i18nString(UIStrings.groupOwner),
                    widthWeighting: 10,
                    hideable: false,
                    visible: true,
                    sortable: true,
                },
                {
                    id: 'event-group-name',
                    title: i18nString(UIStrings.groupName),
                    widthWeighting: 10,
                    hideable: false,
                    visible: true,
                    sortable: true,
                },
            ],
            rows: this.#buildRows(),
            initialSort: {
                columnId: 'event-time',
                direction: "ASC" /* ASC */,
            },
        };
        return LitHtml.html `
      <${DataGrid.DataGridController.DataGridController.litTagName} .data=${gridData}></${DataGrid.DataGridController.DataGridController.litTagName}>
    `;
    }
    #buildRows() {
        return this.#datastores.map(event => ({
            cells: [
                {
                    columnId: 'event-time',
                    value: event.accessTime,
                    renderer: this.#renderDateForDataGridCell.bind(this),
                },
                { columnId: 'event-type', value: event.type },
                { columnId: 'event-group-owner', value: event.ownerOrigin },
                { columnId: 'event-group-name', value: event.name },
            ],
        }));
    }
    #renderDateForDataGridCell(value) {
        const date = new Date(1e3 * value);
        return LitHtml.html `${date.toLocaleString()}`;
    }
}
ComponentHelpers.CustomElements.defineComponent('devtools-interest-group-access-grid', InterestGroupAccessGrid);
//# sourceMappingURL=InterestGroupAccessGrid.js.map