// Copyright 2022 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as FrontendHelpers from '../../../../../test/unittests/front_end/helpers/EnvironmentHelpers.js';
import * as PanelIntroductionSteps from '../../../components/panel_introduction_steps/panel_introduction_steps.js';
import * as LitHtml from '../../../lit-html/lit-html.js';
import * as ComponentHelpers from '../../helpers/helpers.js';
await ComponentHelpers.ComponentServerSetup.setup();
await FrontendHelpers.initializeGlobalVars();
const container = document.getElementById('container');
if (container) {
    LitHtml.render(LitHtml.html `
<${PanelIntroductionSteps.PanelIntroductionSteps.PanelIntroductionSteps.litTagName}>
<span slot="title">Get actionable insights on your website's performance</span>
<span slot="step-1">Record or import a trace into the Performance Insights panel</span>
<span slot="step-2">Get an overview of your page’s runtime performance</span>
<span slot="step-3">Identify improvements to your performance via a list of actionable insights</span>
</${PanelIntroductionSteps.PanelIntroductionSteps.PanelIntroductionSteps.litTagName}>
                 `, container, { host: this });
}
//# sourceMappingURL=basic.js.map