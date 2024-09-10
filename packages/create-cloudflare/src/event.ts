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
	  };
