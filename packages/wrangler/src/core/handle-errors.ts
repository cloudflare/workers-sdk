import assert from "node:assert";
import { ApiError } from "@cloudflare/containers-shared";
import { UserError as ContainersUserError } from "@cloudflare/containers-shared/src/error";
import {
	APIError,
	CommandLineArgsError,
	COMPLIANCE_REGION_CONFIG_UNKNOWN,
	JsonFriendlyFatalError,
	ParseError,
	UserError,
} from "@cloudflare/workers-utils";
import chalk from "chalk";
import { Cloudflare } from "cloudflare";
import dedent from "ts-dedent";
import { createCLIParser } from "..";
import { renderError } from "../cfetch";
import { readConfig } from "../config";
import { isAuthenticationError } from "../deploy/deploy";
import {
	isBuildFailure,
	isBuildFailureFromCause,
} from "../deployment-bundle/build-failures";
import { logBuildFailure, logger } from "../logger";
import { captureGlobalException } from "../sentry";
import { getAuthFromEnv } from "../user";
import { whoami } from "../user/whoami";
import { logPossibleBugMessage } from "../utils/logPossibleBugMessage";
import type { ReadConfigCommandArgs } from "../config";
import type { ComplianceConfig } from "@cloudflare/workers-utils";

/**
 * SSL/TLS certificate error messages that indicate a corporate proxy or VPN
 * may be intercepting HTTPS traffic with a custom root certificate.
 */
const SSL_ERROR_SELF_SIGNED_CERT =
	"self-signed certificate in certificate chain";
const SSL_ERROR_UNABLE_TO_VERIFY = "unable to verify the first certificate";
const SSL_ERROR_UNABLE_TO_GET_ISSUER = "unable to get local issuer certificate";

const SSL_CERT_ERROR_MESSAGES = [
	SSL_ERROR_SELF_SIGNED_CERT,
	SSL_ERROR_UNABLE_TO_VERIFY,
	SSL_ERROR_UNABLE_TO_GET_ISSUER,
];

/**
 * Check if an error (or its cause) is related to SSL/TLS certificate validation,
 * which commonly occurs when a corporate proxy or VPN intercepts HTTPS traffic.
 */
function isCertificateError(e: unknown): boolean {
	const message = e instanceof Error ? e.message : String(e);
	const causeMessage =
		e instanceof Error && e.cause instanceof Error ? e.cause.message : "";

	return SSL_CERT_ERROR_MESSAGES.some(
		(errorText) =>
			message.includes(errorText) || causeMessage.includes(errorText)
	);
}

/**
 * Permission errors (EPERM, EACCES) are caused by file system
 * permissions that users need to fix outside of their code, so we present
 * a helpful message instead of reporting to Sentry.
 *
 * @param e - The error to check
 * @returns `true` if the error is a permission error, `false` otherwise
 */
function isPermissionError(e: unknown): boolean {
	// Check for Node.js ErrnoException with EPERM or EACCES code
	if (
		e &&
		typeof e === "object" &&
		"code" in e &&
		(e.code === "EPERM" || e.code === "EACCES") &&
		"message" in e
	) {
		return true;
	}

	// Check in the error cause as well
	if (e instanceof Error && e.cause) {
		return isPermissionError(e.cause);
	}

	return false;
}

/**
 * File not found errors (ENOENT) occur when users reference files or directories
 * that don't exist. We present a helpful message instead of reporting to Sentry.
 *
 * @param e - The error to check
 * @returns `true` if the error is a file not found error, `false` otherwise
 */
function isFileNotFoundError(e: unknown): boolean {
	// Check for Node.js ErrnoException with ENOENT code
	if (
		e &&
		typeof e === "object" &&
		"code" in e &&
		e.code === "ENOENT" &&
		"message" in e
	) {
		return true;
	}

	// Check in the error cause as well
	if (e instanceof Error && e.cause) {
		return isFileNotFoundError(e.cause);
	}

	return false;
}

/**
 * Check if a text string contains a reference to Cloudflare's API domains.
 * This is a safety precaution to only handle errors related to Cloudflare's
 * infrastructure, not user endpoints.
 *
 * @param text - The text to check for Cloudflare API references
 * @returns `true` if the text contains a Cloudflare API domain, `false` otherwise
 */
function isCloudflareAPI(text: string): boolean {
	return (
		text.includes("api.cloudflare.com") || text.includes("dash.cloudflare.com")
	);
}

/**
 * DNS resolution failures (ENOTFOUND) to Cloudflare's API are
 * caused by network connectivity or DNS problems, so we present
 * a helpful message instead of reporting to Sentry.
 *
 * @param e - The error to check
 * @returns `true` if the error is a DNS resolution failure to Cloudflare's API, `false` otherwise
 */
function isCloudflareAPIDNSError(e: unknown): boolean {
	// Only handle DNS errors to Cloudflare APIs

	const hasDNSErrorCode = (obj: unknown): boolean => {
		return (
			obj !== null &&
			typeof obj === "object" &&
			"code" in obj &&
			obj.code === "ENOTFOUND"
		);
	};

	if (hasDNSErrorCode(e)) {
		const message = e instanceof Error ? e.message : String(e);
		if (isCloudflareAPI(message)) {
			return true;
		}
		// Also check hostname property
		if (
			e &&
			typeof e === "object" &&
			"hostname" in e &&
			typeof e.hostname === "string"
		) {
			if (isCloudflareAPI(e.hostname)) {
				return true;
			}
		}
	}

	// Errors are often wrapped, so check the cause chain as well
	if (e instanceof Error && e.cause && hasDNSErrorCode(e.cause)) {
		const causeMessage =
			e.cause instanceof Error ? e.cause.message : String(e.cause);
		const parentMessage = e.message;
		if (isCloudflareAPI(causeMessage) || isCloudflareAPI(parentMessage)) {
			return true;
		}
		// Check hostname in cause
		if (
			typeof e.cause === "object" &&
			"hostname" in e.cause &&
			typeof e.cause.hostname === "string"
		) {
			if (isCloudflareAPI(e.cause.hostname)) {
				return true;
			}
		}
	}

	return false;
}

/**
 * Connection timeouts to Cloudflare's API are caused by slow networks or
 * connectivity problems, so we present a helpful message instead of
 * reporting to Sentry.
 *
 * @param e - The error to check
 * @returns `true` if the error is a connection timeout to Cloudflare's API, `false` otherwise
 */
function isCloudflareAPIConnectionTimeoutError(e: unknown): boolean {
	// Only handle timeouts to Cloudflare APIs - timeouts to user endpoints
	// (e.g., in dev server or user's own APIs) may indicate actual bugs
	const hasTimeoutCode = (obj: unknown): boolean => {
		return (
			obj !== null &&
			typeof obj === "object" &&
			"code" in obj &&
			obj.code === "UND_ERR_CONNECT_TIMEOUT"
		);
	};

	if (hasTimeoutCode(e)) {
		const message = e instanceof Error ? e.message : String(e);
		if (isCloudflareAPI(message)) {
			return true;
		}
	}

	// Errors are often wrapped, so check the cause chain as well
	if (e instanceof Error && e.cause && hasTimeoutCode(e.cause)) {
		const causeMessage =
			e.cause instanceof Error ? e.cause.message : String(e.cause);
		const parentMessage = e.message;
		if (isCloudflareAPI(causeMessage) || isCloudflareAPI(parentMessage)) {
			return true;
		}
	}

	return false;
}

/**
 * Generic "fetch failed" TypeErrors are network errors
 * caused by network connectivity problems. We show a helpful message instead
 * of sending to Sentry.
 *
 * @param e - The error to check
 * @returns `true` if the error is a network fetch failure, `false` otherwise
 */
function isNetworkFetchFailedError(e: unknown): boolean {
	if (e instanceof TypeError) {
		const message = e.message;
		if (message.includes("fetch failed")) {
			return true;
		}
	}

	return false;
}

/**
 * Determines the error type for telemetry purposes, or `undefined` if it cannot be determined.
 */
export function getErrorType(e: unknown): string | undefined {
	if (isCloudflareAPIDNSError(e)) {
		return "DNSError";
	}
	if (isPermissionError(e)) {
		return "PermissionError";
	}
	if (isFileNotFoundError(e)) {
		return "FileNotFoundError";
	}
	if (isCloudflareAPIConnectionTimeoutError(e)) {
		return "ConnectionTimeout";
	}
	if (isAuthenticationError(e) || isContainersAuthenticationError(e)) {
		return "AuthenticationError";
	}
	if (isBuildFailure(e) || isBuildFailureFromCause(e)) {
		return "BuildFailure";
	}
	return e instanceof Error ? e.constructor.name : undefined;
}

/**
 * Handles an error thrown during command execution.
 *
 * This can involve filtering, transforming and logging the error appropriately.
 */
export async function handleError(
	e: unknown,
	args: ReadConfigCommandArgs,
	subCommandParts: string[]
): Promise<void> {
	let mayReport = true;
	let loggableException = e;

	logger.log(""); // Just adds a bit of space

	// Log a helpful warning for SSL certificate errors caused by corporate proxies/VPNs
	if (isCertificateError(e)) {
		logger.warn(
			"Wrangler detected that a corporate proxy or VPN might be enabled on your machine, " +
				"resulting in API calls failing due to a certificate mismatch. " +
				"It is likely that you need to install the missing system roots provided by your corporate proxy vendor."
		);
	}

	// Handle DNS resolution errors to Cloudflare API with a user-friendly message
	if (isCloudflareAPIDNSError(e)) {
		mayReport = false;
		logger.error(dedent`
			Unable to resolve Cloudflare's API hostname (api.cloudflare.com or dash.cloudflare.com).

			This is typically caused by:
			  - No internet connection or network connectivity issues
			  - DNS resolver not configured or not responding
			  - Firewall or VPN blocking DNS requests
			  - Corporate network with restricted DNS

			Please check your network connection and DNS settings.
		`);
		return;
	}

	// Handle permission errors with a user-friendly message
	if (isPermissionError(e)) {
		mayReport = false;

		// Extract the error message and path, checking both the error and its cause
		const errorMessage = e instanceof Error ? e.message : String(e);
		let path: string | null = null;

		// Check main error for path
		if (
			e &&
			typeof e === "object" &&
			"path" in e &&
			typeof e.path === "string"
		) {
			path = e.path;
		}

		// If no path in main error, check the cause
		if (
			!path &&
			e instanceof Error &&
			e.cause &&
			typeof e.cause === "object" &&
			"path" in e.cause &&
			typeof e.cause.path === "string"
		) {
			path = e.cause.path;
		}

		// Always log the full error message in debug
		logger.debug(`Permission error: ${errorMessage}`);

		// Include path in main error if available, otherwise include the error message
		const errorDetails = path
			? `\nAffected path: ${path}\n`
			: `\nError: ${errorMessage}\n`;

		logger.error(dedent`
			A permission error occurred while accessing the file system.
			${errorDetails}
			This is typically caused by:
			  - Insufficient file or directory permissions
			  - Files or directories being locked by another process
			  - Antivirus or security software blocking access

			Please check the file permissions and try again.
		`);
		return;
	}

	// Handle file not found errors with a user-friendly message
	if (isFileNotFoundError(e)) {
		mayReport = false;

		// Extract the error message and path, checking both the error and its cause
		const errorMessage = e instanceof Error ? e.message : String(e);
		let path: string | null = null;

		// Check main error for path
		if (
			e &&
			typeof e === "object" &&
			"path" in e &&
			typeof e.path === "string"
		) {
			path = e.path;
		}

		// If no path in main error, check the cause
		if (
			!path &&
			e instanceof Error &&
			e.cause &&
			typeof e.cause === "object" &&
			"path" in e.cause &&
			typeof e.cause.path === "string"
		) {
			path = e.cause.path;
		}

		logger.debug(`File not found error: ${errorMessage}`);

		// Include path in main error if available, otherwise include the error message
		const errorDetails = path
			? `\nMissing file or directory: ${path}\n`
			: `\nError: ${errorMessage}\n`;

		logger.error(dedent`
			A file or directory could not be found.
			${errorDetails}
			This is typically caused by:
			  - The file or directory does not exist
			  - A typo in the file path
			  - The file was moved or deleted

			Please check the file path and try again.
		`);
		return;
	}

	// Handle connection timeout errors to Cloudflare API with a user-friendly message
	if (isCloudflareAPIConnectionTimeoutError(e)) {
		mayReport = false;
		logger.error(
			"The request to Cloudflare's API timed out.\n" +
				"This is likely due to network connectivity issues or slow network speeds.\n" +
				"Please check your internet connection and try again."
		);
		return;
	}

	// Handle generic "fetch failed" / "Failed to fetch" network errors
	if (isNetworkFetchFailedError(e)) {
		mayReport = false;
		logger.warn(dedent`
			A fetch request failed, likely due to a connectivity issue.

			Common causes:
			  - No internet connection or network connectivity problems
			  - Firewall or VPN blocking the request
			  - Network proxy configuration issues

			Please check your network connection and try again.
		`);
	}

	if (e instanceof CommandLineArgsError) {
		logger.error(e.message);
		// We are not able to ask the `wrangler` CLI parser to show help for a subcommand programmatically.
		// The workaround is to re-run the parsing with an additional `--help` flag, which will result in the correct help message being displayed.
		// The `wrangler` object is "frozen"; we cannot reuse that with different args, so we must create a new CLI parser to generate the help message.

		// Check if this is a root-level error (unknown argument at root level)
		// by looking at the error message - if it says "Unknown argument" or "Unknown command",
		// and there's only one non-flag argument, show the categorized root help
		const nonFlagArgs = subCommandParts.filter(
			(arg) => !arg.startsWith("-") && arg !== ""
		);
		const isRootLevelError =
			nonFlagArgs.length <= 1 &&
			(e.message.includes("Unknown argument") ||
				e.message.includes("Unknown command"));

		const { wrangler, showHelpWithCategories } = createCLIParser([
			...(isRootLevelError ? [] : subCommandParts),
			"--help",
		]);

		if (isRootLevelError) {
			await showHelpWithCategories();
			return;
		}

		await wrangler.parse();
	} else if (isAuthenticationError(e) || isContainersAuthenticationError(e)) {
		mayReport = false;
		if (e.cause instanceof ApiError) {
			logger.error(e.cause);
		} else {
			assert(isAuthenticationError(e));
			logger.error(e);
		}
		const envAuth = getAuthFromEnv();
		if (envAuth !== undefined && "apiToken" in envAuth) {
			const message =
				"📎 It looks like you are authenticating Wrangler via a custom API token set in an environment variable.\n" +
				"Please ensure it has the correct permissions for this operation.\n";
			logger.log(chalk.yellow(message));
		}
		const accountTag = (e as APIError)?.accountTag;
		let complianceConfig: ComplianceConfig = COMPLIANCE_REGION_CONFIG_UNKNOWN;
		let configAccountId: string | undefined;
		try {
			const config = await readConfig(args, {
				hideWarnings: true,
			});
			complianceConfig = config;
			configAccountId = config.account_id;
		} catch {
			// Ignore errors reading config
		}
		await whoami(complianceConfig, accountTag, configAccountId);
	} else if (e instanceof ParseError) {
		e.notes.push({
			text: "\nIf you think this is a bug, please open an issue at: https://github.com/cloudflare/workers-sdk/issues/new/choose",
		});
		logger.error(e);
	} else if (e instanceof JsonFriendlyFatalError) {
		logger.log(e.message);
	} else if (
		e instanceof Error &&
		e.message.includes("Raw mode is not supported on")
	) {
		// the current terminal doesn't support raw mode, which Ink needs to render
		// Ink doesn't throw a typed error or subclass or anything, so we just check the message content.
		// https://github.com/vadimdemedes/ink/blob/546fe16541fd05ad4e638d6842ca4cbe88b4092b/src/components/App.tsx#L138-L148
		mayReport = false;

		const currentPlatform = process.platform;

		const thisTerminalIsUnsupported = "This terminal doesn't support raw mode.";
		const soWranglerWontWork =
			"Wrangler uses raw mode to read user input and write output to the terminal, and won't function correctly without it.";
		const tryRunningItIn =
			"Try running your previous command in a terminal that supports raw mode";
		const oneOfThese =
			currentPlatform === "win32"
				? ", such as Command Prompt or Powershell."
				: currentPlatform === "darwin"
					? ", such as Terminal.app or iTerm."
					: "."; // linux user detected, hand holding disengaged.

		logger.error(
			`${thisTerminalIsUnsupported}\n${soWranglerWontWork}\n${tryRunningItIn}${oneOfThese}`
		);
	} else if (isBuildFailure(e)) {
		mayReport = false;
		logBuildFailure(e.errors, e.warnings);
	} else if (isBuildFailureFromCause(e)) {
		mayReport = false;
		logBuildFailure(e.cause.errors, e.cause.warnings);
	} else if (e instanceof Cloudflare.APIError) {
		const error = new APIError({
			text: `A request to the Cloudflare API failed.`,
			notes: [...e.errors.map((err) => ({ text: renderError(err) }))],
		});
		error.notes.push({
			text: "\nIf you think this is a bug, please open an issue at: https://github.com/cloudflare/workers-sdk/issues/new/choose",
		});
		logger.error(error);
	} else {
		if (
			// Is this a StartDevEnv error event? If so, unwrap the cause, which is usually the user-recognisable error
			e &&
			typeof e === "object" &&
			"type" in e &&
			e.type === "error" &&
			"cause" in e &&
			e.cause instanceof Error
		) {
			loggableException = e.cause;
		}

		logger.error(
			loggableException instanceof Error
				? loggableException.message
				: loggableException
		);
		if (loggableException instanceof Error) {
			logger.debug(loggableException.stack);
		}

		if (
			!(loggableException instanceof UserError) &&
			!(loggableException instanceof ContainersUserError)
		) {
			await logPossibleBugMessage();
		}
	}

	if (
		// Only report the error if we didn't just handle it
		mayReport &&
		// ...and it's not a user error
		!(loggableException instanceof UserError) &&
		!(loggableException instanceof ContainersUserError) &&
		// ...and it's not an un-reportable API error
		!(loggableException instanceof APIError && !loggableException.reportable)
	) {
		await captureGlobalException(loggableException);
	}
}

/**
 * Is this a Containers/Cloudchamber-based auth error?
 *
 * Containers uses custom OpenAPI-based generated client that throws an error that has a different structure to standard cfetch auth errors.
 */
function isContainersAuthenticationError(e: unknown): e is UserError {
	return (
		e instanceof UserError &&
		e.cause instanceof ApiError &&
		e.cause.status === 403
	);
}
