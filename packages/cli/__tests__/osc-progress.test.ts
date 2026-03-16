import { beforeEach, describe, test, vi } from "vitest";
import {
	clearOscProgress,
	ProgressState,
	supportsOscProgress,
	writeOscProgress,
} from "../osc-progress";
import * as streams from "../streams";

vi.mock("../streams", () => ({
	stderr: {
		isTTY: true,
		write: vi.fn(),
	},
	stdout: {
		isTTY: true,
		write: vi.fn(),
	},
}));

describe("osc-progress", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		delete process.env.WRANGLER_NO_OSC_PROGRESS;
		delete process.env.TERM_PROGRAM;
		delete process.env.WT_SESSION;
		delete process.env.ConEmuANSI;
		delete process.env.TERM;
	});

	describe("supportsOscProgress", () => {
		test("returns `false` when `WRANGLER_NO_OSC_PROGRESS` is set", ({
			expect,
		}) => {
			process.env.WRANGLER_NO_OSC_PROGRESS = "1";
			process.env.TERM_PROGRAM = "ghostty";

			expect(supportsOscProgress()).toBe(false);
		});

		test("returns `false` when `stdout` is not a TTY", ({ expect }) => {
			vi.mocked(streams.stdout).isTTY = false;
			process.env.TERM_PROGRAM = "ghostty";

			expect(supportsOscProgress()).toBe(false);
		});

		test("returns `true` for Ghostty terminal", ({ expect }) => {
			vi.mocked(streams.stdout).isTTY = true;
			process.env.TERM_PROGRAM = "ghostty";

			expect(supportsOscProgress()).toBe(true);
		});

		test("returns `true` for WezTerm terminal", ({ expect }) => {
			vi.mocked(streams.stdout).isTTY = true;
			process.env.TERM_PROGRAM = "WezTerm";

			expect(supportsOscProgress()).toBe(true);
		});

		test("returns `true` for iTerm terminal", ({ expect }) => {
			vi.mocked(streams.stdout).isTTY = true;
			process.env.TERM_PROGRAM = "iTerm.app";

			expect(supportsOscProgress()).toBe(true);
		});

		test("returns `true` for Windows Terminal", ({ expect }) => {
			vi.mocked(streams.stdout).isTTY = true;
			process.env.WT_SESSION = "some-session-id";

			expect(supportsOscProgress()).toBe(true);
		});

		test("returns `true` for ConEmu with ANSI enabled", ({ expect }) => {
			vi.mocked(streams.stdout).isTTY = true;
			process.env.ConEmuANSI = "ON";

			expect(supportsOscProgress()).toBe(true);
		});

		test("returns `true` for xterm-compatible terminals", ({ expect }) => {
			vi.mocked(streams.stdout).isTTY = true;
			process.env.TERM = "xterm-256color";

			expect(supportsOscProgress()).toBe(true);
		});

		test("returns `false` for unknown terminals", ({ expect }) => {
			vi.mocked(streams.stdout).isTTY = true;
			process.env.TERM = "some-random-terminal";

			expect(supportsOscProgress()).toBe(false);
		});
	});

	describe("writeOscProgress", () => {
		test("writes normal progress sequence", ({ expect }) => {
			vi.mocked(streams.stdout).isTTY = true;
			process.env.TERM_PROGRAM = "ghostty";

			writeOscProgress(ProgressState.Normal, 50);

			expect(streams.stdout.write).toHaveBeenCalledWith("\x1b]9;4;1;50\x07");
		});

		test("writes indeterminate progress sequence", ({ expect }) => {
			vi.mocked(streams.stdout).isTTY = true;
			process.env.TERM_PROGRAM = "ghostty";

			writeOscProgress(ProgressState.Indeterminate);

			expect(streams.stdout.write).toHaveBeenCalledWith("\x1b]9;4;3;0\x07");
		});

		test("writes error state sequence", ({ expect }) => {
			vi.mocked(streams.stdout).isTTY = true;
			process.env.TERM_PROGRAM = "ghostty";

			writeOscProgress(ProgressState.Error, 100);

			expect(streams.stdout.write).toHaveBeenCalledWith("\x1b]9;4;2;100\x07");
		});

		test("writes warning state sequence", ({ expect }) => {
			vi.mocked(streams.stdout).isTTY = true;
			process.env.TERM_PROGRAM = "ghostty";

			writeOscProgress(ProgressState.Warning, 75);

			expect(streams.stdout.write).toHaveBeenCalledWith("\x1b]9;4;4;75\x07");
		});

		test("clamps percentage above 100", ({ expect }) => {
			vi.mocked(streams.stdout).isTTY = true;
			process.env.TERM_PROGRAM = "ghostty";

			// Use Error state which is not throttled
			writeOscProgress(ProgressState.Error, 150);
			expect(streams.stdout.write).toHaveBeenCalledWith("\x1b]9;4;2;100\x07");
		});

		test("clamps percentage below 0", ({ expect }) => {
			vi.mocked(streams.stdout).isTTY = true;
			process.env.TERM_PROGRAM = "ghostty";

			// Use Warning state which is not throttled
			writeOscProgress(ProgressState.Warning, -50);
			expect(streams.stdout.write).toHaveBeenCalledWith("\x1b]9;4;4;0\x07");
		});

		test("rounds percentage to integer", ({ expect }) => {
			vi.mocked(streams.stdout).isTTY = true;
			process.env.TERM_PROGRAM = "ghostty";

			// Use Indeterminate first to avoid throttling, then Error state
			writeOscProgress(ProgressState.Error, 33.7);

			expect(streams.stdout.write).toHaveBeenCalledWith("\x1b]9;4;2;34\x07");
		});

		test("does not write when terminal is not supported", ({ expect }) => {
			vi.mocked(streams.stdout).isTTY = true;
			process.env.TERM = "dumb";

			writeOscProgress(ProgressState.Normal, 50);

			expect(streams.stdout.write).not.toHaveBeenCalled();
		});

		test("does not write when disabled via env var", ({ expect }) => {
			vi.mocked(streams.stdout).isTTY = true;
			process.env.TERM_PROGRAM = "ghostty";
			process.env.WRANGLER_NO_OSC_PROGRESS = "1";

			writeOscProgress(ProgressState.Normal, 50);

			expect(streams.stdout.write).not.toHaveBeenCalled();
		});
	});

	describe("clearOscProgress", () => {
		test("writes hidden state sequence", ({ expect }) => {
			vi.mocked(streams.stdout).isTTY = true;
			process.env.TERM_PROGRAM = "ghostty";

			clearOscProgress();

			expect(streams.stdout.write).toHaveBeenCalledWith("\x1b]9;4;0;0\x07");
		});

		test("does not write when terminal is not supported", ({ expect }) => {
			vi.mocked(streams.stdout).isTTY = true;
			process.env.TERM = "dumb";

			clearOscProgress();

			expect(streams.stdout.write).not.toHaveBeenCalled();
		});
	});
});
