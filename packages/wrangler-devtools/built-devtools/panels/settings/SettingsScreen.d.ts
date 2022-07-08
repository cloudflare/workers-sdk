import * as Common from '../../core/common/common.js';
import * as UI from '../../ui/legacy/legacy.js';
export declare class SettingsScreen extends UI.Widget.VBox implements UI.View.ViewLocationResolver {
    private readonly tabbedLocation;
    private keybindsTab?;
    private reportTabOnReveal;
    private constructor();
    static instance(opts?: {
        forceNew: boolean | null;
    }): SettingsScreen;
    private static revealSettingsScreen;
    static showSettingsScreen(options?: ShowSettingsScreenOptions | undefined): Promise<void>;
    resolveLocation(_locationName: string): UI.View.ViewLocation | null;
    private selectTab;
    private tabInvoked;
    private reportSettingsPanelShown;
    private onEscapeKeyPressed;
    wasShown(): void;
}
declare class SettingsTab extends UI.Widget.VBox {
    containerElement: HTMLElement;
    constructor(name: string, id?: string);
    protected appendSection(name?: string): HTMLElement;
}
export declare class GenericSettingsTab extends SettingsTab {
    private readonly syncSection;
    constructor();
    static instance(opts?: {
        forceNew: null;
    }): GenericSettingsTab;
    static isSettingVisible(setting: Common.Settings.SettingRegistration): boolean;
    wasShown(): void;
    private updateSyncSection;
    private createExtensionSection;
    private createSectionElement;
    private createStandardSectionElement;
}
export declare class ExperimentsSettingsTab extends SettingsTab {
    private experimentsSection;
    private unstableExperimentsSection;
    constructor();
    private renderExperiments;
    static instance(opts?: {
        forceNew: null;
    }): ExperimentsSettingsTab;
    private createExperimentsWarningSubsection;
    private createExperimentCheckbox;
}
export declare class ActionDelegate implements UI.ActionRegistration.ActionDelegate {
    static instance(opts?: {
        forceNew: boolean | null;
    }): ActionDelegate;
    handleAction(context: UI.Context.Context, actionId: string): boolean;
}
export declare class Revealer implements Common.Revealer.Revealer {
    static instance(opts?: {
        forceNew: boolean;
    }): Revealer;
    reveal(object: Object): Promise<void>;
}
export interface ShowSettingsScreenOptions {
    name?: string;
    focusTabHeader?: boolean;
}
export {};
