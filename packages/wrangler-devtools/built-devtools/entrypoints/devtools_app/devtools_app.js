// Copyright 2018 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import '../shell/shell.js';
import '../../panels/css_overview/css_overview-meta.js';
import '../../panels/elements/elements-meta.js';
import '../../panels/browser_debugger/browser_debugger-meta.js';
import '../../panels/network/network-meta.js';
import '../../panels/security/security-meta.js';
import '../../panels/emulation/emulation-meta.js';
import '../../panels/sensors/sensors-meta.js';
import '../../panels/accessibility/accessibility-meta.js';
import '../../panels/animation/animation-meta.js';
import '../../panels/developer_resources/developer_resources-meta.js';
import '../inspector_main/inspector_main-meta.js';
import '../../panels/application/application-meta.js';
import '../../panels/issues/issues-meta.js';
import '../../panels/layers/layers-meta.js';
import '../../panels/lighthouse/lighthouse-meta.js';
import '../../panels/media/media-meta.js';
import '../../panels/mobile_throttling/mobile_throttling-meta.js';
import '../../panels/performance_monitor/performance_monitor-meta.js';
import '../../panels/timeline/timeline-meta.js';
import '../../panels/web_audio/web_audio-meta.js';
import '../../panels/webauthn/webauthn-meta.js';
import '../../panels/layer_viewer/layer_viewer-meta.js';
import * as Root from '../../core/root/root.js';
import * as Main from '../main/main.js';
// @ts-ignore Exposed for legacy layout tests
self.runtime = Root.Runtime.Runtime.instance({ forceNew: true });
new Main.MainImpl.MainImpl();
//# sourceMappingURL=devtools_app.js.map