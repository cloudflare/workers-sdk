// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as FrontendHelpers from '../../../../../test/unittests/front_end/helpers/EnvironmentHelpers.js';
import * as Buttons from '../../buttons/buttons.js';
import * as ComponentHelpers from '../../helpers/helpers.js';
await ComponentHelpers.ComponentServerSetup.setup();
await FrontendHelpers.initializeGlobalVars();
const testIcon = '/front_end/Images/ic_file_image.svg';
function appendButton(button) {
    document.querySelector('#container')?.appendChild(button);
}
function appendToToolbar(element) {
    document.querySelector('#toolbar')?.appendChild(element);
}
function appendToSmallToolbar(element) {
    document.querySelector('#small-toolbar')?.appendChild(element);
}
// Primary
const primaryButton = new Buttons.Button.Button();
primaryButton.data = {
    variant: "primary" /* PRIMARY */,
};
primaryButton.innerText = 'Click me';
primaryButton.title = 'Custom title';
primaryButton.onclick = () => alert('clicked');
appendButton(primaryButton);
const primaryButtonWithoutRightBorderRadius = new Buttons.Button.Button();
primaryButtonWithoutRightBorderRadius.data = {
    variant: "primary" /* PRIMARY */,
};
primaryButtonWithoutRightBorderRadius.style.setProperty('--override-button-no-right-border-radius', '1');
primaryButtonWithoutRightBorderRadius.innerText = 'No right border radius';
primaryButtonWithoutRightBorderRadius.title = 'Custom title';
primaryButtonWithoutRightBorderRadius.onclick = () => alert('clicked');
appendButton(primaryButtonWithoutRightBorderRadius);
// Primary (forced active)
const forcedActive = new Buttons.Button.Button();
forcedActive.data = {
    variant: "primary" /* PRIMARY */,
    active: true,
};
forcedActive.innerText = 'Forced active';
forcedActive.onclick = () => alert('clicked');
appendButton(forcedActive);
// Primary (forced spinner)
const forcedSpinner = new Buttons.Button.Button();
forcedSpinner.data = {
    variant: "primary" /* PRIMARY */,
    spinner: true,
};
forcedSpinner.innerText = 'Forced spinner';
forcedSpinner.onclick = () => alert('clicked');
appendButton(forcedSpinner);
// Secondary
const secondaryButton = new Buttons.Button.Button();
secondaryButton.innerText = 'Click me';
secondaryButton.onclick = () => alert('clicked');
secondaryButton.data = {
    variant: "secondary" /* SECONDARY */,
};
appendButton(secondaryButton);
// Secondary spinner
const secondarySpinnerButton = new Buttons.Button.Button();
secondarySpinnerButton.innerText = 'Click me';
secondarySpinnerButton.onclick = () => alert('clicked');
secondarySpinnerButton.data = {
    variant: "secondary" /* SECONDARY */,
    spinner: true,
};
appendButton(secondarySpinnerButton);
// Primary
const disabledPrimaryButtons = new Buttons.Button.Button();
disabledPrimaryButtons.data = {
    variant: "primary" /* PRIMARY */,
    disabled: true,
};
disabledPrimaryButtons.innerText = 'Cannot click me';
disabledPrimaryButtons.onclick = () => alert('clicked');
appendButton(disabledPrimaryButtons);
// Primary spinner
const disabledSpinnerPrimaryButtons = new Buttons.Button.Button();
disabledSpinnerPrimaryButtons.data = {
    variant: "primary" /* PRIMARY */,
    disabled: true,
    spinner: true,
};
disabledSpinnerPrimaryButtons.innerText = 'Cannot click me';
disabledSpinnerPrimaryButtons.onclick = () => alert('clicked');
appendButton(disabledSpinnerPrimaryButtons);
// Secondary
const disabledSecondaryButton = new Buttons.Button.Button();
disabledSecondaryButton.innerText = 'Cannot click me';
disabledSecondaryButton.onclick = () => alert('clicked');
disabledSecondaryButton.data = {
    variant: "secondary" /* SECONDARY */,
    disabled: true,
};
appendButton(disabledSecondaryButton);
// Secondary spinner
const disabledSpinnerSecondaryButton = new Buttons.Button.Button();
disabledSpinnerSecondaryButton.innerText = 'Cannot click me';
disabledSpinnerSecondaryButton.onclick = () => alert('clicked');
disabledSpinnerSecondaryButton.data = {
    variant: "secondary" /* SECONDARY */,
    disabled: true,
    spinner: true,
};
appendButton(disabledSpinnerSecondaryButton);
// Primary Icon
const primaryIconButton = new Buttons.Button.Button();
primaryIconButton.innerText = 'Click me';
primaryIconButton.data = {
    variant: "primary" /* PRIMARY */,
    iconUrl: testIcon,
};
primaryIconButton.onclick = () => alert('clicked');
appendButton(primaryIconButton);
// Secondary Icon
const secondaryIconButton = new Buttons.Button.Button();
secondaryIconButton.innerText = 'Focus the first button';
secondaryIconButton.onclick = () => {
    primaryButton.focus();
};
secondaryIconButton.data = {
    variant: "secondary" /* SECONDARY */,
    iconUrl: testIcon,
};
appendButton(secondaryIconButton);
// Primary Icon Only
const primaryIconOnlyButton = new Buttons.Button.Button();
primaryIconOnlyButton.data = {
    variant: "primary" /* PRIMARY */,
    iconUrl: testIcon,
};
primaryIconOnlyButton.onclick = () => alert('clicked');
primaryIconOnlyButton.style.width = '24px';
appendButton(primaryIconOnlyButton);
// Secondary Icon Only
const secondaryIconOnlyButton = new Buttons.Button.Button();
secondaryIconOnlyButton.onclick = () => alert('clicked');
secondaryIconOnlyButton.style.width = '24px';
secondaryIconOnlyButton.data = {
    variant: "secondary" /* SECONDARY */,
    iconUrl: testIcon,
};
appendButton(secondaryIconOnlyButton);
// Small Primary Icon
const smallPrimaryIconButton = new Buttons.Button.Button();
smallPrimaryIconButton.innerText = 'Click me';
smallPrimaryIconButton.data = {
    variant: "primary" /* PRIMARY */,
    iconUrl: testIcon,
    size: "SMALL" /* SMALL */,
};
smallPrimaryIconButton.onclick = () => alert('clicked');
appendButton(smallPrimaryIconButton);
// Small Secondary Icon Only
const smallSecondaryIconOnlyButton = new Buttons.Button.Button();
smallSecondaryIconOnlyButton.onclick = () => alert('clicked');
smallSecondaryIconOnlyButton.style.width = '18px';
smallSecondaryIconOnlyButton.data = {
    variant: "secondary" /* SECONDARY */,
    iconUrl: testIcon,
    size: "SMALL" /* SMALL */,
};
appendButton(smallSecondaryIconOnlyButton);
// Disabled Primary Icon
const disabledPrimaryIconButton = new Buttons.Button.Button();
disabledPrimaryIconButton.innerText = 'Cannot click me';
disabledPrimaryIconButton.data = {
    variant: "primary" /* PRIMARY */,
    iconUrl: testIcon,
    size: "SMALL" /* SMALL */,
    disabled: true,
};
disabledPrimaryIconButton.onclick = () => alert('clicked');
appendButton(disabledPrimaryIconButton);
// Small Disabled Secondary Icon Only
const disabledSecondaryIconOnlyButton = new Buttons.Button.Button();
disabledSecondaryIconOnlyButton.onclick = () => alert('clicked');
disabledSecondaryIconOnlyButton.style.width = '18px';
disabledSecondaryIconOnlyButton.data = {
    variant: "secondary" /* SECONDARY */,
    iconUrl: testIcon,
    size: "SMALL" /* SMALL */,
    disabled: true,
};
appendButton(disabledSecondaryIconOnlyButton);
// Round Button
const roundButton = new Buttons.Button.Button();
roundButton.data = {
    variant: "round" /* ROUND */,
    iconUrl: testIcon,
};
roundButton.title = 'Round Button';
roundButton.onclick = () => alert('clicked');
appendButton(roundButton);
// Disabled Round Button
const roundButtonDisabled = new Buttons.Button.Button();
roundButtonDisabled.data = {
    variant: "round" /* ROUND */,
    iconUrl: testIcon,
    disabled: true,
};
roundButtonDisabled.title = 'Disabled Round Button';
roundButtonDisabled.onclick = () => alert('clicked');
appendButton(roundButtonDisabled);
// Small Round Button
const smallRoundButton = new Buttons.Button.Button();
smallRoundButton.data = {
    variant: "round" /* ROUND */,
    iconUrl: testIcon,
    size: "SMALL" /* SMALL */,
};
smallRoundButton.title = 'Small Round Button';
smallRoundButton.onclick = () => alert('clicked');
appendButton(smallRoundButton);
// Small Disabled Round Button
const smallRoundButtonDisabled = new Buttons.Button.Button();
smallRoundButtonDisabled.data = {
    variant: "round" /* ROUND */,
    iconUrl: testIcon,
    disabled: true,
    size: "SMALL" /* SMALL */,
};
smallRoundButtonDisabled.title = 'Small Disabled Round Button';
smallRoundButtonDisabled.onclick = () => alert('clicked');
appendButton(smallRoundButtonDisabled);
for (let i = 0; i < 6; i++) {
    // Regular Toolbar Button
    const toolbarButton = new Buttons.Button.Button();
    toolbarButton.onclick = () => alert('clicked');
    toolbarButton.data = {
        variant: "toolbar" /* TOOLBAR */,
        iconUrl: testIcon,
    };
    appendToToolbar(toolbarButton);
    if (i % 3 === 1) {
        const sep = document.createElement('div');
        sep.classList.add('separator');
        appendToToolbar(sep);
    }
}
// Disabled Toolbar Button
const toolbarButton = new Buttons.Button.Button();
toolbarButton.onclick = () => alert('clicked');
toolbarButton.data = {
    variant: "toolbar" /* TOOLBAR */,
    iconUrl: testIcon,
    disabled: true,
};
appendToToolbar(toolbarButton);
for (let i = 0; i < 6; i++) {
    // Small Toolbar Button
    const smallToolbarButton = new Buttons.Button.Button();
    smallToolbarButton.onclick = () => alert('clicked');
    smallToolbarButton.data = {
        variant: "toolbar" /* TOOLBAR */,
        size: "SMALL" /* SMALL */,
        iconUrl: testIcon,
    };
    appendToSmallToolbar(smallToolbarButton);
    if (i % 3 === 1) {
        const sep = document.createElement('div');
        sep.classList.add('separator');
        appendToSmallToolbar(sep);
    }
}
// Submit Button
const submitButton = new Buttons.Button.Button();
submitButton.data = {
    variant: "primary" /* PRIMARY */,
    type: 'submit',
};
submitButton.innerText = 'Submit';
document.querySelector('#form')?.append(submitButton);
// Reset Button
const resetButton = new Buttons.Button.Button();
resetButton.data = {
    variant: "secondary" /* SECONDARY */,
    type: 'reset',
};
resetButton.innerText = 'Reset';
document.querySelector('#form')?.append(resetButton);
//# sourceMappingURL=basic.js.map