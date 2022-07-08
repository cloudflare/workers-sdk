// Copyright 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as Host from '../../core/host/host.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as DataGrid from '../../ui/legacy/components/data_grid/data_grid.js';
import * as UI from '../../ui/legacy/legacy.js';
import webauthnPaneStyles from './webauthnPane.css.js';
const UIStrings = {
    /**
    *@description Label for button that allows user to download the private key related to a credential.
    */
    export: 'Export',
    /**
    *@description Label for an item to remove something
    */
    remove: 'Remove',
    /**
    *@description Label for empty credentials table.
    *@example {navigator.credentials.create()} PH1
    */
    noCredentialsTryCallingSFromYour: 'No credentials. Try calling {PH1} from your website.',
    /**
    *@description Label for checkbox to toggle the virtual authenticator environment allowing user to interact with software-based virtual authenticators.
    */
    enableVirtualAuthenticator: 'Enable virtual authenticator environment',
    /**
    *@description Label for ID field for credentials.
    */
    id: 'ID',
    /**
    *@description Label for field that describes whether a credential is a resident credential.
    */
    isResident: 'Is Resident',
    /**
    *@description Label for credential field that represents the Relying Party ID that the credential is scoped to.
    */
    rpId: 'RP ID',
    /**
    *@description Label for a column in a table. A field/unique ID that represents the user a credential is mapped to.
    */
    userHandle: 'User Handle',
    /**
    *@description Label for signature counter field for credentials which represents the number of successful assertions.
    * See https://w3c.github.io/webauthn/#signature-counter.
    */
    signCount: 'Signature Count',
    /**
    *@description Label for column with actions for credentials.
    */
    actions: 'Actions',
    /**
    *@description Title for the table that holds the credentials that a authenticator has registered.
    */
    credentials: 'Credentials',
    /**
    *@description Label for the learn more link that is shown before the virtual environment is enabled.
    */
    useWebauthnForPhishingresistant: 'Use WebAuthn for phishing-resistant authentication',
    /**
    *@description Text that is usually a hyperlink to more documentation
    */
    learnMore: 'Learn more',
    /**
    *@description Title for section of interface that allows user to add a new virtual authenticator.
    */
    newAuthenticator: 'New authenticator',
    /**
    *@description Text for security or network protocol
    */
    protocol: 'Protocol',
    /**
    *@description Label for input to select which transport option to use on virtual authenticators, e.g. USB or Bluetooth.
    */
    transport: 'Transport',
    /**
    *@description Label for checkbox that toggles resident key support on virtual authenticators.
    */
    supportsResidentKeys: 'Supports resident keys',
    /**
    *@description Label for checkbox that toggles large blob support on virtual authenticators. Large blobs are opaque data associated
    * with a WebAuthn credential that a website can store, like an SSH certificate or a symmetric encryption key.
    * See https://w3c.github.io/webauthn/#sctn-large-blob-extension
    */
    supportsLargeBlob: 'Supports large blob',
    /**
    *@description Text to add something
    */
    add: 'Add',
    /**
    *@description Label for button to add a new virtual authenticator.
    */
    addAuthenticator: 'Add authenticator',
    /**
    *@description Label for radio button that toggles whether an authenticator is active.
    */
    active: 'Active',
    /**
    *@description Title for button that enables user to customize name of authenticator.
    */
    editName: 'Edit name',
    /**
    *@description Title for button that enables user to save name of authenticator after editing it.
    */
    saveName: 'Save name',
    /**
    *@description Title for a user-added virtual authenticator which is uniquely identified with its AUTHENTICATORID.
    *@example {8c7873be-0b13-4996-a794-1521331bbd96} PH1
    */
    authenticatorS: 'Authenticator {PH1}',
    /**
    *@description Name for generated file which user can download. A private key is a secret code which enables encoding and decoding of a credential. .pem is the file extension.
    */
    privateKeypem: 'Private key.pem',
    /**
    *@description Label for field that holds an authenticator's universally unique identifier (UUID).
    */
    uuid: 'UUID',
    /**
    *@description Label for checkbox that toggles user verification support on virtual authenticators.
    */
    supportsUserVerification: 'Supports user verification',
    /**
    *@description Text in Timeline indicating that input has happened recently
    */
    yes: 'Yes',
    /**
    *@description Text in Timeline indicating that input has not happened recently
    */
    no: 'No',
    /**
    *@description Title of radio button that sets an authenticator as active.
    *@example {Authenticator ABCDEF} PH1
    */
    setSAsTheActiveAuthenticator: 'Set {PH1} as the active authenticator',
};
const str_ = i18n.i18n.registerUIStrings('panels/webauthn/WebauthnPane.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
const TIMEOUT = 1000;
class DataGridNode extends DataGrid.DataGrid.DataGridNode {
    credential;
    constructor(credential) {
        super(credential);
        this.credential = credential;
    }
    nodeSelfHeight() {
        return 24;
    }
    createCell(columnId) {
        const cell = super.createCell(columnId);
        UI.Tooltip.Tooltip.install(cell, cell.textContent || '');
        if (columnId !== 'actions') {
            return cell;
        }
        const exportButton = UI.UIUtils.createTextButton(i18nString(UIStrings.export), () => {
            if (this.dataGrid) {
                this.dataGrid.dispatchEventToListeners("ExportCredential" /* ExportCredential */, this.credential);
            }
        });
        cell.appendChild(exportButton);
        const removeButton = UI.UIUtils.createTextButton(i18nString(UIStrings.remove), () => {
            if (this.dataGrid) {
                this.dataGrid.dispatchEventToListeners("RemoveCredential" /* RemoveCredential */, this.credential);
            }
        });
        cell.appendChild(removeButton);
        return cell;
    }
}
class WebauthnDataGridBase extends DataGrid.DataGrid.DataGridImpl {
}
class WebauthnDataGrid extends Common.ObjectWrapper.eventMixin(WebauthnDataGridBase) {
}
class EmptyDataGridNode extends DataGrid.DataGrid.DataGridNode {
    createCells(element) {
        element.removeChildren();
        const td = this.createTDWithClass(DataGrid.DataGrid.Align.Center);
        if (this.dataGrid) {
            td.colSpan = this.dataGrid.visibleColumnsArray.length;
        }
        const code = document.createElement('span', { is: 'source-code' });
        code.textContent = 'navigator.credentials.create()';
        code.classList.add('code');
        const message = i18n.i18n.getFormatLocalizedString(str_, UIStrings.noCredentialsTryCallingSFromYour, { PH1: code });
        td.appendChild(message);
        element.appendChild(td);
    }
}
let webauthnPaneImplInstance;
// We extrapolate this variable as otherwise git detects a private key, even though we
// perform string manipulation. If we extract the name, then the regex doesn't match
// and we can upload as expected.
const PRIVATE_NAME = 'PRIVATE';
const PRIVATE_KEY_HEADER = `-----BEGIN ${PRIVATE_NAME} KEY-----
`;
const PRIVATE_KEY_FOOTER = `-----END ${PRIVATE_NAME} KEY-----`;
const PROTOCOL_AUTHENTICATOR_VALUES = {
    Ctap2: "ctap2" /* Ctap2 */,
    U2f: "u2f" /* U2f */,
};
export class WebauthnPaneImpl extends UI.Widget.VBox {
    #activeAuthId = null;
    #hasBeenEnabled = false;
    #dataGrids = new Map();
    #enableCheckbox;
    #availableAuthenticatorSetting;
    #model;
    #authenticatorsView;
    #topToolbarContainer;
    #topToolbar;
    #learnMoreView;
    #newAuthenticatorSection;
    #newAuthenticatorForm;
    #protocolSelect;
    #transportSelect;
    #residentKeyCheckboxLabel;
    residentKeyCheckbox;
    #userVerificationCheckboxLabel;
    #userVerificationCheckbox;
    #largeBlobCheckboxLabel;
    largeBlobCheckbox;
    addAuthenticatorButton;
    #isEnabling;
    constructor() {
        super(true);
        SDK.TargetManager.TargetManager.instance().observeModels(SDK.WebAuthnModel.WebAuthnModel, this);
        this.contentElement.classList.add('webauthn-pane');
        this.#availableAuthenticatorSetting =
            Common.Settings.Settings.instance().createSetting('webauthnAuthenticators', []);
        this.#createToolbar();
        this.#authenticatorsView = this.contentElement.createChild('div', 'authenticators-view');
        this.#createNewAuthenticatorSection();
        this.#updateVisibility(false);
    }
    static instance(opts = { forceNew: null }) {
        const { forceNew } = opts;
        if (!webauthnPaneImplInstance || forceNew) {
            webauthnPaneImplInstance = new WebauthnPaneImpl();
        }
        return webauthnPaneImplInstance;
    }
    modelAdded(model) {
        if (model.target() === SDK.TargetManager.TargetManager.instance().mainTarget()) {
            this.#model = model;
        }
    }
    modelRemoved(model) {
        if (model.target() === SDK.TargetManager.TargetManager.instance().mainTarget()) {
            this.#model = undefined;
        }
    }
    async #loadInitialAuthenticators() {
        let activeAuthenticatorId = null;
        const availableAuthenticators = this.#availableAuthenticatorSetting.get();
        for (const options of availableAuthenticators) {
            if (!this.#model) {
                continue;
            }
            const authenticatorId = await this.#model.addAuthenticator(options);
            void this.#addAuthenticatorSection(authenticatorId, options);
            // Update the authenticatorIds in the options.
            options.authenticatorId = authenticatorId;
            if (options.active) {
                activeAuthenticatorId = authenticatorId;
            }
        }
        // Update the settings to reflect the new authenticatorIds.
        this.#availableAuthenticatorSetting.set(availableAuthenticators);
        if (activeAuthenticatorId) {
            void this.#setActiveAuthenticator(activeAuthenticatorId);
        }
    }
    async ownerViewDisposed() {
        if (this.#enableCheckbox) {
            this.#enableCheckbox.setChecked(false);
        }
        await this.#setVirtualAuthEnvEnabled(false);
    }
    #createToolbar() {
        this.#topToolbarContainer = this.contentElement.createChild('div', 'webauthn-toolbar-container');
        this.#topToolbar = new UI.Toolbar.Toolbar('webauthn-toolbar', this.#topToolbarContainer);
        const enableCheckboxTitle = i18nString(UIStrings.enableVirtualAuthenticator);
        this.#enableCheckbox =
            new UI.Toolbar.ToolbarCheckbox(enableCheckboxTitle, enableCheckboxTitle, this.#handleCheckboxToggle.bind(this));
        this.#topToolbar.appendToolbarItem(this.#enableCheckbox);
    }
    #createCredentialsDataGrid(authenticatorId) {
        const columns = [
            {
                id: 'credentialId',
                title: i18nString(UIStrings.id),
                longText: true,
                weight: 24,
            },
            {
                id: 'isResidentCredential',
                title: i18nString(UIStrings.isResident),
                dataType: DataGrid.DataGrid.DataType.Boolean,
                weight: 10,
            },
            {
                id: 'rpId',
                title: i18nString(UIStrings.rpId),
            },
            {
                id: 'userHandle',
                title: i18nString(UIStrings.userHandle),
            },
            {
                id: 'signCount',
                title: i18nString(UIStrings.signCount),
            },
            { id: 'actions', title: i18nString(UIStrings.actions) },
        ];
        const dataGridConfig = {
            displayName: i18nString(UIStrings.credentials),
            columns,
            editCallback: undefined,
            deleteCallback: undefined,
            refreshCallback: undefined,
        };
        const dataGrid = new WebauthnDataGrid(dataGridConfig);
        dataGrid.renderInline();
        dataGrid.setStriped(true);
        dataGrid.addEventListener("ExportCredential" /* ExportCredential */, this.#handleExportCredential, this);
        dataGrid.addEventListener("RemoveCredential" /* RemoveCredential */, this.#handleRemoveCredential.bind(this, authenticatorId));
        this.#dataGrids.set(authenticatorId, dataGrid);
        return dataGrid;
    }
    #handleExportCredential({ data: credential }) {
        this.#exportCredential(credential);
    }
    #handleRemoveCredential(authenticatorId, { data: credential, }) {
        void this.#removeCredential(authenticatorId, credential.credentialId);
    }
    async #updateCredentials(authenticatorId) {
        const dataGrid = this.#dataGrids.get(authenticatorId);
        if (!dataGrid) {
            return;
        }
        if (this.#model) {
            const credentials = await this.#model.getCredentials(authenticatorId);
            dataGrid.rootNode().removeChildren();
            for (const credential of credentials) {
                const node = new DataGridNode(credential);
                dataGrid.rootNode().appendChild(node);
            }
            this.#maybeAddEmptyNode(dataGrid);
        }
        // TODO(crbug.com/1112528): Add back-end events for credential creation and removal to avoid polling.
        window.setTimeout(this.#updateCredentials.bind(this, authenticatorId), TIMEOUT);
    }
    #maybeAddEmptyNode(dataGrid) {
        if (dataGrid.rootNode().children.length) {
            return;
        }
        const node = new EmptyDataGridNode();
        dataGrid.rootNode().appendChild(node);
    }
    async #setVirtualAuthEnvEnabled(enable) {
        await this.#isEnabling;
        this.#isEnabling = new Promise(async (resolve) => {
            if (enable && !this.#hasBeenEnabled) {
                // Ensures metric is only tracked once per session.
                Host.userMetrics.actionTaken(Host.UserMetrics.Action.VirtualAuthenticatorEnvironmentEnabled);
                this.#hasBeenEnabled = true;
            }
            if (this.#model) {
                await this.#model.setVirtualAuthEnvEnabled(enable);
            }
            if (enable) {
                await this.#loadInitialAuthenticators();
            }
            else {
                this.#removeAuthenticatorSections();
            }
            this.#updateVisibility(enable);
            this.#isEnabling = undefined;
            resolve();
        });
    }
    #updateVisibility(enabled) {
        this.contentElement.classList.toggle('enabled', enabled);
    }
    #removeAuthenticatorSections() {
        this.#authenticatorsView.innerHTML = '';
        for (const dataGrid of this.#dataGrids.values()) {
            dataGrid.asWidget().detach();
        }
        this.#dataGrids.clear();
    }
    #handleCheckboxToggle(e) {
        void this.#setVirtualAuthEnvEnabled(e.target.checked);
    }
    #updateEnabledTransportOptions(enabledOptions) {
        if (!this.#transportSelect) {
            return;
        }
        const prevValue = this.#transportSelect.value;
        this.#transportSelect.removeChildren();
        for (const option of enabledOptions) {
            this.#transportSelect.appendChild(new Option(option, option));
        }
        // Make sure the currently selected value stays the same.
        this.#transportSelect.value = prevValue;
        // If the new set does not include the previous value.
        if (!this.#transportSelect.value) {
            // Select the first available value.
            this.#transportSelect.selectedIndex = 0;
        }
    }
    #updateNewAuthenticatorSectionOptions() {
        if (!this.#protocolSelect || !this.residentKeyCheckbox || !this.#userVerificationCheckbox ||
            !this.largeBlobCheckbox) {
            return;
        }
        if (this.#protocolSelect.value === "ctap2" /* Ctap2 */) {
            this.residentKeyCheckbox.disabled = false;
            this.#userVerificationCheckbox.disabled = false;
            this.largeBlobCheckbox.disabled = !this.residentKeyCheckbox.checked;
            if (this.largeBlobCheckbox.disabled) {
                this.largeBlobCheckbox.checked = false;
            }
            this.#updateEnabledTransportOptions([
                "usb" /* Usb */,
                "ble" /* Ble */,
                "nfc" /* Nfc */,
                "internal" /* Internal */,
            ]);
        }
        else {
            this.residentKeyCheckbox.checked = false;
            this.residentKeyCheckbox.disabled = true;
            this.#userVerificationCheckbox.checked = false;
            this.#userVerificationCheckbox.disabled = true;
            this.largeBlobCheckbox.checked = false;
            this.largeBlobCheckbox.disabled = true;
            this.#updateEnabledTransportOptions([
                "usb" /* Usb */,
                "ble" /* Ble */,
                "nfc" /* Nfc */,
            ]);
        }
    }
    #createNewAuthenticatorSection() {
        this.#learnMoreView = this.contentElement.createChild('div', 'learn-more');
        this.#learnMoreView.appendChild(UI.Fragment.html `
  <div>
  ${i18nString(UIStrings.useWebauthnForPhishingresistant)}<br /><br />
  ${UI.XLink.XLink.create('https://developers.google.com/web/updates/2018/05/webauthn', i18nString(UIStrings.learnMore))}
  </div>
  `);
        this.#newAuthenticatorSection = this.contentElement.createChild('div', 'new-authenticator-container');
        const newAuthenticatorTitle = UI.UIUtils.createLabel(i18nString(UIStrings.newAuthenticator), 'new-authenticator-title');
        this.#newAuthenticatorSection.appendChild(newAuthenticatorTitle);
        this.#newAuthenticatorForm = this.#newAuthenticatorSection.createChild('div', 'new-authenticator-form');
        const protocolGroup = this.#newAuthenticatorForm.createChild('div', 'authenticator-option');
        const transportGroup = this.#newAuthenticatorForm.createChild('div', 'authenticator-option');
        const residentKeyGroup = this.#newAuthenticatorForm.createChild('div', 'authenticator-option');
        const userVerificationGroup = this.#newAuthenticatorForm.createChild('div', 'authenticator-option');
        const largeBlobGroup = this.#newAuthenticatorForm.createChild('div', 'authenticator-option');
        const addButtonGroup = this.#newAuthenticatorForm.createChild('div', 'authenticator-option');
        const protocolSelectTitle = UI.UIUtils.createLabel(i18nString(UIStrings.protocol), 'authenticator-option-label');
        protocolGroup.appendChild(protocolSelectTitle);
        this.#protocolSelect = protocolGroup.createChild('select', 'chrome-select');
        UI.ARIAUtils.bindLabelToControl(protocolSelectTitle, this.#protocolSelect);
        Object.values(PROTOCOL_AUTHENTICATOR_VALUES)
            .sort()
            .forEach((option) => {
            if (this.#protocolSelect) {
                this.#protocolSelect.appendChild(new Option(option, option));
            }
        });
        if (this.#protocolSelect) {
            this.#protocolSelect.value = "ctap2" /* Ctap2 */;
        }
        const transportSelectTitle = UI.UIUtils.createLabel(i18nString(UIStrings.transport), 'authenticator-option-label');
        transportGroup.appendChild(transportSelectTitle);
        this.#transportSelect = transportGroup.createChild('select', 'chrome-select');
        UI.ARIAUtils.bindLabelToControl(transportSelectTitle, this.#transportSelect);
        // transportSelect will be populated in updateNewAuthenticatorSectionOptions.
        this.#residentKeyCheckboxLabel = UI.UIUtils.CheckboxLabel.create(i18nString(UIStrings.supportsResidentKeys), false);
        this.#residentKeyCheckboxLabel.textElement.classList.add('authenticator-option-label');
        residentKeyGroup.appendChild(this.#residentKeyCheckboxLabel.textElement);
        this.residentKeyCheckbox = this.#residentKeyCheckboxLabel.checkboxElement;
        this.residentKeyCheckbox.checked = false;
        this.residentKeyCheckbox.classList.add('authenticator-option-checkbox');
        residentKeyGroup.appendChild(this.#residentKeyCheckboxLabel);
        this.#userVerificationCheckboxLabel = UI.UIUtils.CheckboxLabel.create('Supports user verification', false);
        this.#userVerificationCheckboxLabel.textElement.classList.add('authenticator-option-label');
        userVerificationGroup.appendChild(this.#userVerificationCheckboxLabel.textElement);
        this.#userVerificationCheckbox = this.#userVerificationCheckboxLabel.checkboxElement;
        this.#userVerificationCheckbox.checked = false;
        this.#userVerificationCheckbox.classList.add('authenticator-option-checkbox');
        userVerificationGroup.appendChild(this.#userVerificationCheckboxLabel);
        this.#largeBlobCheckboxLabel = UI.UIUtils.CheckboxLabel.create(i18nString(UIStrings.supportsLargeBlob), false);
        this.#largeBlobCheckboxLabel.textElement.classList.add('authenticator-option-label');
        largeBlobGroup.appendChild(this.#largeBlobCheckboxLabel.textElement);
        this.largeBlobCheckbox = this.#largeBlobCheckboxLabel.checkboxElement;
        this.largeBlobCheckbox.checked = false;
        this.largeBlobCheckbox.classList.add('authenticator-option-checkbox');
        this.largeBlobCheckbox.name = 'large-blob-checkbox';
        largeBlobGroup.appendChild(this.#largeBlobCheckboxLabel);
        this.addAuthenticatorButton =
            UI.UIUtils.createTextButton(i18nString(UIStrings.add), this.#handleAddAuthenticatorButton.bind(this), '');
        addButtonGroup.createChild('div', 'authenticator-option-label');
        addButtonGroup.appendChild(this.addAuthenticatorButton);
        const addAuthenticatorTitle = UI.UIUtils.createLabel(i18nString(UIStrings.addAuthenticator), '');
        UI.ARIAUtils.bindLabelToControl(addAuthenticatorTitle, this.addAuthenticatorButton);
        this.#updateNewAuthenticatorSectionOptions();
        if (this.#protocolSelect) {
            this.#protocolSelect.addEventListener('change', this.#updateNewAuthenticatorSectionOptions.bind(this));
        }
        if (this.residentKeyCheckbox) {
            this.residentKeyCheckbox.addEventListener('change', this.#updateNewAuthenticatorSectionOptions.bind(this));
        }
    }
    async #handleAddAuthenticatorButton() {
        const options = this.#createOptionsFromCurrentInputs();
        if (this.#model) {
            const authenticatorId = await this.#model.addAuthenticator(options);
            const availableAuthenticators = this.#availableAuthenticatorSetting.get();
            availableAuthenticators.push({ authenticatorId, active: true, ...options });
            this.#availableAuthenticatorSetting.set(availableAuthenticators.map(a => ({ ...a, active: a.authenticatorId === authenticatorId })));
            const section = await this.#addAuthenticatorSection(authenticatorId, options);
            const mediaQueryList = window.matchMedia('(prefers-reduced-motion: reduce)');
            const prefersReducedMotion = mediaQueryList.matches;
            section.scrollIntoView({ block: 'start', behavior: prefersReducedMotion ? 'auto' : 'smooth' });
        }
    }
    async #addAuthenticatorSection(authenticatorId, options) {
        const section = document.createElement('div');
        section.classList.add('authenticator-section');
        section.setAttribute('data-authenticator-id', authenticatorId);
        this.#authenticatorsView.appendChild(section);
        const headerElement = section.createChild('div', 'authenticator-section-header');
        const titleElement = headerElement.createChild('div', 'authenticator-section-title');
        UI.ARIAUtils.markAsHeading(titleElement, 2);
        await this.#clearActiveAuthenticator();
        const activeButtonContainer = headerElement.createChild('div', 'active-button-container');
        const activeLabel = UI.UIUtils.createRadioLabel(`active-authenticator-${authenticatorId}`, i18nString(UIStrings.active));
        activeLabel.radioElement.addEventListener('click', this.#setActiveAuthenticator.bind(this, authenticatorId));
        activeButtonContainer.appendChild(activeLabel);
        activeLabel.radioElement.checked = true;
        this.#activeAuthId = authenticatorId; // Newly added authenticator is automatically set as active.
        const removeButton = headerElement.createChild('button', 'text-button');
        removeButton.textContent = i18nString(UIStrings.remove);
        removeButton.addEventListener('click', this.#removeAuthenticator.bind(this, authenticatorId));
        const toolbar = new UI.Toolbar.Toolbar('edit-name-toolbar', titleElement);
        const editName = new UI.Toolbar.ToolbarButton(i18nString(UIStrings.editName), 'largeicon-edit');
        const saveName = new UI.Toolbar.ToolbarButton(i18nString(UIStrings.saveName), 'largeicon-checkmark');
        saveName.setVisible(false);
        const nameField = titleElement.createChild('input', 'authenticator-name-field');
        nameField.disabled = true;
        const userFriendlyName = authenticatorId.slice(-5); // User friendly name defaults to last 5 chars of UUID.
        nameField.value = i18nString(UIStrings.authenticatorS, { PH1: userFriendlyName });
        this.#updateActiveLabelTitle(activeLabel, nameField.value);
        editName.addEventListener(UI.Toolbar.ToolbarButton.Events.Click, () => this.#handleEditNameButton(titleElement, nameField, editName, saveName));
        saveName.addEventListener(UI.Toolbar.ToolbarButton.Events.Click, () => this.#handleSaveNameButton(titleElement, nameField, editName, saveName, activeLabel));
        nameField.addEventListener('focusout', () => this.#handleSaveNameButton(titleElement, nameField, editName, saveName, activeLabel));
        nameField.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                this.#handleSaveNameButton(titleElement, nameField, editName, saveName, activeLabel);
            }
        });
        toolbar.appendToolbarItem(editName);
        toolbar.appendToolbarItem(saveName);
        this.#createAuthenticatorFields(section, authenticatorId, options);
        const label = document.createElement('div');
        label.classList.add('credentials-title');
        label.textContent = i18nString(UIStrings.credentials);
        section.appendChild(label);
        const dataGrid = this.#createCredentialsDataGrid(authenticatorId);
        dataGrid.asWidget().show(section);
        void this.#updateCredentials(authenticatorId);
        return section;
    }
    #exportCredential(credential) {
        let pem = PRIVATE_KEY_HEADER;
        for (let i = 0; i < credential.privateKey.length; i += 64) {
            pem += credential.privateKey.substring(i, i + 64) + '\n';
        }
        pem += PRIVATE_KEY_FOOTER;
        const link = document.createElement('a');
        link.download = i18nString(UIStrings.privateKeypem);
        link.href = 'data:application/x-pem-file,' + encodeURIComponent(pem);
        link.click();
    }
    async #removeCredential(authenticatorId, credentialId) {
        const dataGrid = this.#dataGrids.get(authenticatorId);
        if (!dataGrid) {
            return;
        }
        // @ts-ignore dataGrid node type is indeterminate.
        dataGrid.rootNode()
            .children
            .find((n) => n.data.credentialId === credentialId)
            .remove();
        this.#maybeAddEmptyNode(dataGrid);
        if (this.#model) {
            await this.#model.removeCredential(authenticatorId, credentialId);
        }
    }
    /**
     * Creates the fields describing the authenticator in the front end.
     */
    #createAuthenticatorFields(section, authenticatorId, options) {
        const sectionFields = section.createChild('div', 'authenticator-fields');
        const uuidField = sectionFields.createChild('div', 'authenticator-field');
        const protocolField = sectionFields.createChild('div', 'authenticator-field');
        const transportField = sectionFields.createChild('div', 'authenticator-field');
        const srkField = sectionFields.createChild('div', 'authenticator-field');
        const slbField = sectionFields.createChild('div', 'authenticator-field');
        const suvField = sectionFields.createChild('div', 'authenticator-field');
        uuidField.appendChild(UI.UIUtils.createLabel(i18nString(UIStrings.uuid), 'authenticator-option-label'));
        protocolField.appendChild(UI.UIUtils.createLabel(i18nString(UIStrings.protocol), 'authenticator-option-label'));
        transportField.appendChild(UI.UIUtils.createLabel(i18nString(UIStrings.transport), 'authenticator-option-label'));
        srkField.appendChild(UI.UIUtils.createLabel(i18nString(UIStrings.supportsResidentKeys), 'authenticator-option-label'));
        slbField.appendChild(UI.UIUtils.createLabel(i18nString(UIStrings.supportsLargeBlob), 'authenticator-option-label'));
        suvField.appendChild(UI.UIUtils.createLabel(i18nString(UIStrings.supportsUserVerification), 'authenticator-option-label'));
        uuidField.createChild('div', 'authenticator-field-value').textContent = authenticatorId;
        protocolField.createChild('div', 'authenticator-field-value').textContent = options.protocol;
        transportField.createChild('div', 'authenticator-field-value').textContent = options.transport;
        srkField.createChild('div', 'authenticator-field-value').textContent =
            options.hasResidentKey ? i18nString(UIStrings.yes) : i18nString(UIStrings.no);
        slbField.createChild('div', 'authenticator-field-value').textContent =
            options.hasLargeBlob ? i18nString(UIStrings.yes) : i18nString(UIStrings.no);
        suvField.createChild('div', 'authenticator-field-value').textContent =
            options.hasUserVerification ? i18nString(UIStrings.yes) : i18nString(UIStrings.no);
    }
    #handleEditNameButton(titleElement, nameField, editName, saveName) {
        nameField.disabled = false;
        titleElement.classList.add('editing-name');
        nameField.focus();
        saveName.setVisible(true);
        editName.setVisible(false);
    }
    #handleSaveNameButton(titleElement, nameField, editName, saveName, activeLabel) {
        nameField.disabled = true;
        titleElement.classList.remove('editing-name');
        editName.setVisible(true);
        saveName.setVisible(false);
        this.#updateActiveLabelTitle(activeLabel, nameField.value);
    }
    #updateActiveLabelTitle(activeLabel, authenticatorName) {
        UI.Tooltip.Tooltip.install(activeLabel.radioElement, i18nString(UIStrings.setSAsTheActiveAuthenticator, { PH1: authenticatorName }));
    }
    /**
     * Removes both the authenticator and its respective UI element.
     */
    #removeAuthenticator(authenticatorId) {
        if (this.#authenticatorsView) {
            const child = this.#authenticatorsView.querySelector(`[data-authenticator-id=${CSS.escape(authenticatorId)}]`);
            if (child) {
                child.remove();
            }
        }
        const dataGrid = this.#dataGrids.get(authenticatorId);
        if (dataGrid) {
            dataGrid.asWidget().detach();
            this.#dataGrids.delete(authenticatorId);
        }
        if (this.#model) {
            void this.#model.removeAuthenticator(authenticatorId);
        }
        // Update available authenticator setting.
        const prevAvailableAuthenticators = this.#availableAuthenticatorSetting.get();
        const newAvailableAuthenticators = prevAvailableAuthenticators.filter(a => a.authenticatorId !== authenticatorId);
        this.#availableAuthenticatorSetting.set(newAvailableAuthenticators);
        if (this.#activeAuthId === authenticatorId) {
            const availableAuthenticatorIds = Array.from(this.#dataGrids.keys());
            if (availableAuthenticatorIds.length) {
                void this.#setActiveAuthenticator(availableAuthenticatorIds[0]);
            }
            else {
                this.#activeAuthId = null;
            }
        }
    }
    #createOptionsFromCurrentInputs() {
        // TODO(crbug.com/1034663): Add optionality for isUserVerified param.
        if (!this.#protocolSelect || !this.#transportSelect || !this.residentKeyCheckbox ||
            !this.#userVerificationCheckbox || !this.largeBlobCheckbox) {
            throw new Error('Unable to create options from current inputs');
        }
        return {
            protocol: this.#protocolSelect.options[this.#protocolSelect.selectedIndex].value,
            ctap2Version: "ctap2_1" /* Ctap2_1 */,
            transport: this.#transportSelect.options[this.#transportSelect.selectedIndex].value,
            hasResidentKey: this.residentKeyCheckbox.checked,
            hasUserVerification: this.#userVerificationCheckbox.checked,
            hasLargeBlob: this.largeBlobCheckbox.checked,
            automaticPresenceSimulation: true,
            isUserVerified: true,
        };
    }
    /**
     * Sets the given authenticator as active.
     * Note that a newly added authenticator will automatically be set as active.
     */
    async #setActiveAuthenticator(authenticatorId) {
        await this.#clearActiveAuthenticator();
        if (this.#model) {
            await this.#model.setAutomaticPresenceSimulation(authenticatorId, true);
        }
        this.#activeAuthId = authenticatorId;
        const prevAvailableAuthenticators = this.#availableAuthenticatorSetting.get();
        const newAvailableAuthenticators = prevAvailableAuthenticators.map(a => ({ ...a, active: a.authenticatorId === authenticatorId }));
        this.#availableAuthenticatorSetting.set(newAvailableAuthenticators);
        this.#updateActiveButtons();
    }
    #updateActiveButtons() {
        const authenticators = this.#authenticatorsView.getElementsByClassName('authenticator-section');
        Array.from(authenticators).forEach((authenticator) => {
            const button = authenticator.querySelector('input.dt-radio-button');
            if (!button) {
                return;
            }
            button.checked = authenticator.dataset.authenticatorId === this.#activeAuthId;
        });
    }
    async #clearActiveAuthenticator() {
        if (this.#activeAuthId && this.#model) {
            await this.#model.setAutomaticPresenceSimulation(this.#activeAuthId, false);
        }
        this.#activeAuthId = null;
        this.#updateActiveButtons();
    }
    wasShown() {
        super.wasShown();
        this.registerCSSFiles([webauthnPaneStyles]);
    }
}
//# sourceMappingURL=WebauthnPane.js.map