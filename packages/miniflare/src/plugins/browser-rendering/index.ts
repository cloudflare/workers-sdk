import fs from "node:fs";
import path from "node:path";
import { brandColor, dim, red } from "@cloudflare/cli-shared-helpers/colors";
import { spinner } from "@cloudflare/cli-shared-helpers/interactive";
import { removeDir } from "@cloudflare/workers-utils";
import { CDP_WEBSOCKET_ENDPOINT_REGEX, launch } from "@puppeteer/browsers";
import BROWSER_RENDERING_WORKER from "worker:browser-rendering/binding";
import { kVoid } from "../../runtime";
import {
	buildRemoteProxyProps,
	getEnvBindingsOfType,
	getRemoteProxyConnectionString,
	getUserBindingServiceName,
	ProxyNodeBinding,
	remoteProxyClientWorker,
	WORKER_BINDING_SERVICE_LOOPBACK,
} from "../shared";
import { ensureBrowserInstalled } from "./install";
import { BrowserStartupError, waitForExit } from "./process";
import type { Service } from "../../runtime";
import type { Log } from "../../shared";
import type { Plugin } from "../shared";

export const BROWSER_RENDERING_PLUGIN_NAME = "browser-rendering";
const BROWSER_RENDERING_REMOTE_SERVICE_NAME = `${BROWSER_RENDERING_PLUGIN_NAME}:remote`;

export const BROWSER_RENDERING_PLUGIN: Plugin = {
	bindingTypeDescription: "Browser Rendering",
	async getBindings(options) {
		return getEnvBindingsOfType(options.config, "browser").map(
			([name, binding]) => {
				const remoteProxyConnectionString = getRemoteProxyConnectionString(
					binding,
					options.dev
				);
				return {
					name,
					service: remoteProxyConnectionString
						? {
								name: BROWSER_RENDERING_REMOTE_SERVICE_NAME,
								props: buildRemoteProxyProps(remoteProxyConnectionString, name),
							}
						: {
								name: getUserBindingServiceName(
									BROWSER_RENDERING_PLUGIN_NAME,
									"service"
								),
							},
				};
			}
		);
	},
	getNodeBindings(options) {
		return Object.fromEntries(
			getEnvBindingsOfType(options.config, "browser").map(([name]) => [
				name,
				new ProxyNodeBinding(),
			])
		);
	},
	async getServices({ options }) {
		const services: Service[] = [];

		for (const [, binding] of getEnvBindingsOfType(options.config, "browser")) {
			const remoteProxyConnectionString = getRemoteProxyConnectionString(
				binding,
				options.dev
			);

			if (remoteProxyConnectionString) {
				services.push({
					name: BROWSER_RENDERING_REMOTE_SERVICE_NAME,
					worker: remoteProxyClientWorker(),
				});
				continue;
			}

			services.push({
				name: getUserBindingServiceName(
					BROWSER_RENDERING_PLUGIN_NAME,
					"service"
				),
				worker: {
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
			});
		}

		return services;
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
	const sessionId = crypto.randomUUID();

	const s = spinner();
	let startedDownloading = false;

	const install = async () => {
		try {
			return await ensureBrowserInstalled({
				browserVersion,
				log,
				onProgress: (downloadedBytes, totalBytes) => {
					if (!startedDownloading) {
						s.start(`Downloading browser...`);
						startedDownloading = true;
					}
					const progress = Math.round((downloadedBytes / totalBytes) * 100);
					s.update(`Downloading browser... ${progress}%`);
				},
			});
		} catch (e) {
			if (startedDownloading) {
				s.stop(`${red("failed")} ${dim(`browser download`)}`);
				startedDownloading = false;
			}
			throw e;
		} finally {
			if (startedDownloading) {
				s.stop(`${brandColor("downloaded")} ${dim(`browser`)}`);
				startedDownloading = false;
			}
		}
	};

	let installed = await install();
	log.debug(
		`Chrome ${browserVersion} available at ${installed.executablePath}`
	);

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
	];

	// Each attempt gets its own profile directory. `@puppeteer/browsers` fires
	// `onExit` without awaiting it, and `waitForExit` only waits for the process
	// to go, not for that cleanup — so a retry sharing the path could have its
	// freshly written profile deleted by the previous attempt's `removeDir`.
	let attempt = 0;

	const launchOnce = async () => {
		const tempUserData = path.join(
			tmpPath,
			"browser-rendering",
			`profile-${sessionId}-${attempt++}`
		);
		await fs.promises.mkdir(tempUserData, { recursive: true });

		// Whether Chrome got far enough to announce its DevTools endpoint, which
		// is the line between "this install might be broken" and "something else
		// went wrong". See `BrowserStartupError`.
		let started = false;

		const launchArgs = [...args, `--user-data-dir=${tempUserData}`];
		const browserProcess = launch({
			executablePath: installed.executablePath,
			args: process.env.CI ? [...launchArgs, "--no-sandbox"] : launchArgs,
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
		try {
			const wsEndpoint = await browserProcess.waitForLineOutput(
				CDP_WEBSOCKET_ENDPOINT_REGEX,
				// Note: we pass an explicit timeout so the promise rejects instead of hanging forever
				//       when Chrome fails to start or crashes before printing the DevTools URL.
				//       Five minutes is generous enough to cover on-demand browser downloads on slow
				//       connections while still failing within a reasonable window.
				5 * 60 * 1_000
			);
			// Chrome announced itself, so it is running and its resources loaded.
			started = true;
			// On Windows in particular, Chrome may print the DevTools URL slightly
			// before its listening socket is fully ready to accept connections.
			// Probe the HTTP /json/version endpoint (served on the same port as the
			// WS endpoint) with retry/backoff before declaring the browser ready, so
			// that subsequent fetches from workerd don't race the OS and surface as
			// `ConnectEx (#1225) connection refused` errors.
			await waitForBrowserReady(wsEndpoint, log);
			return { browserProcess, wsEndpoint };
		} catch (e) {
			// Leave nothing behind for the retry (or the caller) to trip over.
			try {
				browserProcess.kill();
			} catch {
				// Already gone — which is the common case here, since Chrome
				// exiting early is what makes `waitForLineOutput` reject.
			}
			// Wait for it to actually go. On Windows a dying Chrome keeps
			// handles open on files inside the install directory, which makes
			// clearing a bad install fail.
			await waitForExit(browserProcess);
			throw started ? e : new BrowserStartupError(e);
		}
	};

	let launched: Awaited<ReturnType<typeof launchOnce>>;
	try {
		launched = await launchOnce();
	} catch (e) {
		// A Chrome that never starts may be a Chrome that was never fully
		// downloaded: `@puppeteer/browsers` considers an install present once
		// the directory and executable exist, but the Chrome-for-Testing
		// archives extract alphabetically, so an interrupted install leaves
		// `chrome.exe` in place while `resources.pak` and friends are still
		// missing. Clear such an install and try once more, rather than
		// failing every launch until the cache is manually deleted.
		//
		// Anything that fails once Chrome is up is out of scope: it has already
		// loaded the resources a partial download would lack, so deleting it
		// would cost a needless re-download without fixing anything.
		if (!(e instanceof BrowserStartupError)) {
			throw e;
		}
		const discarded = await installed.discard();
		if (discarded.outcome === "cleanup-failed") {
			// Miniflare logs to a no-op by default and the loopback sends only
			// an error's `stack`, so both halves of the story have to be in the
			// message: what stopped Chrome starting, and what stopped us
			// clearing the install it failed from.
			throw new Error(
				`Chrome failed to launch from ${installed.installDir}, and the directory could not be removed to re-download it (${discarded.cause}). Delete it manually and try again. Chrome failed with: ${e.message}`,
				{ cause: discarded.cause }
			);
		}
		if (discarded.outcome === "verified") {
			throw e;
		}
		// Either we cleared the install or a concurrent launch replaced it;
		// either way there is a fresh one to try.
		log.debug(`Retrying Chrome launch after re-installing: ${e}`);
		installed = await install();
		launched = await launchOnce();
	}

	// Chrome started, so this install is known-good. Recording that is what
	// lets a *future* launch failure be attributed to a bad download.
	await installed.markVerified();

	const startTime = Date.now();
	return {
		sessionId,
		browserProcess: launched.browserProcess,
		startTime,
		wsEndpoint: launched.wsEndpoint,
	};
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
