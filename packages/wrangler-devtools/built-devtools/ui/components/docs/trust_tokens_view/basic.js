// Copyright 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as FrontendHelpers from '../../../../../test/unittests/front_end/helpers/EnvironmentHelpers.js';
import * as ApplicationComponents from '../../../../panels/application/components/components.js';
import * as ComponentHelpers from '../../helpers/helpers.js';
await ComponentHelpers.ComponentServerSetup.setup();
await FrontendHelpers.initializeGlobalVars();
const component = new ApplicationComponents.TrustTokensView.TrustTokensView();
const fakeTrustTokens = [
    {
        issuerOrigin: 'google.com',
        count: 5,
    },
];
component.data = {
    tokens: fakeTrustTokens,
    deleteClickHandler: (...args) => {
        alert(`delete handler called ${args.join(', ')}`);
    },
};
document.getElementById('container')?.appendChild(component);
//# sourceMappingURL=basic.js.map