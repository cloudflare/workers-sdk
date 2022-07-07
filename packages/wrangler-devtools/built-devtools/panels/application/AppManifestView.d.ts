import type * as Platform from '../../core/platform/platform.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as UI from '../../ui/legacy/legacy.js';
import type * as Protocol from '../../generated/protocol.js';
declare type ParsedSize = {
    any: 'any';
    formatted: string;
} | {
    width: number;
    height: number;
    formatted: string;
};
export declare class AppManifestView extends UI.Widget.VBox implements SDK.TargetManager.Observer {
    private readonly emptyView;
    private readonly reportView;
    private readonly errorsSection;
    private readonly installabilitySection;
    private readonly identitySection;
    private readonly presentationSection;
    private readonly iconsSection;
    private readonly shortcutSections;
    private readonly screenshotsSections;
    private nameField;
    private shortNameField;
    private descriptionField;
    private readonly startURLField;
    private readonly themeColorSwatch;
    private readonly backgroundColorSwatch;
    private readonly darkThemeColorField;
    private readonly darkThemeColorSwatch;
    private readonly darkBackgroundColorField;
    private readonly darkBackgroundColorSwatch;
    private orientationField;
    private displayField;
    private readonly newNoteUrlField;
    private readonly throttler;
    private registeredListeners;
    private target?;
    private resourceTreeModel?;
    private serviceWorkerManager?;
    private protocolHandlersView;
    constructor();
    targetAdded(target: SDK.Target.Target): void;
    targetRemoved(target: SDK.Target.Target): void;
    private updateManifest;
    private renderManifest;
    getInstallabilityErrorMessages(installabilityErrors: Protocol.Page.InstallabilityError[]): string[];
    private loadImage;
    parseSizes(sizes: string, resourceName: Platform.UIString.LocalizedString, imageUrl: string, imageResourceErrors: Platform.UIString.LocalizedString[]): ParsedSize[];
    checkSizeProblem(size: ParsedSize, type: string | undefined, image: HTMLImageElement, resourceName: Platform.UIString.LocalizedString, imageUrl: string): {
        error?: Platform.UIString.LocalizedString;
        hasSquareSize: boolean;
    };
    private appendImageResourceToSection;
    wasShown(): void;
}
export {};
