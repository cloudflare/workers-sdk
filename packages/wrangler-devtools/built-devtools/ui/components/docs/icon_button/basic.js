// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as IconButton from '../../icon_button/icon_button.js';
function appendComponent(data) {
    const component = new IconButton.IconButton.IconButton();
    component.data = data;
    document.getElementById('container')?.appendChild(component);
}
appendComponent({
    clickHandler: () => { },
    groups: [{ iconName: 'survey_feedback_icon', iconColor: 'var(--color-text-primary)', text: '1 item' }],
});
appendComponent({
    clickHandler: () => { },
    groups: [
        { iconName: 'survey_feedback_icon', iconColor: 'var(--color-primary)', text: 'Test' },
        { iconName: 'warning_icon', iconColor: '', text: '1' },
    ],
});
appendComponent({
    clickHandler: () => { },
    groups: [
        { iconName: 'issue-exclamation-icon', iconColor: 'yellow', text: '23', iconHeight: '2ex', iconWidth: '2ex' },
        { iconName: 'issue-text-icon', iconColor: 'blue', text: '1' },
    ],
});
appendComponent({
    groups: [
        { iconName: 'issue-exclamation-icon', iconColor: 'yellow', text: '23' },
        { iconName: 'issue-text-icon', iconColor: 'blue', text: '1' },
    ],
});
appendComponent({
    clickHandler: () => { },
    groups: [
        { iconName: 'issue-exclamation-icon', iconColor: 'yellow', text: '23' },
        { iconName: 'issue-text-icon', iconColor: 'blue', text: '1' },
    ],
    trailingText: 'Issues',
});
appendComponent({
    clickHandler: () => { },
    groups: [
        { iconName: 'issue-exclamation-icon', iconColor: 'yellow', text: '23' },
        { iconName: 'issue-text-icon', iconColor: 'blue', text: '1' },
    ],
    leadingText: 'Issues:',
});
appendComponent({
    clickHandler: () => { },
    groups: [
        { iconName: 'issue-exclamation-icon', iconColor: 'yellow', text: '23' },
        { iconName: 'issue-text-icon', iconColor: 'blue', text: '1' },
    ],
    leadingText: 'Issues:',
    compact: true,
});
//# sourceMappingURL=basic.js.map