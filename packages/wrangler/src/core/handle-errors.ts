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
 * Handles an error thrown during command execution.
 *
 * This can involve filtering, transforming and logging the error appropriately.
 */
export async function handleError(
	e: unknown,
	args: ReadConfigCommandArgs,
	subCommandParts: string[]
) {
	let mayReport = true;
	let errorType: string | undefined;
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

	if (e instanceof CommandLineArgsError) {
		logger.error(e.message);
		// We are not able to ask the `wrangler` CLI parser to show help for a subcommand programmatically.
		// The workaround is to re-run the parsing with an additional `--help` flag, which will result in the correct help message being displayed.
		// The `wrangler` object is "frozen"; we cannot reuse that with different args, so we must create a new CLI parser to generate the help message.
		const { wrangler } = createCLIParser([...subCommandParts, "--help"]);
		await wrangler.parse();
	} else if (
		isAuthenticationError(e) ||
		// Is this a Containers/Cloudchamber-based auth error?
		// This is different because it uses a custom OpenAPI-based generated client
		(e instanceof UserError &&
			e.cause instanceof ApiError &&
			e.cause.status === 403)
	) {
		mayReport = false;
		errorType = "AuthenticationError";
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
		let complianceConfig: ComplianceConfig;
		try {
			complianceConfig = await readConfig(args, {
				hideWarnings: true,
			});
		} catch {
			complianceConfig = COMPLIANCE_REGION_CONFIG_UNKNOWN;
		}
		await whoami(complianceConfig, accountTag);
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
		errorType = "BuildFailure";

		logBuildFailure(e.errors, e.warnings);
	} else if (isBuildFailureFromCause(e)) {
		mayReport = false;
		errorType = "BuildFailure";
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

	return errorType;
}
