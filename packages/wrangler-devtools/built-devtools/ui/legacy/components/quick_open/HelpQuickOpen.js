// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as IconButton from '../../../components/icon_button/icon_button.js';
import * as UI from '../../legacy.js';
import { getRegisteredProviders, Provider, registerProvider } from './FilteredListWidget.js';
import { QuickOpenImpl } from './QuickOpen.js';
let helpQuickOpenInstance;
export class HelpQuickOpen extends Provider {
    providers;
    constructor() {
        super();
        this.providers = [];
        getRegisteredProviders().forEach(this.addProvider.bind(this));
    }
    static instance(opts = { forceNew: null }) {
        const { forceNew } = opts;
        if (!helpQuickOpenInstance || forceNew) {
            helpQuickOpenInstance = new HelpQuickOpen();
        }
        return helpQuickOpenInstance;
    }
    addProvider(extension) {
        if (extension.titleSuggestion) {
            this.providers.push({
                prefix: extension.prefix || '',
                iconName: extension.iconName,
                title: extension.titlePrefix() + ' ' + extension.titleSuggestion(),
            });
        }
    }
    itemCount() {
        return this.providers.length;
    }
    itemKeyAt(itemIndex) {
        return this.providers[itemIndex].prefix;
    }
    itemScoreAt(itemIndex, _query) {
        return -this.providers[itemIndex].prefix.length;
    }
    renderItem(itemIndex, _query, titleElement, _subtitleElement) {
        const provider = this.providers[itemIndex];
        const iconElement = new IconButton.Icon.Icon();
        iconElement.data = {
            iconName: provider.iconName,
            color: 'var(--color-text-primary)',
            width: '18px',
            height: '18px',
        };
        titleElement.parentElement?.parentElement?.insertBefore(iconElement, titleElement.parentElement);
        UI.UIUtils.createTextChild(titleElement, provider.title);
    }
    selectItem(itemIndex, _promptValue) {
        if (itemIndex !== null) {
            QuickOpenImpl.show(this.providers[itemIndex].prefix);
        }
    }
    renderAsTwoRows() {
        return false;
    }
}
registerProvider({
    prefix: '?',
    iconName: 'ic_command_help',
    provider: () => Promise.resolve(HelpQuickOpen.instance()),
    titlePrefix: () => 'Help',
    titleSuggestion: undefined,
});
//# sourceMappingURL=HelpQuickOpen.js.map