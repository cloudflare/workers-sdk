import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { removeDirSync } from "@cloudflare/workers-utils";
import { afterEach, beforeEach, describe, test, vi } from "vitest";
import {
	ensureBrowserInstalled,
	isInstallMarkedComplete,
} from "../../../src/plugins/browser-rendering/install";

const BUILD_ID = "126.0.6478.182";
const PLATFORM = "linux64";

let cacheDir: string;

vi.mock("@cloudflare/workers-utils", async (importOriginal) => ({
	...(await importOriginal<typeof import("@cloudflare/workers-utils")>()),
	// Keep the real `removeDir`; only the cache location is faked.
	getGlobalWranglerCachePath: () => cacheDir,
}));

const install = vi.hoisted(() => vi.fn());

vi.mock("@puppeteer/browsers", () => ({
	Browser: { CHROME: "chrome" },
	detectBrowserPlatform: () => PLATFORM,
	resolveBuildId: (_browser: string, _platform: string, version: string) =>
		Promise.resolve(version),
	install,
}));

const log = {
	warn: vi.fn(),
	debug: vi.fn(),
};

/** The directory `ensureBrowserInstalled` should resolve to. */
function installDirFor(): string {
	return path.join(cacheDir, "chrome", `${PLATFORM}-${BUILD_ID}`);
}

/** Take a handle on the install, as a session about to launch Chrome would. */
function acquireInstall() {
	return ensureBrowserInstalled({ browserVersion: BUILD_ID, log });
}

/** Make `install()` behave like a real extraction into the cache. */
function stubSuccessfulInstall(): void {
	install.mockImplementation(async () => {
		const installDir = installDirFor();
		await fs.promises.mkdir(installDir, { recursive: true });
		await fs.promises.writeFile(path.join(installDir, "chrome"), "");
		return { executablePath: path.join(installDir, "chrome") };
	});
}

beforeEach(() => {
	cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "miniflare-chrome-"));
	install.mockReset();
	log.warn.mockReset();
	log.debug.mockReset();
});

afterEach(() => {
	removeDirSync(cacheDir);
});

describe("ensureBrowserInstalled", () => {
	test("resolves the versioned install directory", async ({ expect }) => {
		stubSuccessfulInstall();

		const { installDir, executablePath } = await acquireInstall();

		expect(installDir).toBe(installDirFor());
		expect(executablePath).toBe(path.join(installDirFor(), "chrome"));
	});

	test("shares a single install between concurrent callers", async ({
		expect,
	}) => {
		// Without the in-flight map, the second caller reaches `install()` while
		// the first is still extracting. `@puppeteer/browsers` then short-circuits
		// on the partially-written directory and hands back a Chrome that cannot
		// launch — the failure this map exists to prevent.
		install.mockImplementation(async () => {
			// Long enough to still be extracting when the second call arrives.
			await new Promise((resolve) => setTimeout(resolve, 50));
			const installDir = installDirFor();
			await fs.promises.mkdir(installDir, { recursive: true });
			return { executablePath: path.join(installDir, "chrome") };
		});

		const [first, second] = await Promise.all([
			acquireInstall(),
			acquireInstall(),
		]);

		expect(first.executablePath).toBe(second.executablePath);
		expect(install).toHaveBeenCalledTimes(1);
	});

	test("allows a fresh install once the previous one has settled", async ({
		expect,
	}) => {
		stubSuccessfulInstall();

		await acquireInstall();
		await acquireInstall();

		expect(install).toHaveBeenCalledTimes(2);
	});

	test("does not mark the install as verified", async ({ expect }) => {
		// `install()` resolving proves nothing: it short-circuits whenever the
		// directory and executable exist, which a half-extracted archive
		// satisfies. Marking here would suppress the recovery in `discard()`.
		stubSuccessfulInstall();

		const { installDir } = await acquireInstall();

		expect(isInstallMarkedComplete(installDir)).toBe(false);
	});
});

describe("markVerified", () => {
	test("marks the install, idempotently", async ({ expect }) => {
		stubSuccessfulInstall();
		const installed = await acquireInstall();

		expect(isInstallMarkedComplete(installed.installDir)).toBe(false);
		await installed.markVerified();
		expect(isInstallMarkedComplete(installed.installDir)).toBe(true);
		await installed.markVerified();
		expect(isInstallMarkedComplete(installed.installDir)).toBe(true);
	});

	test("does not throw when the install directory is gone", async ({
		expect,
	}) => {
		// Resolve an install without creating anything on disk, as if the
		// directory had been swept up between installing and launching.
		install.mockResolvedValue({
			executablePath: path.join(installDirFor(), "chrome"),
		});
		const installed = await acquireInstall();

		await installed.markVerified();

		expect(isInstallMarkedComplete(installed.installDir)).toBe(false);
		expect(log.debug).toHaveBeenCalled();
	});
});

describe("discard", () => {
	test("clears an unverified install", async ({ expect }) => {
		stubSuccessfulInstall();
		const installed = await acquireInstall();

		expect(await installed.discard()).toEqual({ outcome: "cleared" });
		expect(fs.existsSync(installed.installDir)).toBe(false);
		expect(log.warn).toHaveBeenCalled();
	});

	test("keeps an install that Chrome has already launched from", async ({
		expect,
	}) => {
		// A launch failure here is a real bug, not a bad download, so deleting
		// 150 MB and trying again would only hide it.
		stubSuccessfulInstall();
		const installed = await acquireInstall();
		await installed.markVerified();

		expect(await installed.discard()).toEqual({ outcome: "verified" });
		expect(fs.existsSync(installed.installDir)).toBe(true);
		expect(log.warn).not.toHaveBeenCalled();
	});

	test("keeps an install a concurrent launch is still confirming", async ({
		expect,
	}) => {
		// Launches run concurrently, one per session acquire. If one succeeds
		// while another is failing, the failing one must not delete the
		// directory the working Chrome is running from — even though the on-disk
		// marker has not been written yet.
		stubSuccessfulInstall();
		const succeeding = await acquireInstall();
		const failing = await acquireInstall();

		// Deliberately not awaited: the marker write is still in flight.
		const marking = succeeding.markVerified();

		expect(await failing.discard()).toEqual({ outcome: "verified" });
		expect(fs.existsSync(failing.installDir)).toBe(true);

		await marking;
	});

	test("keeps an install a concurrent launch has already replaced", async ({
		expect,
	}) => {
		// Two launches failing against the same bad install: the first clears
		// and re-downloads it, and the second must retry against that fresh
		// copy rather than delete it too.
		stubSuccessfulInstall();
		const first = await acquireInstall();
		const second = await acquireInstall();

		expect(await first.discard()).toEqual({ outcome: "cleared" });

		// Stand in for the peer's re-download.
		await acquireInstall();

		expect(await second.discard()).toEqual({ outcome: "superseded" });
		expect(fs.existsSync(path.join(second.installDir, "chrome"))).toBe(true);
	});

	test("retries against a replacement the peer has already proven", async ({
		expect,
	}) => {
		// The peer got all the way through: cleared, re-downloaded, launched and
		// marked verified. The launch still holding the old generation must be
		// told to retry, not that the install is fine — otherwise it fails while
		// a working Chrome is available.
		stubSuccessfulInstall();
		const peer = await acquireInstall();
		const stale = await acquireInstall();

		await peer.discard();
		await (await acquireInstall()).markVerified();

		expect(await stale.discard()).toEqual({ outcome: "superseded" });
	});

	test("reports why an install could not be cleared", async ({ expect }) => {
		// Windows keeps handles on a just-crashed Chrome, so removal can fail.
		// The caller turns this into an actionable error, which matters because
		// Miniflare logs to a no-op by default.
		stubSuccessfulInstall();
		const installed = await acquireInstall();
		const locked = new Error("EBUSY: resource busy or locked");
		vi.spyOn(fs.promises, "rm").mockRejectedValue(locked);

		expect(await installed.discard()).toEqual({
			outcome: "cleanup-failed",
			cause: locked,
		});
	}, 20_000);
});
