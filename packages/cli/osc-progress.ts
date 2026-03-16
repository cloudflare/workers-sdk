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
 * OSC 9;4 Terminal Progress Controller
 *
 * Provides a clean API for displaying progress indicators in supported terminals.
 * Progress appears in the terminal tab header and Windows taskbar.
 *
 * @example
 * ```typescript
 * import { terminalProgress } from "@cloudflare/cli";
 *
 * // Show progress
 * terminalProgress.setProgress(50);
 *
 * // Show indeterminate/loading state
 * terminalProgress.setIndeterminate();
 *
 * // Clear when done
 * terminalProgress.clear();
 * ```
 */
class OscProgressController {
	private lastWriteTime = 0;
	private cleanupRegistered = false;
	private readonly THROTTLE_MS = 100;

	/**
	 * Whether OSC progress is disabled via the WRANGLER_NO_OSC_PROGRESS=1 environment variable.
	 */
	get isDisabled(): boolean {
		return process.env.WRANGLER_NO_OSC_PROGRESS === "1";
	}

	/**
	 * Whether the current terminal supports OSC 9;4 progress sequences.
	 *
	 * Returns `false` if:
	 * - stdout is not a TTY
	 * - Terminal is not recognized as supporting OSC 9;4
	 * - WRANGLER_NO_OSC_PROGRESS=1 is set
	 */
	get isSupported(): boolean {
		if (this.isDisabled) {
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

		const isSupportedTerminalProgram = ["ghostty", "iterm", "wezterm"].some(
			(v) => TERM_PROGRAM?.toLowerCase().includes(v)
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

	/**
	 * Set determinate progress (0-100).
	 *
	 * Displays progress in the terminal tab/taskbar on supported terminals.
	 * Progress updates are throttled to max 1 per 100ms to avoid terminal flooding.
	 *
	 * @param percentage - Progress value from 0 to 100 (will be clamped and rounded)
	 */
	setProgress(percentage: number): void {
		this.ensureCleanup();
		this.write(ProgressState.Normal, percentage);
	}

	/**
	 * Set indeterminate (spinner/loading) state.
	 *
	 * Displays a loading indicator in the terminal tab/taskbar on supported terminals.
	 * Use this when you don't know the progress percentage.
	 */
	setIndeterminate(): void {
		this.ensureCleanup();
		this.write(ProgressState.Indeterminate);
	}

	/**
	 * Set error state and auto-clear after a brief display.
	 *
	 * Displays an error indicator (typically red) in the terminal tab/taskbar
	 * on supported terminals. The indicator automatically clears after 500ms.
	 */
	setError(): void {
		this.write(ProgressState.Error, 100);
		setTimeout(() => this.clear(), 500);
	}

	/**
	 * Set warning/paused state.
	 *
	 * Displays a warning indicator in the terminal tab/taskbar on supported terminals.
	 */
	setWarning(): void {
		this.ensureCleanup();
		this.write(ProgressState.Warning, 100);
	}

	/**
	 * Clear/hide the progress indicator.
	 *
	 * This should be called when an operation completes (success or failure)
	 * to remove the progress indicator from the terminal.
	 */
	clear(): void {
		if (!this.isSupported) {
			return;
		}

		stdout.write(`\x1b]9;4;${ProgressState.Hidden};0\x07`);
	}

	/**
	 * Register process exit handlers to ensure progress is cleared on exit.
	 *
	 * This is called automatically by setProgress, setIndeterminate, and setWarning.
	 * It ensures the progress indicator is properly cleaned up even if the process
	 * exits abnormally (e.g., Ctrl+C).
	 *
	 * Multiple calls are safe - handlers are only registered once.
	 */
	ensureCleanup(): void {
		if (this.cleanupRegistered) {
			return;
		}

		this.cleanupRegistered = true;

		const cleanup = (): void => {
			this.clear();
		};

		process.on("exit", cleanup);

		process.on("SIGINT", () => {
			cleanup();
			process.exit(130);
		});

		process.on("SIGTERM", () => {
			cleanup();
			process.exit(143);
		});
	}

	/**
	 * Write an OSC 9;4 progress sequence to stdout.
	 *
	 * @param state - The progress state to display
	 * @param percentage - The progress percentage (0-100), ignored for Indeterminate state
	 */
	private write(state: ProgressState, percentage: number = 0): void {
		if (!this.isSupported) {
			return;
		}

		// Throttle normal progress updates to avoid terminal flooding
		const now = Date.now();
		if (
			state === ProgressState.Normal &&
			now - this.lastWriteTime < this.THROTTLE_MS
		) {
			return;
		}
		this.lastWriteTime = now;

		const clamped = Math.max(0, Math.min(100, Math.round(percentage)));

		// ESC ] 9 ; 4 ; <state> ; <progress> BEL
		stdout.write(`\x1b]9;4;${state};${clamped}\x07`);
	}
}

/**
 * Singleton instance for controlling OSC 9;4 terminal progress indicators.
 *
 * @example
 * ```typescript
 * import { terminalProgress } from "@cloudflare/cli";
 *
 * // Check if supported
 * if (terminalProgress.isSupported) {
 *     terminalProgress.setProgress(50);
 * }
 *
 * // Or just call methods directly (they no-op if unsupported)
 * terminalProgress.setProgress(75);
 * terminalProgress.clear();
 * ```
 */
export const terminalProgress = new OscProgressController();
