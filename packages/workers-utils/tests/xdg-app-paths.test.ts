import os from "node:os";
import path from "node:path";
import {
	afterEach,
	beforeEach,
	describe,
	type ExpectStatic,
	it,
	vi,
} from "vitest";
// The real (CommonJS) `xdg-app-paths` package is kept as a test-only
// devDependency purely so we can assert that our vendored pure-ESM
// reimplementation resolves byte-for-byte identical paths. It must never be
// imported by `src/`.
import realXdgAppPaths from "xdg-app-paths";
import { xdgAppPaths } from "../src/xdg-app-paths";

/**
 * These tests pin the directory resolution to match `xdg-app-paths@8`
 * (→ `xdg-portable@10` → `os-paths@7`), which this module vendors as pure ESM.
 * The resolved paths hold Wrangler credentials, so they must not drift.
 */
describe("xdgAppPaths", () => {
	// Every OS/XDG environment variable our implementation (or the real package)
	// reads. Cleared before each test so scenarios start from a known state.
	const ENV_KEYS = [
		"HOME",
		"XDG_CONFIG_HOME",
		"XDG_CACHE_HOME",
		"APPDATA",
		"LOCALAPPDATA",
		"USERPROFILE",
		"HOMEDRIVE",
		"HOMEPATH",
		"ALLUSERSPROFILE",
		"SystemRoot",
		"windir",
		"SystemDrive",
		"TMPDIR",
		"TEMP",
		"TMP",
	];

	beforeEach(() => {
		for (const key of ENV_KEYS) {
			vi.stubEnv(key, "");
			delete process.env[key];
		}
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	function stubPlatform(platform: NodeJS.Platform) {
		vi.stubGlobal("process", { ...process, platform });
	}

	describe("explicit platform pins", () => {
		it("appends the (parsed) app name as the final path segment", ({
			expect,
		}) => {
			vi.stubEnv("XDG_CONFIG_HOME", "/conf");
			vi.stubEnv("XDG_CACHE_HOME", "/cache");

			expect(xdgAppPaths(".wrangler").config()).toBe(
				path.join("/conf", ".wrangler")
			);
			expect(xdgAppPaths(".wrangler").cache()).toBe(
				path.join("/cache", ".wrangler")
			);
			expect(xdgAppPaths("cf").config()).toBe(path.join("/conf", "cf"));
		});

		it("honours XDG_CONFIG_HOME / XDG_CACHE_HOME when set", ({ expect }) => {
			vi.stubEnv("XDG_CONFIG_HOME", "/xdg/conf");
			vi.stubEnv("XDG_CACHE_HOME", "/xdg/cache");

			expect(xdgAppPaths(".wrangler").config()).toBe(
				path.join("/xdg/conf", ".wrangler")
			);
			expect(xdgAppPaths(".wrangler").cache()).toBe(
				path.join("/xdg/cache", ".wrangler")
			);
		});

		it("falls back to the macOS Library directories", ({ expect }) => {
			stubPlatform("darwin");
			// Mock `os.homedir()` directly rather than relying on `$HOME`: Node
			// only consults `$HOME` on POSIX, so on Windows CI runners the real
			// home directory would leak in.
			vi.spyOn(os, "homedir").mockReturnValue("/Users/test");

			expect(xdgAppPaths(".wrangler").config()).toBe(
				path.join("/Users/test", "Library", "Preferences", ".wrangler")
			);
			expect(xdgAppPaths(".wrangler").cache()).toBe(
				path.join("/Users/test", "Library", "Caches", ".wrangler")
			);
		});

		it("falls back to the Linux dotfile directories", ({ expect }) => {
			stubPlatform("linux");
			vi.spyOn(os, "homedir").mockReturnValue("/home/test");

			expect(xdgAppPaths(".wrangler").config()).toBe(
				path.join("/home/test", ".config", ".wrangler")
			);
			expect(xdgAppPaths(".wrangler").cache()).toBe(
				path.join("/home/test", ".cache", ".wrangler")
			);
		});

		it("falls back to the Windows AppData directories", ({ expect }) => {
			stubPlatform("win32");
			vi.stubEnv("APPDATA", "C:\\Users\\test\\AppData\\Roaming");
			vi.stubEnv("LOCALAPPDATA", "C:\\Users\\test\\AppData\\Local");

			expect(xdgAppPaths(".wrangler").config()).toBe(
				path.join(
					"C:\\Users\\test\\AppData\\Roaming",
					"xdg.config",
					".wrangler"
				)
			);
			expect(xdgAppPaths(".wrangler").cache()).toBe(
				path.join("C:\\Users\\test\\AppData\\Local", "xdg.cache", ".wrangler")
			);
		});
	});

	/**
	 * Compare our vendored implementation against the real `xdg-app-paths`
	 * package across a wide range of scenarios. The real package resolves the
	 * platform at module-load time, so this exercises the current platform's
	 * branch — across CI (Linux, macOS, Windows) every branch is covered against
	 * the real implementation.
	 */
	describe("matches the real xdg-app-paths package", () => {
		/** Assert parity for a single app name across both `config` and `cache`. */
		function expectParity(expect: ExpectStatic, name: string) {
			const mine = xdgAppPaths(name);
			const real = realXdgAppPaths(name);
			expect(mine.config()).toBe(real.config());
			expect(mine.cache()).toBe(real.cache());
		}

		// A deliberately awkward set of application names that exercise
		// `path.parse(name).name` (extension stripping, leading dots, nested
		// paths, casing, whitespace, multiple dots, etc.).
		const NAMES = [
			".wrangler",
			"wrangler",
			".cf",
			"cf",
			"a",
			"UPPER",
			"with space",
			"my.app", // extension `.app` is stripped -> `my`
			".foo.bar", // -> `.foo`
			"name.with.many.dots", // -> `name.with.many`
			"foo.config.json",
			".dotonly",
			"trailing.",
			"sub/dir/name", // parent dirs stripped -> `name`
			"weird name.tar.gz",
			"123",
			"-dash",
			"_under",
		];

		// Reusable path values covering absolute, trailing-slash, relative,
		// spaced, deeply-nested and Windows-style inputs.
		const POSIX_DIRS = [
			"/tmp/xdg",
			"/tmp/xdg/", // trailing slash should be normalised away
			"/tmp/has space/xdg",
			"/tmp/a/b/c/d/e",
			"relative/dir", // relative path (no leading slash)
			".",
		];
		const WIN_DIRS = [
			"C:\\Users\\test\\AppData\\Roaming",
			"C:\\Users\\test\\AppData\\Local",
			"D:\\custom\\xdg",
			"C:\\with space\\dir",
		];

		// Build a broad matrix of environment scenarios.
		const scenarios: Record<string, string>[] = [
			// Nothing set — pure OS defaults.
			{},
		];

		// XDG_CONFIG_HOME / XDG_CACHE_HOME individually and together, across the
		// various path shapes.
		for (const dir of POSIX_DIRS) {
			scenarios.push({ XDG_CONFIG_HOME: dir });
			scenarios.push({ XDG_CACHE_HOME: dir });
			scenarios.push({ XDG_CONFIG_HOME: dir, XDG_CACHE_HOME: dir });
		}

		// HOME variations (mostly a no-op on POSIX where os.homedir() wins, but
		// must still match the real package exactly).
		for (const home of ["/home/someone", "/home/someone/", "/root", "."]) {
			scenarios.push({ HOME: home });
			scenarios.push({ HOME: home, XDG_CONFIG_HOME: "/explicit/conf" });
		}

		// Windows-relevant variables. On non-Windows these are ignored by both
		// implementations, so parity must still hold.
		for (const dir of WIN_DIRS) {
			scenarios.push({ APPDATA: dir });
			scenarios.push({ LOCALAPPDATA: dir });
			scenarios.push({ APPDATA: dir, LOCALAPPDATA: dir });
		}
		scenarios.push({
			USERPROFILE: "C:\\Users\\test",
			APPDATA: "C:\\Users\\test\\AppData\\Roaming",
			LOCALAPPDATA: "C:\\Users\\test\\AppData\\Local",
		});
		scenarios.push({
			HOMEDRIVE: "C:",
			HOMEPATH: "\\Users\\test",
			APPDATA: "C:\\Users\\test\\AppData\\Roaming",
		});

		// Temp-directory variables (used only when there is no home directory).
		for (const tmp of ["/var/tmp", "/var/tmp/", "/tmp/has space"]) {
			scenarios.push({ TMPDIR: tmp });
			scenarios.push({ TEMP: tmp });
			scenarios.push({ TMP: tmp });
		}

		// A few "everything at once" combinations.
		scenarios.push({
			HOME: "/home/test",
			XDG_CONFIG_HOME: "/x/conf",
			XDG_CACHE_HOME: "/x/cache",
			APPDATA: "C:\\AppData\\Roaming",
			LOCALAPPDATA: "C:\\AppData\\Local",
			TMPDIR: "/tmp/scratch",
		});

		for (const scenario of scenarios) {
			it(`resolves identically for env ${JSON.stringify(scenario)}`, ({
				expect,
			}) => {
				for (const [key, value] of Object.entries(scenario)) {
					vi.stubEnv(key, value);
				}
				for (const name of NAMES) {
					expectParity(expect, name);
				}
			});
		}

		it("matches when there is no home directory (temp fallback)", ({
			expect,
		}) => {
			// Force the home directory to be empty so resolution falls through to
			// the temp directory. Both implementations call `os.homedir()`, so
			// spying on the shared module affects them equally.
			vi.spyOn(os, "homedir").mockReturnValue("");
			vi.stubEnv("TMPDIR", "/tmp/scratch");
			vi.stubEnv("TEMP", "/tmp/scratch");
			vi.stubEnv("TMP", "/tmp/scratch");

			for (const name of NAMES) {
				expectParity(expect, name);
			}
		});

		it("matches when both home and an explicit XDG dir are absent", ({
			expect,
		}) => {
			vi.spyOn(os, "homedir").mockReturnValue("");
			// No TMPDIR/TEMP/TMP either — exercises the os.tmpdir() / hard-coded
			// fallback path.
			for (const name of NAMES) {
				expectParity(expect, name);
			}
		});

		it("matches when an empty-string XDG dir is provided", ({ expect }) => {
			// Empty strings are falsy and must be treated as "unset" by both.
			vi.stubEnv("XDG_CONFIG_HOME", "");
			vi.stubEnv("XDG_CACHE_HOME", "");
			for (const name of NAMES) {
				expectParity(expect, name);
			}
		});

		// Windows derives a home directory from HOMEDRIVE/HOMEPATH when neither
		// os.homedir(), USERPROFILE nor HOME are available. `os-paths@7` joins
		// these with `||` (not `&&`), so a *partial* pair still yields a home.
		// These cases mock os.homedir() to "" so the branch is actually reached,
		// and — because the real package resolves the platform at load time —
		// they are compared against the real implementation on Windows CI.
		const homePathScenarios: Record<string, string>[] = [
			{ HOMEDRIVE: "C:", HOMEPATH: "\\Users\\test" },
			{ HOMEDRIVE: "C:" }, // HOMEDRIVE only
			{ HOMEPATH: "\\Users\\test" }, // HOMEPATH only
		];
		for (const scenario of homePathScenarios) {
			it(`matches HOMEDRIVE/HOMEPATH fallback for ${JSON.stringify(
				scenario
			)}`, ({ expect }) => {
				vi.spyOn(os, "homedir").mockReturnValue("");
				for (const [key, value] of Object.entries(scenario)) {
					vi.stubEnv(key, value);
				}
				for (const name of NAMES) {
					expectParity(expect, name);
				}
			});
		}
	});
});
