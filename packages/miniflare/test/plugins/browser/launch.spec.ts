import assert from "node:assert";
import childProcess from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { removeDir } from "@cloudflare/workers-utils/fs-helpers";
import { getGlobalWranglerCachePath } from "@cloudflare/workers-utils/global-wrangler-config-path";
import { Browser, computeExecutablePath } from "@puppeteer/browsers";
import { launchBrowser, Log } from "miniflare";
import { afterEach, beforeEach, test, vi } from "vitest";
import { BROWSER_VERSION } from "../../../src/plugins/browser-rendering/browser-version";

let tmpPath: string;
let configuration: Record<string, string>;

beforeEach(async () => {
	tmpPath = await fs.mkdtemp(
		path.join(os.tmpdir(), "miniflare-browser-launch-")
	);
	configuration = {
		XDG_CONFIG_HOME: path.join(tmpPath, "config"),
		XDG_CACHE_HOME: path.join(tmpPath, "cache"),
		XDG_DATA_HOME: path.join(tmpPath, "data"),
		XDG_RUNTIME_DIR: path.join(tmpPath, "run"),
		CHROME_CONFIG_HOME: path.join(tmpPath, "chrome-config"),
		CHROME_DEVEL_SANDBOX: path.join(tmpPath, "chrome-sandbox"),
		SSL_CERT_FILE: path.join(tmpPath, "cert.pem"),
		SSL_CERT_DIR: path.join(tmpPath, "certs"),
		HTTP_PROXY: "http://127.0.0.1:9000",
		HTTPS_PROXY: "http://127.0.0.1:9000",
		ALL_PROXY: "http://127.0.0.1:9000",
		NO_PROXY: "localhost,127.0.0.1",
		http_proxy: "http://127.0.0.1:9000",
		https_proxy: "http://127.0.0.1:9000",
		all_proxy: "http://127.0.0.1:9000",
		no_proxy: "localhost,127.0.0.1",
		DISPLAY: ":99",
		WAYLAND_DISPLAY: "wayland-test",
		XAUTHORITY: path.join(tmpPath, "xauthority"),
		FONTCONFIG_PATH: path.join(tmpPath, "fonts"),
		LANG: "en_GB.UTF-8",
		LC_ALL: "C",
		TZ: "Europe/London",
	};
	for (const [name, value] of Object.entries(configuration)) {
		vi.stubEnv(name, value);
	}
	// All credentials reported by the inert fixture are synthetic, even if the
	// host has real credentials with these names. Prefix decoys catch overly
	// broad forwarding rules as well as wholesale environment inheritance.
	for (const name of [
		"CLOUDFLARE_API_TOKEN",
		"AWS_SECRET_ACCESS_KEY",
		"GITHUB_TOKEN",
		"MINIFLARE_BROWSER_TEST",
		"XDG_TEST_TOKEN",
		"CHROME_TEST_TOKEN",
		"HTTP_PROXY_TOKEN",
		"NODE_OPTIONS",
	]) {
		vi.stubEnv(
			name,
			name === "NODE_OPTIONS" ? "--no-warnings" : "synthetic-secret"
		);
	}

	// Supply an inert cached executable so this test exercises the published
	// launcher and Puppeteer's real spawn path without downloading Chrome.
	const executablePath = computeExecutablePath({
		cacheDir: getGlobalWranglerCachePath(),
		browser: Browser.CHROME,
		buildId: BROWSER_VERSION,
	});
	await fs.mkdir(path.dirname(executablePath), { recursive: true });
	await fs.writeFile(executablePath, "");
	const spawn = childProcess.spawn;
	vi.spyOn(childProcess, "spawn").mockImplementation(
		(command, args, options) => {
			assert.strictEqual(command, executablePath);
			return spawn(
				process.execPath,
				[path.resolve("test/fixtures/browser-launcher/index.cjs"), ...args],
				options
			);
		}
	);
});

afterEach(async () => {
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
	await removeDir(tmpPath);
});

test.for([
	{ home: "custom", ci: undefined, accountMissing: false },
	{ home: undefined, ci: undefined, accountMissing: false },
	{ home: "", ci: "true", accountMissing: false },
	{ home: "custom", ci: undefined, accountMissing: true },
	{ home: undefined, ci: undefined, accountMissing: true },
	{ home: "", ci: "true", accountMissing: true },
])(
	"passes only browser configuration with HOME=$home, CI=$ci and accountMissing=$accountMissing",
	async ({ home, ci, accountMissing }, { expect }) => {
		const privateHome = await fs.mkdtemp(path.join(tmpPath, "home-"));
		vi.stubEnv("HOME", home === "custom" ? privateHome : home);
		vi.stubEnv("CI", ci);
		const expectedHome =
			home === "custom" ? privateHome : os.userInfo().homedir;
		const userInfo = vi.spyOn(os, "userInfo");
		if (accountMissing) {
			userInfo.mockImplementation(() => {
				throw new Error("No account database entry for this UID");
			});
		}
		const { browserProcess, wsEndpoint } = await launchBrowser({
			browserVersion: BROWSER_VERSION,
			log: new Log(),
			tmpPath,
		});
		let profile: string | undefined;
		try {
			const response = await fetch(wsEndpoint.replace("ws:", "http:"));
			const environment = (await response.json()) as {
				home?: string;
				configuration: Record<string, string>;
				credentials: Record<string, string>;
				args: string[];
			};
			expect(environment.configuration).toEqual(configuration);
			expect(environment.credentials).toEqual({});
			expect(environment.args.includes("--no-sandbox")).toBe(Boolean(ci));
			expect(environment.args).toContain("--headless=new");
			profile = environment.args
				.find((arg) => arg.startsWith("--user-data-dir="))
				?.slice("--user-data-dir=".length);
			expect(profile).toBeDefined();
			if (profile === undefined) {
				throw new Error("Missing browser profile directory");
			}
			expect(environment.home).toBe(
				accountMissing && home !== "custom" ? profile : expectedHome
			);
			if (home === "custom") {
				expect(userInfo).not.toHaveBeenCalled();
			}
			if (process.platform !== "win32") {
				for (const directory of [path.dirname(profile), profile]) {
					const stat = await fs.stat(directory);
					expect(stat.mode & 0o777).toBe(0o700);
					expect(stat.uid).toBe(process.getuid?.());
				}
			}
		} finally {
			browserProcess.kill();
			await browserProcess.hasClosed();
		}
		// Puppeteer invokes onExit without awaiting it.
		await vi.waitFor(async () => {
			await expect(fs.stat(profile ?? "")).rejects.toMatchObject({
				code: "ENOENT",
			});
		});
	}
);
