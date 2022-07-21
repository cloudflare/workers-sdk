// Copyright 2018 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import '../shell/shell.js';
import '../../panels/js_profiler/js_profiler-meta.js';
import * as Common from '../../core/common/common.js';
import * as Host from '../../core/host/host.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as Components from '../../ui/legacy/components/utils/utils.js';
import * as Main from '../main/main.js';
const UIStrings = {
    /**
    *@description Text that refers to the main target.
    */
    main: 'Main',
};
const str_ = i18n.i18n.registerUIStrings('entrypoints/js_app/js_app.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
let jsMainImplInstance;
export class JsMainImpl {
    static instance(opts = { forceNew: null }) {
        const { forceNew } = opts;
        if (!jsMainImplInstance || forceNew) {
            jsMainImplInstance = new JsMainImpl();
        }
        return jsMainImplInstance;
    }
    async run() {
        Host.userMetrics.actionTaken(Host.UserMetrics.Action.ConnectToNodeJSDirectly);
        void SDK.Connections.initMainConnection(async () => {
            const target = SDK.TargetManager.TargetManager.instance().createTarget('main', i18nString(UIStrings.main), SDK.Target.Type.Node, null);
            void target.runtimeAgent().invoke_runIfWaitingForDebugger();
        }, Components.TargetDetachedDialog.TargetDetachedDialog.webSocketConnectionLost);
    }
}
Common.Runnable.registerEarlyInitializationRunnable(JsMainImpl.instance);
new Main.MainImpl.MainImpl();
//# sourceMappingURL=js_app.js.map