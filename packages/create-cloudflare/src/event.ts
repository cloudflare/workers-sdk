import type { C3Args } from "./types";
import type { PromptConfig } from "@cloudflare/cli/interactive";

export type Event =
	| {
			name: "c3 session started";
			properties: {
				/**
				 * The OS platform the CLI is running on
				 * This could be "Mac OS", "Windows", "Linux", etc.
				 */
				platform?: string;

				/**
				 * The version of the create-cloudflare CLI used
				 */
				c3Version?: string;

				/**
				 * The name of the package manager used to run the CLI
				 */
				packageManager?: string;

				/**
				 * The CLI arguments set at the time the event is sent
				 */
				args?: Partial<C3Args>;

				/**
				 * Whether this is the first time the user is using the CLI
				 * Determined by checking if the user has a permission set in the metrics config
				 */
				isFirstUsage?: boolean;
			};
	  }
	| {
			name: "c3 session cancelled";
			properties: {
				/**
				 * The OS platform the CLI is running on
				 * This could be "Mac OS", "Windows", "Linux", etc.
				 */
				platform?: string;

				/**
				 * The version of the create-cloudflare CLI used
				 */
				c3Version?: string;

				/**
				 * The name of the package manager used to run the CLI
				 */
				packageManager?: string;

				/**
				 * The CLI arguments set at the time the event is sent
				 */
				args?: Partial<C3Args>;

				/**
				 * Whether this is the first time the user is using the CLI
				 * Determined by checking if the user has a permission set in the metrics config
				 */
				isFirstUsage?: boolean;

				/**
				 * The duration of the prompt since it started in milliseconds (ms)
				 */
				durationMs?: number;

				/**
				 * The duration of the prompt since it started in seconds
				 */
				durationSeconds?: number;

				/**
				 * The duration of the prompt since it started in minutes
				 */
				durationMinutes?: number;
			};
	  }
	| {
			name: "c3 session errored";
			properties: {
				/**
				 * The OS platform the CLI is running on
				 * This could be "Mac OS", "Windows", "Linux", etc.
				 */
				platform?: string;

				/**
				 * The version of the create-cloudflare CLI used
				 */
				c3Version?: string;

				/**
				 * The name of the package manager used to run the CLI
				 */
				packageManager?: string;

				/**
				 * The CLI arguments set at the time the event is sent
				 */
				args?: Partial<C3Args>;

				/**
				 * Whether this is the first time the user is using the CLI
				 * Determined by checking if the user has a permission set in the metrics config
				 */
				isFirstUsage?: boolean;

				/**
				 * The error that caused the session to be crashed
				 */
				error?: {
					message: string | undefined;
					stack: string | undefined;
				};

				/**
				 * The duration of the prompt since it started in milliseconds (ms)
				 */
				durationMs?: number;

				/**
				 * The duration of the prompt since it started in seconds
				 */
				durationSeconds?: number;

				/**
				 * The duration of the prompt since it started in minutes
				 */
				durationMinutes?: number;
			};
	  }
	| {
			name: "c3 session completed";
			properties: {
				/**
				 * The OS platform the CLI is running on
				 * This could be "Mac OS", "Windows", "Linux", etc.
				 */
				platform?: string;

				/**
				 * The version of the create-cloudflare CLI used
				 */
				c3Version?: string;

				/**
				 * The name of the package manager used to run the CLI
				 */
				packageManager?: string;

				/**
				 * The CLI arguments set at the time the event is sent
				 */
				args?: Partial<C3Args>;

				/**
				 * Whether this is the first time the user is using the CLI
				 * Determined by checking if the user has a permission set in the metrics config
				 */
				isFirstUsage?: boolean;

				/**
				 * The duration of the prompt since it started in milliseconds (ms)
				 */
				durationMs?: number;

				/**
				 * The duration of the prompt since it started in seconds
				 */
				durationSeconds?: number;

				/**
				 * The duration of the prompt since it started in minutes
				 */
				durationMinutes?: number;
			};
	  }
	| {
			name: "c3 prompt started";
			properties: {
				/**
				 * The OS platform the CLI is running on
				 * This could be "Mac OS", "Windows", "Linux", etc.
				 */
				platform?: string;

				/**
				 * The version of the create-cloudflare CLI used
				 */
				c3Version?: string;

				/**
				 * The name of the package manager used to run the CLI
				 */
				packageManager?: string;

				/**
				 * The CLI arguments set at the time the event is sent
				 */
				args?: Partial<C3Args>;

				/**
				 * Whether this is the first time the user is using the CLI
				 * Determined by checking if the user has a permission set in the metrics config
				 */
				isFirstUsage?: boolean;

				/**
				 * The argument key related to the prompt
				 */
				key?: string;

				/**
				 * An object containing all config passed to the prompt
				 */
				promptConfig?: PromptConfig;
			};
	  }
	| {
			name: "c3 prompt cancelled";
			properties: {
				/**
				 * The OS platform the CLI is running on
				 * This could be "Mac OS", "Windows", "Linux", etc.
				 */
				platform?: string;

				/**
				 * The version of the create-cloudflare CLI used
				 */
				c3Version?: string;

				/**
				 * The name of the package manager used to run the CLI
				 */
				packageManager?: string;

				/**
				 * The CLI arguments set at the time the event is sent
				 */
				args?: Partial<C3Args>;

				/**
				 * Whether this is the first time the user is using the CLI
				 * Determined by checking if the user has a permission set in the metrics config
				 */
				isFirstUsage?: boolean;

				/**
				 * The argument key related to the prompt
				 */
				key?: string;

				/**
				 * An object containing all config passed to the prompt
				 */
				promptConfig?: PromptConfig;

				/**
				 * The duration of the prompt since it started in milliseconds (ms)
				 */
				durationMs?: number;

				/**
				 * The duration of the prompt since it started in seconds
				 */
				durationSeconds?: number;

				/**
				 * The duration of the prompt since it started in minutes
				 */
				durationMinutes?: number;
			};
	  }
	| {
			name: "c3 prompt errored";
			properties: {
				/**
				 * The OS platform the CLI is running on
				 * This could be "Mac OS", "Windows", "Linux", etc.
				 */
				platform?: string;

				/**
				 * The version of the create-cloudflare CLI used
				 */
				c3Version?: string;

				/**
				 * The name of the package manager used to run the CLI
				 */
				packageManager?: string;

				/**
				 * The CLI arguments set at the time the event is sent
				 */
				args?: Partial<C3Args>;

				/**
				 * Whether this is the first time the user is using the CLI
				 * Determined by checking if the user has a permission set in the metrics config
				 */
				isFirstUsage?: boolean;

				/**
				 * The argument key related to the prompt
				 */
				key?: string;

				/**
				 * An object containing all config passed to the prompt
				 */
				promptConfig?: PromptConfig;

				/**
				 * The duration of the prompt since it started in milliseconds (ms)
				 */
				durationMs?: number;

				/**
				 * The duration of the prompt since it started in seconds
				 */
				durationSeconds?: number;

				/**
				 * The duration of the prompt since it started in minutes
				 */
				durationMinutes?: number;

				/**
				 * The error that caused the prompt to be crashed
				 */
				error?: {
					message: string | undefined;
					stack: string | undefined;
				};
			};
	  }
	| {
			name: "c3 prompt completed";
			properties: {
				/**
				 * The OS platform the CLI is running on
				 * This could be "Mac OS", "Windows", "Linux", etc.
				 */
				platform?: string;

				/**
				 * The version of the create-cloudflare CLI used
				 */
				c3Version?: string;

				/**
				 * The name of the package manager used to run the CLI
				 */
				packageManager?: string;

				/**
				 * The CLI arguments set at the time the event is sent
				 */
				args?: Partial<C3Args>;

				/**
				 * Whether this is the first time the user is using the CLI
				 * Determined by checking if the user has a permission set in the metrics config
				 */
				isFirstUsage?: boolean;

				/**
				 * The argument key related to the prompt
				 */
				key?: string;

				/**
				 * An object containing all config passed to the prompt
				 */
				promptConfig?: PromptConfig;

				/**
				 * The duration of the prompt since it started in milliseconds (ms)
				 */
				durationMs?: number;

				/**
				 * The duration of the prompt since it started in seconds
				 */
				durationSeconds?: number;

				/**
				 * The duration of the prompt since it started in minutes
				 */
				durationMinutes?: number;

				/**
				 *  The answer of the prompt. This could either be taken from the args provided or from the user input.
				 */
				answer?: unknown;

				/**
				 *  Whether the answer is the same as the default value of the prompt.
				 */
				isDefaultValue?: boolean;
			};
	  }
	| {
			name: "c3 login started";
			properties: {
				/**
				 * The OS platform the CLI is running on
				 * This could be "Mac OS", "Windows", "Linux", etc.
				 */
				platform?: string;

				/**
				 * The version of the create-cloudflare CLI used
				 */
				c3Version?: string;

				/**
				 * The name of the package manager used to run the CLI
				 */
				packageManager?: string;

				/**
				 * The CLI arguments set at the time the event is sent
				 */
				args?: Partial<C3Args>;

				/**
				 * Whether this is the first time the user is using the CLI
				 * Determined by checking if the user has a permission set in the metrics config
				 */
				isFirstUsage?: boolean;
			};
	  }
	| {
			name: "c3 login cancelled";
			properties: {
				/**
				 * The OS platform the CLI is running on
				 * This could be "Mac OS", "Windows", "Linux", etc.
				 */
				platform?: string;

				/**
				 * The version of the create-cloudflare CLI used
				 */
				c3Version?: string;

				/**
				 * The name of the package manager used to run the CLI
				 */
				packageManager?: string;

				/**
				 * The CLI arguments set at the time the event is sent
				 */
				args?: Partial<C3Args>;

				/**
				 * Whether this is the first time the user is using the CLI
				 * Determined by checking if the user has a permission set in the metrics config
				 */
				isFirstUsage?: boolean;

				/**
				 * Whether the user was already logged in before running the CLI
				 */
				isAlreadyLoggedIn?: boolean;

				/**
				 * Whether the user successfully going through the login process if they were not already logged in
				 */
				isLoginSuccessful?: boolean;

				/**
				 * The duration of the prompt since it started in milliseconds (ms)
				 */
				durationMs?: number;

				/**
				 * The duration of the prompt since it started in seconds
				 */
				durationSeconds?: number;

				/**
				 * The duration of the prompt since it started in minutes
				 */
				durationMinutes?: number;
			};
	  }
	| {
			name: "c3 login errored";
			properties: {
				/**
				 * The OS platform the CLI is running on
				 * This could be "Mac OS", "Windows", "Linux", etc.
				 */
				platform?: string;

				/**
				 * The version of the create-cloudflare CLI used
				 */
				c3Version?: string;

				/**
				 * The name of the package manager used to run the CLI
				 */
				packageManager?: string;

				/**
				 * The CLI arguments set at the time the event is sent
				 */
				args?: Partial<C3Args>;

				/**
				 * Whether this is the first time the user is using the CLI
				 * Determined by checking if the user has a permission set in the metrics config
				 */
				isFirstUsage?: boolean;

				/**
				 * Whether the user was already logged in before running the CLI
				 */
				isAlreadyLoggedIn?: boolean;

				/**
				 * Whether the user successfully going through the login process if they were not already logged in
				 */
				isLoginSuccessful?: boolean;

				/**
				 * The error that caused the session to be crashed
				 */
				error?: {
					message: string | undefined;
					stack: string | undefined;
				};

				/**
				 * The duration of the prompt since it started in milliseconds (ms)
				 */
				durationMs?: number;

				/**
				 * The duration of the prompt since it started in seconds
				 */
				durationSeconds?: number;

				/**
				 * The duration of the prompt since it started in minutes
				 */
				durationMinutes?: number;
			};
	  }
	| {
			name: "c3 login completed";
			properties: {
				/**
				 * The OS platform the CLI is running on
				 * This could be "Mac OS", "Windows", "Linux", etc.
				 */
				platform?: string;

				/**
				 * The version of the create-cloudflare CLI used
				 */
				c3Version?: string;

				/**
				 * The name of the package manager used to run the CLI
				 */
				packageManager?: string;

				/**
				 * The CLI arguments set at the time the event is sent
				 */
				args?: Partial<C3Args>;

				/**
				 * Whether this is the first time the user is using the CLI
				 * Determined by checking if the user has a permission set in the metrics config
				 */
				isFirstUsage?: boolean;

				/**
				 * Whether the user was already logged in before running the CLI
				 */
				isAlreadyLoggedIn?: boolean;

				/**
				 * Whether the user successfully going through the login process if they were not already logged in
				 */
				isLoginSuccessful?: boolean;

				/**
				 * The duration of the prompt since it started in milliseconds (ms)
				 */
				durationMs?: number;

				/**
				 * The duration of the prompt since it started in seconds
				 */
				durationSeconds?: number;

				/**
				 * The duration of the prompt since it started in minutes
				 */
				durationMinutes?: number;
			};
	  };
