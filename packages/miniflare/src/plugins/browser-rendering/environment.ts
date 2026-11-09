import os from "node:os";

// Keep this list explicit: prefix matching would also copy unrelated secrets
// such as integration tokens into the browser process.
const BROWSER_ENVIRONMENT_VARIABLES = new Set([
	// User configuration, temporary files, and helper executable discovery.
	"HOME",
	"PATH",
	"TMPDIR",
	"TMP",
	"TEMP",
	"XDG_CONFIG_HOME",
	"XDG_CACHE_HOME",
	"XDG_DATA_HOME",
	"XDG_DATA_DIRS",
	"XDG_CONFIG_DIRS",
	"XDG_RUNTIME_DIR",
	"CHROME_CONFIG_HOME",
	// Custom Linux sandbox helper when user namespaces are unavailable.
	"CHROME_DEVEL_SANDBOX",
	// Windows profile paths and DLL discovery, including sandboxed processes.
	"SYSTEMROOT",
	"SYSTEMDRIVE",
	"WINDIR",
	"USERPROFILE",
	"HOMEDRIVE",
	"HOMEPATH",
	"LOCALAPPDATA",
	"APPDATA",
	"PROGRAMDATA",
	// Headful Linux sessions and font discovery also used for rendering PDFs.
	"DISPLAY",
	"WAYLAND_DISPLAY",
	"XAUTHORITY",
	"DBUS_SESSION_BUS_ADDRESS",
	"XDG_SESSION_TYPE",
	"XDG_CURRENT_DESKTOP",
	"FONTCONFIG_FILE",
	"FONTCONFIG_PATH",
	// Locale and timezone influence rendered content.
	"LANG",
	"LANGUAGE",
	"LC_ALL",
	"LC_CTYPE",
	"LC_MESSAGES",
	"LC_COLLATE",
	"LC_MONETARY",
	"LC_NUMERIC",
	"LC_TIME",
	"TZ",
	// Explicit certificate locations and proxy configuration.
	"SSL_CERT_FILE",
	"SSL_CERT_DIR",
	"HTTP_PROXY",
	"HTTPS_PROXY",
	"ALL_PROXY",
	"NO_PROXY",
	"http_proxy",
	"https_proxy",
	"all_proxy",
	"no_proxy",
	"SOCKS_SERVER",
	"SOCKS_VERSION",
]);

/**
 * Forward browser configuration without exposing the host's application secrets.
 *
 * @param fallbackHome - Private profile directory to use if HOME and the OS
 * account's home are unavailable, for example for an arbitrary container UID.
 * @param source - Environment from which browser configuration is selected.
 * @param platform - Host platform, used for Windows' case-insensitive names.
 * @returns Chrome's environment, always including a non-empty HOME.
 */
export function getBrowserEnvironment(
	fallbackHome: string,
	source: NodeJS.ProcessEnv = process.env,
	platform: NodeJS.Platform = process.platform
): NodeJS.ProcessEnv {
	const env: NodeJS.ProcessEnv = {};
	for (const [name, value] of Object.entries(source)) {
		// Windows environment names are case-insensitive. Canonicalising them
		// also avoids passing duplicate spellings to Node's process launcher.
		const key = platform === "win32" ? name.toUpperCase() : name;
		if (BROWSER_ENVIRONMENT_VARIABLES.has(key)) {
			env[key] = value;
		}
	}

	if (!env.HOME) {
		try {
			env.HOME = os.userInfo().homedir || fallbackHome;
		} catch {
			// Arbitrary container UIDs may have no account database entry.
			env.HOME = fallbackHome;
		}
	}
	return env;
}
