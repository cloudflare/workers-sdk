import os from "node:os";
import path from "node:path";

/**
 * @module
 *
 * A small, pure-ESM, dependency-free reimplementation of the subset of
 * [`xdg-app-paths`](https://www.npmjs.com/package/xdg-app-paths) that this
 * repository relies on.
 *
 * `xdg-app-paths` (and its `xdg-portable` / `os-paths` dependencies) ship as
 * CommonJS. When the consuming package is bundled to ESM (e.g. via tsup or when
 * a downstream consumer runs through Vite), the CJS `require()` calls are
 * shimmed and throw at runtime ("Dynamic require of 'path' is not supported").
 * Vendoring the resolution logic here keeps the behaviour identical while
 * remaining pure ESM.
 *
 * The path resolution intentionally mirrors `xdg-app-paths@8` →
 * `xdg-portable@10` → `os-paths@7` exactly so that the resolved config/cache
 * directories (which hold, amongst other things, Wrangler's auth credentials)
 * do not change for existing users.
 *
 * ---
 *
 * This implementation is adapted from `xdg-app-paths`, `xdg-portable` and
 * `os-paths` (https://github.com/rivy/js.xdg-app-paths), published under the
 * MIT License:
 *
 *   Copyright (c) Roy Ivy III <rivy.dev@gmail.com>
 *   Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (sindresorhus.com)
 *
 *   Permission is hereby granted, free of charge, to any person obtaining a
 *   copy of this software and associated documentation files (the "Software"),
 *   to deal in the Software without restriction, including without limitation
 *   the rights to use, copy, modify, merge, publish, distribute, sublicense,
 *   and/or sell copies of the Software, and to permit persons to whom the
 *   Software is furnished to do so, subject to the following conditions:
 *
 *   The above copyright notice and this permission notice shall be included in
 *   all copies or substantial portions of the Software.
 *
 *   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 *   IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 *   FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 *   AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 *   LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 *   FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 *   DEALINGS IN THE SOFTWARE.
 */

function isWindows(): boolean {
	return /^win/i.test(process.platform);
}

function isMacOS(): boolean {
	return /^darwin$/i.test(process.platform);
}

function isNonEmpty(value: string | undefined): value is string {
	return !!value;
}

/**
 * Read an OS/XDG environment variable. Accessed dynamically (mirroring
 * `xdg-portable`'s `env.get()`) so these process-level variables don't need to
 * be declared as build inputs (`turbo/no-undeclared-env-vars`) — they are not
 * Wrangler configuration variables.
 */
function getEnv(name: string): string | undefined {
	return process.env[name];
}

/** Mirrors `os-paths`' `normalizePath`. */
function normalizePath(p: string | undefined): string | undefined {
	return p ? path.normalize(path.join(p, ".")) : undefined;
}

/** Mirrors `os-paths`' `home()`. */
function homeDir(): string | undefined {
	if (isWindows()) {
		const priorityList = [
			os.homedir(),
			getEnv("USERPROFILE"),
			getEnv("HOME"),
			// NOTE: `os-paths@7` uses `||` here (not `&&`), so a home directory is
			// derived even when only one of HOMEDRIVE/HOMEPATH is set. This is
			// preserved deliberately for byte-for-byte parity — see the parity
			// tests, which compare this branch against the real package.
			getEnv("HOMEDRIVE") || getEnv("HOMEPATH")
				? path.join(getEnv("HOMEDRIVE") ?? "", getEnv("HOMEPATH") ?? "")
				: undefined,
		];
		return normalizePath(priorityList.find(isNonEmpty));
	}
	return normalizePath(os.homedir() || getEnv("HOME"));
}

function joinToBase(
	base: string | undefined,
	segments: string[]
): string | undefined {
	return base ? path.join(base, ...segments) : undefined;
}

/** Mirrors `os-paths`' `temp()`. */
function tempDir(): string {
	if (isWindows()) {
		const fallback = "C:\\Temp";
		const priorityListLazy: Array<() => string | undefined> = [
			() => os.tmpdir(),
			() => getEnv("TEMP"),
			() => getEnv("TMP"),
			() => joinToBase(getEnv("LOCALAPPDATA"), ["Temp"]),
			() => joinToBase(homeDir(), ["AppData", "Local", "Temp"]),
			() => joinToBase(getEnv("ALLUSERSPROFILE"), ["Temp"]),
			() => joinToBase(getEnv("SystemRoot"), ["Temp"]),
			() => joinToBase(getEnv("windir"), ["Temp"]),
			() => joinToBase(getEnv("SystemDrive"), ["\\", "Temp"]),
		];
		const found = priorityListLazy.find((fn) => isNonEmpty(fn()));
		return (found && normalizePath(found())) || fallback;
	}
	const fallback = "/tmp";
	const priorityList = [
		os.tmpdir(),
		getEnv("TMPDIR"),
		getEnv("TEMP"),
		getEnv("TMP"),
	];
	return normalizePath(priorityList.find(isNonEmpty)) || fallback;
}

/** Mirrors `xdg-portable`'s `baseDir()`. */
function baseDir(): string {
	return homeDir() || tempDir();
}

/** Mirrors `xdg-portable`'s `valOrPath()`. */
function valOrPath(value: string | undefined, segments: string[]): string {
	return value || path.join(...segments);
}

function windowsAppData(): string {
	return valOrPath(getEnv("APPDATA"), [baseDir(), "AppData", "Roaming"]);
}

function windowsLocalAppData(): string {
	return valOrPath(getEnv("LOCALAPPDATA"), [baseDir(), "AppData", "Local"]);
}

/** XDG config base directory (`xdg-portable`'s `config()`). */
function xdgConfig(): string {
	if (isMacOS()) {
		return valOrPath(getEnv("XDG_CONFIG_HOME"), [
			baseDir(),
			"Library",
			"Preferences",
		]);
	}
	if (isWindows()) {
		return valOrPath(getEnv("XDG_CONFIG_HOME"), [
			windowsAppData(),
			"xdg.config",
		]);
	}
	return valOrPath(getEnv("XDG_CONFIG_HOME"), [baseDir(), ".config"]);
}

/** XDG cache base directory (`xdg-portable`'s `cache()`). */
function xdgCache(): string {
	if (isMacOS()) {
		return valOrPath(getEnv("XDG_CACHE_HOME"), [
			baseDir(),
			"Library",
			"Caches",
		]);
	}
	if (isWindows()) {
		return valOrPath(getEnv("XDG_CACHE_HOME"), [
			windowsLocalAppData(),
			"xdg.cache",
		]);
	}
	return valOrPath(getEnv("XDG_CACHE_HOME"), [baseDir(), ".cache"]);
}

export interface XDGAppPaths {
	/** The XDG-compliant config directory for the application. */
	config(): string;
	/** The XDG-compliant cache directory for the application. */
	cache(): string;
}

/**
 * Resolve XDG-compliant application paths for the given application name.
 *
 * Equivalent to `xdgAppPaths(name)` with the default `isolated: true`, i.e. the
 * application name is appended as the final path segment.
 */
export function xdgAppPaths(name: string): XDGAppPaths {
	// `xdg-app-paths` runs the name through `path.parse(name).name`, which (for
	// example) leaves `.wrangler` untouched since a leading dot is not treated
	// as a file extension.
	const segment = path.parse(name).name;
	return {
		config: () => path.join(xdgConfig(), segment),
		cache: () => path.join(xdgCache(), segment),
	};
}
