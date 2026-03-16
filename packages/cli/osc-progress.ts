/**
 * OSC 9;4 Terminal Progress Support
 *
 * OSC 9;4 is an escape sequence that displays progress indicators in supported terminals.
 * The progress appears in:
 * - The tab header as a progress ring/indicator
 * - The Windows taskbar (on Windows Terminal)
 *
 * Known supported terminals:
 * - ConEmu
 * - Ghostty
 * - iTerm2
 * - WezTerm
 * - Windows Terminal
 *
 * Escape sequence format: \x1b]9;4;<state>;<percentage>\x07
 *
 * @see https://conemu.github.io/en/AnsiEscapeCodes.html#ConEmu_specific_OSC
 * @see https://learn.microsoft.com/en-us/windows/terminal/tutorials/progress-bar-sequences
 */

import { stdout } from "./streams";

/**
 * Progress states for OSC 9;4 escape sequences.
 */
export enum ProgressState {
	/**
	 * Remove/hide the progress indicator
	 */
	Hidden = 0,

	/**
	 * Standard progress with percentage (0-100)
	 */
	Normal = 1,

	/**
	 * Error state (typically displayed in red)
	 */
	Error = 2,

	/**
	 * Indeterminate/loading state (spinner-like, ignores percentage)
	 */
	Indeterminate = 3,

	/**
	 * Warning or paused state
	 */
	Warning = 4,
}

/**
 * Check if OSC progress is disabled via environment variable.
 */
function isOscProgressDisabled(): boolean {
	return process.env.WRANGLER_NO_OSC_PROGRESS === "1";
}

/**
 * Detect if the current terminal supports OSC 9;4 progress sequences.
 *
 * This checks for known supported terminals via environment variables.
 * Returns false if:
 * - WRANGLER_NO_OSC_PROGRESS=1 is set
 * - stdout is not a TTY
 * - Terminal is not recognized as supporting OSC 9;4
 */
export function supportsOscProgress(): boolean {
	if (isOscProgressDisabled()) {
		return false;
	}

	try {
		if (!stdout.isTTY) {
			return false;
		}
	} catch {
		return false;
	}

	const { TERM, TERM_PROGRAM, WT_SESSION } = process.env;

	const isSupportedTerminalProgram = ["ghostty", "iterm", "wezterm"].some((v) =>
		TERM_PROGRAM?.toLowerCase().includes(v)
	);
	if (isSupportedTerminalProgram) {
		return true;
	}

	// Windows Terminal
	if (WT_SESSION) {
		return true;
	}

	// ConEmu
	if (process.env.ConEmuANSI === "ON") {
		return true;
	}

	// Many xterm-compatible terminals support this
	if (TERM?.includes("xterm")) {
		return true;
	}

	return false;
}

// Throttling state
let lastWriteTime = 0;
const THROTTLE_MS = 100;

/**
 * Write an OSC 9;4 progress sequence to stdout.
 *
 * Progress updates (ProgressState.Normal) are throttled to max 1 per 100ms
 * to avoid flooding the terminal.
 *
 * @param state - The progress state to display
 * @param percentage - The progress percentage (0-100), ignored for Indeterminate state
 */
export function writeOscProgress(
	state: ProgressState,
	percentage: number = 0
): void {
	if (!supportsOscProgress()) {
		return;
	}

	// Throttle normal progress updates to avoid terminal flooding
	const now = Date.now();
	if (state === ProgressState.Normal && now - lastWriteTime < THROTTLE_MS) {
		return;
	}
	lastWriteTime = now;

	// Clamp percentage to valid range
	const clamped = Math.max(0, Math.min(100, Math.round(percentage)));

	// ESC ] 9 ; 4 ; <state> ; <progress> BEL
	stdout.write(`\x1b]9;4;${state};${clamped}\x07`);
}

/**
 * Clear the OSC 9;4 progress indicator.
 *
 * This should be called when an operation completes (success or failure)
 * to remove the progress indicator from the terminal.
 */
export function clearOscProgress(): void {
	if (!supportsOscProgress()) {
		return;
	}

	stdout.write(`\x1b]9;4;${ProgressState.Hidden};0\x07`);
}

// Track if cleanup handlers have been registered
let cleanupRegistered = false;

/**
 * Register process exit handlers to ensure OSC progress is cleared on exit.
 *
 * This should be called when starting a progress-tracked operation to ensure
 * the progress indicator is properly cleaned up even if the process exits
 * abnormally (e.g., Ctrl+C).
 *
 * Multiple calls are safe - handlers are only registered once.
 */
export function registerOscProgressCleanup(): void {
	if (cleanupRegistered) {
		return;
	}

	cleanupRegistered = true;

	const cleanup = () => {
		clearOscProgress();
	};

	// Clean up on normal exit
	process.on("exit", cleanup);

	// Clean up on SIGINT (Ctrl+C)
	process.on("SIGINT", () => {
		cleanup();
		process.exit(130);
	});

	// Clean up on SIGTERM
	process.on("SIGTERM", () => {
		cleanup();
		process.exit(143);
	});
}
