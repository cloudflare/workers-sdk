import fs from "fs";
import path from "path";
import { brandColor } from "@cloudflare/cli/colors";
import { spinner } from "@cloudflare/cli/interactive";
import {
	Browser,
	CDP_WEBSOCKET_ENDPOINT_REGEX,
	detectBrowserPlatform,
	install,
	launch,
	resolveBuildId,
} from "@puppeteer/browsers";
import { dim } from "kleur/colors";
import BROWSER_RENDERING_WORKER from "worker:browser-rendering/binding";
import { z } from "zod";
import { kVoid } from "../../runtime";
import { Log } from "../../shared";
import { getGlobalWranglerCachePath } from "../../shared/wrangler";
import {
	getUserBindingServiceName,
	Plugin,
	ProxyNodeBinding,
	remoteProxyClientWorker,
	RemoteProxyConnectionString,
	WORKER_BINDING_SERVICE_LOOPBACK,
} from "../shared";

const BrowserRenderingSchema = z.object({
	binding: z.string(),
	remoteProxyConnectionString: z
		.custom<RemoteProxyConnectionString>()
		.optional(),
});

export const BrowserRenderingOptionsSchema = z.object({
	browserRendering: BrowserRenderingSchema.optional(),
});

export const BROWSER_RENDERING_PLUGIN_NAME = "browser-rendering";

export const BROWSER_RENDERING_PLUGIN: Plugin<
	typeof BrowserRenderingOptionsSchema
> = {
	options: BrowserRenderingOptionsSchema,
	async getBindings(options) {
		if (!options.browserRendering) {
			return [];
		}

		return [
			{
				name: options.browserRendering.binding,
				service: {
					name: getUserBindingServiceName(
						BROWSER_RENDERING_PLUGIN_NAME,
						options.browserRendering.binding,
						options.browserRendering.remoteProxyConnectionString
					),
				},
			},
		];
	},
	getNodeBindings(options: z.infer<typeof BrowserRenderingOptionsSchema>) {
		if (!options.browserRendering) {
			return {};
		}
		return {
			[options.browserRendering.binding]: new ProxyNodeBinding(),
		};
	},
	async getServices({ options }) {
		if (!options.browserRendering) {
			return [];
		}

		return [
			{
				name: getUserBindingServiceName(
					BROWSER_RENDERING_PLUGIN_NAME,
					options.browserRendering.binding,
					options.browserRendering.remoteProxyConnectionString
				),
				worker: options.browserRendering.remoteProxyConnectionString
					? remoteProxyClientWorker(
							options.browserRendering.remoteProxyConnectionString,
							options.browserRendering.binding
						)
					: {
							compatibilityDate: "2025-05-01",
							compatibilityFlags: ["nodejs_compat"],
							modules: [
								{
									name: "index.worker.js",
									esModule: BROWSER_RENDERING_WORKER(),
								},
							],
							bindings: [
								WORKER_BINDING_SERVICE_LOOPBACK,
								{
									name: "BrowserSession",
									durableObjectNamespace: {
										className: "BrowserSession",
									},
								},
							],
							durableObjectNamespaces: [
								{
									className: "BrowserSession",
								},
							],
							durableObjectStorage: { inMemory: kVoid },
						},
			},
		];
	},
};

export async function launchBrowser({
	browserVersion,
	log,
	tmpPath,
}: {
	browserVersion: string;
	log: Log;
	tmpPath: string;
}) {
	const platform = detectBrowserPlatform();
	if (!platform) {
		throw new Error("The current platform is not supported.");
	}
	const browser = Browser.CHROME;
	const sessionId = crypto.randomUUID();

	const s = spinner();
	let startedDownloading = false;

	const { executablePath } = await install({
		browser,
		platform,
		cacheDir: getGlobalWranglerCachePath(),
		buildId: await resolveBuildId(browser, platform, browserVersion),
		downloadProgressCallback: (downloadedBytes, totalBytes) => {
			if (!startedDownloading) {
				s.start(`Downloading browser...`);
				startedDownloading = true;
			}
			const progress = Math.round((downloadedBytes / totalBytes) * 100);
			s.update(`Downloading browser... ${progress}%`);
		},
	});

	if (startedDownloading) {
		s.stop(`${brandColor("downloaded")} ${dim(`browser`)}`);
		log.debug(`${browser} ${browserVersion} available at ${executablePath}`);
	}

	const tempUserData = path.join(
		tmpPath,
		"browser-rendering",
		`profile-${sessionId}`
	);
	await fs.promises.mkdir(tempUserData, { recursive: true });

	// https://github.com/puppeteer/puppeteer/blob/44516936ad4a878f9a89e835a9fa7b04360d6fb9/packages/puppeteer-core/src/node/ChromeLauncher.ts#L156
	const disabledFeatures = [
		"Translate",
		// AcceptCHFrame disabled because of crbug.com/1348106.
		"AcceptCHFrame",
		"MediaRouter",
		"OptimizationHints",
		"ProcessPerSiteUpToMainFrameThreshold",
		"IsolateSandboxedIframes",
	];
	const args = [
		"--allow-pre-commit-input",
		"--disable-background-networking",
		"--disable-background-timer-throttling",
		"--disable-backgrounding-occluded-windows",
		"--disable-breakpad",
		"--disable-client-side-phishing-detection",
		"--disable-component-extensions-with-background-pages",
		"--disable-crash-reporter", // No crash reporting in CfT.
		"--disable-default-apps",
		"--disable-dev-shm-usage",
		"--disable-hang-monitor",
		"--disable-infobars",
		"--disable-ipc-flooding-protection",
		"--disable-popup-blocking",
		"--disable-prompt-on-repost",
		"--disable-renderer-backgrounding",
		"--disable-search-engine-choice-screen",
		"--disable-sync",
		"--enable-automation",
		"--export-tagged-pdf",
		"--force-color-profile=srgb",
		"--generate-pdf-document-outline",
		"--metrics-recording-only",
		"--no-first-run",
		"--password-store=basic",
		"--use-mock-keychain",
		`--disable-features=${disabledFeatures.join(",")}`,
		"--headless=new",
		"--hide-scrollbars",
		"--mute-audio",
		"--disable-extensions",
		"about:blank",
		"--remote-debugging-port=0",
		`--user-data-dir=${tempUserData}`,
	];

	const browserProcess = launch({
		executablePath,
		args: process.env.CI ? [...args, "--no-sandbox"] : args,
		handleSIGTERM: false,
		dumpio: false,
		pipe: false,
		onExit: async () => {
			await fs.promises
				.rm(tempUserData, { recursive: true, force: true })
				.catch((e) => {
					log.debug(
						`Unable to remove Chrome user data directory: ${String(e)}`
					);
				});
		},
	});
	const wsEndpoint = await browserProcess.waitForLineOutput(
		CDP_WEBSOCKET_ENDPOINT_REGEX
	);
	const startTime = Date.now();
	return { sessionId, browserProcess, startTime, wsEndpoint };
}
