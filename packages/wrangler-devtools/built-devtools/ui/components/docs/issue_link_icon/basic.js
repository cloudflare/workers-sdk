// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as FrontendHelpers from '../../../../../test/unittests/front_end/helpers/EnvironmentHelpers.js';
import * as ComponentHelpers from '../../helpers/helpers.js';
await ComponentHelpers.ComponentServerSetup.setup();
await FrontendHelpers.initializeGlobalVars();
const IssueLinkIcon = await import('../../../../ui/components/issue_counter/issue_counter.js');
function appendComponent(data) {
    const component = new IssueLinkIcon.IssueLinkIcon.IssueLinkIcon();
    component.data = data;
    document.getElementById('container')?.appendChild(component);
}
appendComponent({
    issueId: 'fakeid',
    issueResolver: { waitFor: () => new Promise(() => { }) },
});
//# sourceMappingURL=basic.js.map