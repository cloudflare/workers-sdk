import * as clack from "@clack/prompts";
// eslint-disable-next-line no-restricted-imports
import { expect, vi } from "vitest";
import type { Mock } from "vitest";

/**
 * Mocks for wrangler's `confirm`/`prompt`/`select`/`multiselect`
 * helpers in `src/dialogs.ts`. Those helpers are thin wrappers over
 * `@clack/prompts`, so the mocks here intercept the underlying clack
 * calls and assert against the option shape clack receives:
 *
 *   - `confirm({ message, initialValue })`
 *   - `text({ message, initialValue, validate })` (and `password` for secrets)
 *   - `select({ message, options, initialValue })`
 *   - `multiselect({ message, options, initialValues, required })`
 *
 * `dialogs.ts` adapts wrangler's `validate(): boolean | string` shape
 * to clack's `string | Error | undefined`, so we don't expose `validate`
 * through these expectations — assertions hit the surrounding metadata
 * (text, defaults, choices) instead.
 */

const clackMocks = clack as unknown as {
	confirm: Mock;
	text: Mock;
	password: Mock;
	select: Mock;
	multiselect: Mock;
};

/**
 * The expected values for a confirmation request.
 */
export interface ConfirmExpectation {
	/** The text expected to be seen in the confirmation dialog. */
	text: string;

	options?: { defaultValue: boolean };
	/** The mock response send back from the confirmation dialog. */
	result: boolean;
}

/**
 * Mock the implementation of `confirm()` that will respond with configured results
 * for configured confirmation text messages.
 *
 * If there is a call to `confirm()` that does not match any of the expectations
 * then an error is thrown.
 */
export function mockConfirm(...expectations: ConfirmExpectation[]) {
	for (const expectation of expectations) {
		clackMocks.confirm.mockImplementationOnce(
			(opts: Parameters<typeof clack.confirm>[0]) => {
				expect(opts.message).toStrictEqual(expectation.text);
				if (expectation.options) {
					expect(opts.initialValue).toStrictEqual(
						expectation.options.defaultValue
					);
				}
				return Promise.resolve(expectation.result);
			}
		);
	}
}

/**
 * The expected values for a prompt request.
 */
export interface PromptExpectation {
	/** The text expected to be seen in the prompt dialog. */
	text: string;
	/** The type of the prompt. */
	options?: {
		defaultValue?: string;
		isSecret?: boolean;
	};
	/** The mock response send back from the prompt dialog. */
	result: string;
}

/**
 * Shared FIFO queue of pending `mockPrompt` expectations. Both
 * `clack.text` and `clack.password` pop from the same queue —
 * tests don't know whether a prompt is rendered as text or password
 * (only the source code, via `isSecret: true`, decides), so the
 * mocks treat the two clack APIs as a single logical channel.
 */
let promptQueue: PromptExpectation[] = [];
const initialisedPromptHandler = { value: false };

function ensurePromptHandlerInstalled() {
	if (initialisedPromptHandler.value) {
		return;
	}
	initialisedPromptHandler.value = true;
	const popExpectation = (
		opts: Parameters<typeof clack.text>[0]
	): Promise<string> => {
		const expectation = promptQueue.shift();
		if (expectation === undefined) {
			throw new Error(
				`Unexpected call to \`@clack/prompts.text/.password({"message":${JSON.stringify(
					opts.message
				)}})\`.\nUse \`mockPrompt()\` to mock prompt calls.`
			);
		}
		expect(opts.message).toStrictEqual(expectation.text);
		if (
			expectation.options &&
			!expectation.options.isSecret &&
			"initialValue" in opts
		) {
			expect(opts.initialValue).toStrictEqual(
				expectation.options.defaultValue
			);
		}
		return Promise.resolve(expectation.result);
	};
	clackMocks.text.mockImplementation(popExpectation);
	clackMocks.password.mockImplementation(popExpectation);
}

/**
 * Mock the implementation of `prompt()` that will respond with configured results
 * for configured prompt text messages.
 *
 * If there is a call to `prompt()` that does not match any of the expectations
 * then an error is thrown.
 */
export function mockPrompt(...expectations: PromptExpectation[]) {
	ensurePromptHandlerInstalled();
	promptQueue.push(...expectations);
}

interface MockSelectOptions<Values> {
	choices: SelectOption<Values>[];
	defaultOption?: number;
}

interface SelectOption<Values> {
	title: string;
	description?: string;
	value: Values;
}
/**
 * The expected values for a select request.
 */
export interface SelectExpectation<Values> {
	/** The text expected to be seen in the select dialog. */
	text: string;

	options?: MockSelectOptions<Values>;
	/** The mock response send back from the select dialog. */
	result: string;
}

/**
 * Mock the implementation of `select()` that will respond with configured results
 * for configured select text messages.
 *
 * If there is a call to `select()` that does not match any of the expectations
 * then an error is thrown.
 */
export function mockSelect<Values>(
	...expectations: SelectExpectation<Values>[]
) {
	for (const expectation of expectations) {
		clackMocks.select.mockImplementationOnce(
			(opts: Parameters<typeof clack.select>[0]) => {
				expect(opts.message).toStrictEqual(expectation.text);
				if (expectation.options) {
					// `dialogs.ts` adapts {title, description, value} →
					// {label, value, hint}; assert on the clack shape.
					expect(opts.options).toStrictEqual(
						expectation.options.choices.map((choice) => ({
							label: choice.title,
							value: choice.value,
							hint: choice.description,
						}))
					);
					const expectedInitial =
						expectation.options.defaultOption !== undefined
							? expectation.options.choices[expectation.options.defaultOption]
									.value
							: undefined;
					expect(opts.initialValue).toStrictEqual(expectedInitial);
				}
				return Promise.resolve(expectation.result);
			}
		);
	}
}

export function clearDialogs() {
	const reject = (kind: string) =>
		vi.fn((opts: unknown) => {
			throw new Error(
				`Unexpected call to \`@clack/prompts.${kind}(${JSON.stringify(
					opts
				)})\`.`
			);
		});
	// Reset to the rejecting default after each test so leftover
	// mockImplementationOnce queues from a failed test don't leak across.
	clackMocks.confirm.mockImplementation(reject("confirm"));
	clackMocks.select.mockImplementation(reject("select"));
	clackMocks.multiselect.mockImplementation(reject("multiselect"));
	// Reset the shared text/password queue and reinstall handler.
	promptQueue = [];
	initialisedPromptHandler.value = false;
	clackMocks.text.mockImplementation(reject("text"));
	clackMocks.password.mockImplementation(reject("password"));
}
