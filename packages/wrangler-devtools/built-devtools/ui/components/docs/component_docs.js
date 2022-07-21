// Copyright 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
// Ensure all image variables are defined in the component docs.
import '../../../Images/Images.js';
import * as CreateBreadcrumbs from './create_breadcrumbs.js';
import * as ToggleDarkMode from './toggle_dark_mode.js';
import * as ToggleFonts from './toggle_fonts.js';
ToggleDarkMode.init();
CreateBreadcrumbs.init();
ToggleFonts.init();
// This can be used by tests to hide the UI elements that are part of the component docs interface.
// E.g., this is useful for screenshot tests.
window.addEventListener('hidecomponentdocsui', () => {
    for (const node of document.querySelectorAll('.component-docs-ui')) {
        node.style.display = 'none';
    }
});
window.addEventListener('showcomponentdocsui', () => {
    for (const node of document.querySelectorAll('.component-docs-ui')) {
        node.style.display = '';
    }
});
//# sourceMappingURL=component_docs.js.map