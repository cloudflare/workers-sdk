import { tmpdir } from "node:os";
import { stripAnsi } from "@cloudflare/cli";
import { version } from "../../package.json";
import { keys } from "./constants";
import { spawnWithLogging, testEnv, waitForExit } from "./spawn";
import type { Writable } from "node:stream";

export type PromptHandler = {
	matcher: RegExp;
	input:
		| string[]
		| {
				type: "text";
				chunks: string[];
				assertErrorMessage?: string;
		  }
		| {
				type: "select";
				target: RegExp | string;
				assertDefaultSelection?: string;
				assertDescriptionText?: string;
		  };
};

export type RunnerConfig = {
	promptHandlers?: PromptHandler[];
	argv?: string[];
	quarantine?: boolean;
	timeout?: number;
	/**
	 * Specifies whether to assert the response from the specified route after deployment.
	 */
	verifyDeploy: null | {
		route: string;
		expectedText: string;
	};
	/**
	 * Specifies whether to run the preview script for the project and assert the response from the specified route.
	 */
	verifyPreview: null | {
		previewArgs?: string[];
		route: string;
		expectedText: string;
	};
	/**
	 * Specifies whether to run the test script for the project and verify the exit code.
	 */
	verifyTest?: boolean;
};

export const runC3 = async (
	argv: string[] = [],
	promptHandlers: PromptHandler[] = [],
	logStream: Writable,
	extraEnv: Record<string, string | undefined> = {},
) => {
	// We don't use the "test" package manager here (i.e. E2E_TEST_PM and E2E_TEST_PM_VERSION) because yarn 1.x doesn't actually provide a `dlx` version.
	// And in any case, this first step just installs a temp copy of create-cloudflare and executes it.
	// The point of `detectPackageManager()` is for delegating to framework tooling when generating a project correctly.
	const cmd = ["pnpx", `create-cloudflare@${version}`, ...argv];
	const proc = spawnWithLogging(
		cmd,
		{ env: { ...testEnv, ...extraEnv }, cwd: tmpdir() },
		logStream,
	);

	const onData = (data: string) => {
		handlePrompt(data);
	};

	// Clone the prompt handlers so we can consume them destructively
	promptHandlers = [...promptHandlers];

	// When changing selection, stdout updates but onData may not include the question itself
	// so we store the current PromptHandler if we have already matched the question
	let currentSelectDialog: PromptHandler | undefined;
	const handlePrompt = (data: string) => {
		const text = stripAnsi(data.toString());
		const lines = text.split("\n");
		const currentDialog = currentSelectDialog ?? promptHandlers[0];

		if (!currentDialog) {
			return;
		}

		const matchesPrompt = lines.some((line) =>
			currentDialog.matcher.test(line),
		);

		// if we don't match the current question and we haven't already matched it previously
		if (!matchesPrompt && !currentSelectDialog) {
			return;
		}

		if (Array.isArray(currentDialog.input)) {
			// keyboard input prompt handler
			currentDialog.input.forEach((keystroke) => {
				proc.stdin.write(keystroke);
			});
		} else if (currentDialog.input.type === "text") {
			// text prompt handler
			const { assertErrorMessage, chunks } = currentDialog.input;

			if (
				assertErrorMessage !== undefined &&
				!text.includes(assertErrorMessage)
			) {
				throw new Error(
					`The error message does not match; Expected "${assertErrorMessage}" but found "${text}".`,
				);
			}

			chunks.forEach((keystroke) => {
				proc.stdin.write(keystroke);
			});
		} else if (currentDialog.input.type === "select") {
			// select prompt handler

			// FirstFrame: The first onData call for the current select dialog
			const isFirstFrameOfCurrentSelectDialog =
				currentSelectDialog === undefined;

			// Our select prompt options start with ○ / ◁ for unselected options and ● / ◀ for the current selection
			const selectedOptionRegex = /^(●|◀)\s/;
			const currentSelection = lines
				.find((line) => line.match(selectedOptionRegex))
				?.replace(selectedOptionRegex, "");

			if (!currentSelection) {
				// sometimes `lines` contain only the 'clear screen' ANSI codes and not the prompt options
				return;
			}

			const { target, assertDefaultSelection, assertDescriptionText } =
				currentDialog.input;

			if (
				isFirstFrameOfCurrentSelectDialog &&
				assertDefaultSelection !== undefined &&
				assertDefaultSelection !== currentSelection
			) {
				throw new Error(
					`The default selection does not match; Expected "${assertDefaultSelection}" but found "${currentSelection}".`,
				);
			}

			const matchesSelectionTarget =
				typeof target === "string"
					? currentSelection.includes(target)
					: target.test(currentSelection);
			const description = text.replaceAll("\n", " ");

			if (
				matchesSelectionTarget &&
				assertDescriptionText !== undefined &&
				!description.includes(assertDescriptionText)
			) {
				throw new Error(
					`The description does not match; Expected "${assertDescriptionText}" but found "${description}".`,
				);
			}

			if (matchesSelectionTarget) {
				// matches selection, so hit enter
				proc.stdin.write(keys.enter);
				currentSelectDialog = undefined;
			} else {
				// target not selected, hit down and wait for stdout to update (onData will be called again)
				proc.stdin.write(keys.down);
				currentSelectDialog = currentDialog;
				return;
			}
		}

		// Consume the handler once we've used it
		promptHandlers.shift();

		// If we've consumed the last prompt handler, close the input stream
		// Otherwise, the process wont exit properly
		if (promptHandlers[0] === undefined) {
			proc.stdin.end();
		}
	};

	return waitForExit(proc, onData);
};
