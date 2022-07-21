// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as FrontendHelpers from '../../../../../test/unittests/front_end/helpers/EnvironmentHelpers.js';
import * as PanelFeedback from '../../../components/panel_feedback/panel_feedback.js';
import * as ComponentHelpers from '../../helpers/helpers.js';
await ComponentHelpers.ComponentServerSetup.setup();
await FrontendHelpers.initializeGlobalVars();
const component = new PanelFeedback.FeedbackButton.FeedbackButton();
component.data = {
    feedbackUrl: 'https://www.example.com',
};
document.getElementById('container')?.appendChild(component);
//# sourceMappingURL=button.js.map