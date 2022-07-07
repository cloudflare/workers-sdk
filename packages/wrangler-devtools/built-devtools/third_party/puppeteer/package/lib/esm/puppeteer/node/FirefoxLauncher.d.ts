import { Browser } from '../common/Browser.js';
import { Product } from '../common/Product.js';
import { BrowserLaunchArgumentOptions, PuppeteerNodeLaunchOptions } from './LaunchOptions.js';
import { ProductLauncher } from './ProductLauncher.js';
/**
 * @internal
 */
export declare class FirefoxLauncher implements ProductLauncher {
    /**
     * @internal
     */
    _projectRoot: string | undefined;
    /**
     * @internal
     */
    _preferredRevision: string;
    /**
     * @internal
     */
    _isPuppeteerCore: boolean;
    constructor(projectRoot: string | undefined, preferredRevision: string, isPuppeteerCore: boolean);
    launch(options?: PuppeteerNodeLaunchOptions): Promise<Browser>;
    executablePath(): string;
    _updateRevision(): Promise<void>;
    get product(): Product;
    defaultArgs(options?: BrowserLaunchArgumentOptions): string[];
    defaultPreferences(extraPrefs: {
        [x: string]: unknown;
    }): {
        [x: string]: unknown;
    };
    /**
     * Populates the user.js file with custom preferences as needed to allow
     * Firefox's CDP support to properly function. These preferences will be
     * automatically copied over to prefs.js during startup of Firefox. To be
     * able to restore the original values of preferences a backup of prefs.js
     * will be created.
     *
     * @param prefs - List of preferences to add.
     * @param profilePath - Firefox profile to write the preferences to.
     */
    writePreferences(prefs: {
        [x: string]: unknown;
    }, profilePath: string): Promise<void>;
    _createProfile(extraPrefs: {
        [x: string]: unknown;
    }): Promise<string>;
}
//# sourceMappingURL=FirefoxLauncher.d.ts.map