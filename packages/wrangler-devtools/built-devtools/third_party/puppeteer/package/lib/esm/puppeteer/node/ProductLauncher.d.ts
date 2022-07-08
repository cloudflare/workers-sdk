import { Browser } from '../common/Browser.js';
import { BrowserLaunchArgumentOptions, ChromeReleaseChannel, PuppeteerNodeLaunchOptions } from './LaunchOptions.js';
import { Product } from '../common/Product.js';
import { ChromeLauncher } from './ChromeLauncher.js';
import { FirefoxLauncher } from './FirefoxLauncher.js';
/**
 * Describes a launcher - a class that is able to create and launch a browser instance.
 * @public
 */
export interface ProductLauncher {
    launch(object: PuppeteerNodeLaunchOptions): Promise<Browser>;
    executablePath: (path?: any) => string;
    defaultArgs(object: BrowserLaunchArgumentOptions): string[];
    product: Product;
}
/**
 * @internal
 */
export declare function executablePathForChannel(channel: ChromeReleaseChannel): string;
/**
 * @internal
 */
export declare function resolveExecutablePath(launcher: ChromeLauncher | FirefoxLauncher): {
    executablePath: string;
    missingText?: string;
};
/**
 * @internal
 */
export declare function createLauncher(projectRoot: string | undefined, preferredRevision: string, isPuppeteerCore: boolean, product?: Product): ProductLauncher;
//# sourceMappingURL=ProductLauncher.d.ts.map