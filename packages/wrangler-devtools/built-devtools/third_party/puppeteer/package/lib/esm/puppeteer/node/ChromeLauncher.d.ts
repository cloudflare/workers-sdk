import { Browser } from '../common/Browser.js';
import { Product } from '../common/Product.js';
import { BrowserLaunchArgumentOptions, ChromeReleaseChannel, PuppeteerNodeLaunchOptions } from './LaunchOptions.js';
import { ProductLauncher } from './ProductLauncher.js';
/**
 * @internal
 */
export declare class ChromeLauncher implements ProductLauncher {
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
    defaultArgs(options?: BrowserLaunchArgumentOptions): string[];
    executablePath(channel?: ChromeReleaseChannel): string;
    get product(): Product;
}
//# sourceMappingURL=ChromeLauncher.d.ts.map