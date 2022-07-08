// Copyright 2018 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import '../shell/shell.js';
import '../../panels/js_profiler/js_profiler-meta.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as UI from '../../ui/legacy/legacy.js';
import * as Common from '../../core/common/common.js';
import * as Root from '../../core/root/root.js';
import * as Main from '../main/main.js';
import { NodeMainImpl } from './NodeMain.js'; // eslint-disable-line rulesdir/es_modules_import
import { NodeConnectionsPanel } from './NodeConnectionsPanel.js'; // eslint-disable-line rulesdir/es_modules_import
const UIStrings = {
    /**
    *@description Text that refers to the network connection
    */
    connection: 'Connection',
    /**
   *@description A tag of Node.js Connection Panel that can be searched in the command menu
   */
    node: 'node',
    /**
     *@description Command for showing the Connection tool
     */
    showConnection: 'Show Connection',
    /**
     *@description Title of the 'Node' tool in the Network Navigator View, which is part of the Sources tool
    */
    networkTitle: 'Node',
    /**
     *@description Command for showing the 'Node' tool in the Network Navigator View, which is part of the Sources tool
    */
    showNode: 'Node',
};
const str_ = i18n.i18n.registerUIStrings('entrypoints/node_app/node_app.ts', UIStrings);
const i18nLazyString = i18n.i18n.getLazilyComputedLocalizedString.bind(undefined, str_);
let loadedSourcesModule;
async function loadSourcesModule() {
    if (!loadedSourcesModule) {
        loadedSourcesModule = await import('../../panels/sources/sources.js');
    }
    return loadedSourcesModule;
}
UI.ViewManager.registerViewExtension({
    location: "panel" /* PANEL */,
    id: 'node-connection',
    title: i18nLazyString(UIStrings.connection),
    commandPrompt: i18nLazyString(UIStrings.showConnection),
    order: 0,
    async loadView() {
        return NodeConnectionsPanel.instance();
    },
    tags: [i18nLazyString(UIStrings.node)],
});
UI.ViewManager.registerViewExtension({
    location: "navigator-view" /* NAVIGATOR_VIEW */,
    id: 'navigator-network',
    title: i18nLazyString(UIStrings.networkTitle),
    commandPrompt: i18nLazyString(UIStrings.showNode),
    order: 2,
    persistence: "permanent" /* PERMANENT */,
    async loadView() {
        const Sources = await loadSourcesModule();
        return Sources.SourcesNavigator.NetworkNavigatorView.instance();
    },
});
// @ts-ignore Exposed for legacy layout tests
self.runtime = Root.Runtime.Runtime.instance({ forceNew: true });
Common.Runnable.registerEarlyInitializationRunnable(NodeMainImpl.instance);
new Main.MainImpl.MainImpl();
//# sourceMappingURL=node_app.js.map