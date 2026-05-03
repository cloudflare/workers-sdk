import fs from "node:fs";
import path from "node:path";
import { brandColor } from "@cloudflare/cli-shared-helpers/colors";
import { spinner } from "@cloudflare/cli-shared-helpers/interactive";
import { removeDir } from "@cloudflare/workers-utils";
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
import { getGlobalWranglerCachePath } from "../../shared/wrangler";
import {
	getUserBindingServiceName,
	ProxyNodeBinding,
	remoteProxyClientWorker,
	WORKER_BINDING_SERVICE_LOOPBACK,
} from "../shared";
import type { Log } from "../../shared";
import type { Plugin, RemoteProxyConnectionString } from "../shared";

const BrowserRenderingSchema = z.object({
	binding: z.string(),
	remoteProxyConnectionString: z
		.custom<RemoteProxyConnectionString>()
		.optional(),
	headful: z.boolean().optional(),
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
						"service",
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
					"service",
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
									uniqueKey: "miniflare-BrowserSession",
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
	headful,
	log,
	tmpPath,
}: {
	browserVersion: string;
	headful?: boolean;
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
		...(headful ? [] : ["--headless=new", "--hide-scrollbars", "--mute-audio"]),
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
			try {
				await removeDir(tempUserData);
			} catch (e) {
				log.debug(`Unable to remove Chrome user data directory: ${e}`);
			}
		},
	});
	const wsEndpoint = await browserProcess.waitForLineOutput(
		CDP_WEBSOCKET_ENDPOINT_REGEX
	);
	// On Windows in particular, Chrome may print the DevTools URL slightly
	// before its listening socket is fully ready to accept connections.
	// Probe the HTTP /json/version endpoint (served on the same port as the
	// WS endpoint) with retry/backoff before declaring the browser ready, so
	// that subsequent fetches from workerd don't race the OS and surface as
	// `ConnectEx (#1225) connection refused` errors.
	await waitForBrowserReady(wsEndpoint, log);
	const startTime = Date.now();
	return { sessionId, browserProcess, startTime, wsEndpoint };
}

/**
 * Probe Chrome's HTTP DevTools endpoint until it accepts connections.
 *
 * `waitForLineOutput` resolves as soon as Chrome logs the
 * `DevTools listening on ws://...` banner, but on Windows the underlying
 * listening socket is occasionally not yet accepting connections at that
 * point. Without this probe, the first request from workerd to Chrome can
 * fail with `ConnectEx (#1225) The remote computer refused the network
 * connection.` even though Chrome is otherwise healthy.
 */
async function waitForBrowserReady(
	wsEndpoint: string,
	log: Log
): Promise<void> {
	const timeoutMs = 5000;
	const initialDelayMs = 25;
	const maxDelayMs = 250;
	const perRequestTimeoutMs = 500;
	const probeUrl = `${new URL(wsEndpoint.replace("ws://", "http://")).origin}/json/version`;
	const deadline = Date.now() + timeoutMs;
	let attempt = 0;
	let lastError: unknown;
	while (Date.now() < deadline) {
		try {
			const response = await fetch(probeUrl, {
				signal: AbortSignal.timeout(perRequestTimeoutMs),
			});
			// Drain the body so the connection can be reused/closed cleanly.
			await response.arrayBuffer();
			if (response.ok) {
				if (attempt > 0) {
					log.debug(`Chrome ready after ${attempt + 1} attempt(s)`);
				}
				return;
			}
			lastError = new Error(
				`Chrome readiness probe got status ${response.status}`
			);
		} catch (e) {
			lastError = e;
		}
		const delay = Math.min(maxDelayMs, initialDelayMs * 2 ** attempt);
		await new Promise((resolve) => setTimeout(resolve, delay));
		attempt++;
	}
	throw new Error(
		`Chrome readiness probe at ${probeUrl} timed out after ${timeoutMs}ms`,
		{ cause: lastError }
	);
}
