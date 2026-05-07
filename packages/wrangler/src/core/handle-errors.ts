import assert from "node:assert";
import { ApiError } from "@cloudflare/containers-shared";
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
import { MiniflareError } from "miniflare";
import dedent from "ts-dedent";
import { createCLIParser } from "..";
import { renderError } from "../cfetch";
import { readConfig } from "../config";
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
 * Check if an error has a Node.js error code matching one of the given codes,
 * looking at both the error and its immediate cause.
 */
function hasErrorCode(e: unknown, codes: ReadonlySet<string>): boolean {
	return (
		visitErrorOrCause(e, (err) => {
			if (
				err !== null &&
				typeof err === "object" &&
				"code" in err &&
				typeof (err as { code: unknown }).code === "string" &&
				codes.has((err as { code: string }).code)
			) {
				return true;
			}
			return undefined;
		}) === true
	);
}

/**
 * Check if a UserError-like object exists anywhere in the error chain.
 * This duck-types the check so that `UserError` instances thrown from
 * a different bundle (e.g. miniflare's bundled `@cloudflare/workers-utils`)
 * are still recognised — `instanceof` fails across bundle boundaries because
 * each bundle has its own copy of the class.
 *
 * We also recognise `MiniflareError.isUserError() === true`
 */
function isUserErrorLike(e: unknown): boolean {
	return (
		visitErrorOrCause(e, (err) => {
			if (err instanceof UserError) {
				return true;
			}
			if (
				err instanceof Error &&
				err.constructor?.name === "UserError" &&
				"telemetryMessage" in err
			) {
				return true;
			}
			if (err instanceof MiniflareError && err.isUserError()) {
				return true;
			}
			return undefined;
		}) === true
	);
}

/**
 * SSL/TLS certificate error messages that indicate a corporate proxy or VPN
 * may be intercepting HTTPS traffic with a custom root certificate.
 */
const SSL_CERT_ERROR_PATTERNS = [
	"self-signed certificate in certificate chain",
	"unable to verify the first certificate",
	"unable to get local issuer certificate",
	"does not match certificate's altnames",
	"SSL routines:",
];

/**
 * Check if an error (or its cause) is related to SSL/TLS certificate validation,
 * which commonly occurs when a corporate proxy or VPN intercepts HTTPS traffic.
 */
function isCertificateError(e: unknown): boolean {
	return (
		visitErrorOrCause(e, (err) => {
			const message = err instanceof Error ? err.message : String(err);
			if (SSL_CERT_ERROR_PATTERNS.some((m) => message.includes(m))) {
				return true;
			}
			return undefined;
		}) === true
	);
}

const PERMISSION_ERROR_CODES = new Set(["EPERM", "EACCES"]);

/**
 * Permission errors (EPERM, EACCES) are caused by file system
 * permissions that users need to fix outside of their code, so we present
 * a helpful message instead of reporting to Sentry.
 *
 * @param e - The error to check
 * @returns `true` if the error is a permission error, `false` otherwise
 */
function isPermissionError(e: unknown): boolean {
	return hasErrorCode(e, PERMISSION_ERROR_CODES);
}

function isFileNotFoundError(e: unknown): boolean {
	return hasErrorCode(e, new Set(["ENOENT"]));
}

/**
 * Visit an error and its immediate `cause` (one level only).
 */
function visitErrorOrCause<T>(
	e: unknown,
	visit: (e: unknown) => T | undefined
): T | undefined {
	const direct = visit(e);
	if (direct) {
		return direct;
	}
	if (e instanceof Error && e.cause !== undefined) {
		return visit(e.cause);
	}
	return undefined;
}

/**
 * Filesystem environmental errors (disk full, FD limit, system limits, file locks,
 * read-only mounts, etc.) are not Wrangler bugs — they are properties of the
 * user's environment that Wrangler can't fix.
 *
 * Unlike EPERM/EACCES (which are also handled separately above to log a more
 * specific message), we only need to suppress these from Sentry.
 */
const FILESYSTEM_ENV_ERROR_CODES = new Set([
	"EBUSY", // resource busy or locked (Windows file lock, AV scan)
	"EISDIR", // illegal operation on a directory
	"ENOTDIR", // path component is not a directory
	"EEXIST", // file already exists
	"ENOSPC", // no space left on device
	"EMFILE", // too many open files (process FD limit)
	"ENFILE", // too many open files in system
	"ENAMETOOLONG", // name too long (Windows MAX_PATH, ext4 limits)
	"EROFS", // read-only file system
	"ELOOP", // too many symbolic links encountered
	"ENXIO", // no such device or address
	"EBADF", // bad file descriptor
	"EINVAL", // invalid argument (often from `stat` on weird Windows reparse points)
	"EFBIG", // file too large
]);
function isFileSystemEnvError(e: unknown): boolean {
	return hasErrorCode(e, FILESYSTEM_ENV_ERROR_CODES);
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
	return (
		visitErrorOrCause(e, (err) => {
			if (hasErrorCode(err, new Set(["ENOTFOUND"]))) {
				const message = err instanceof Error ? err.message : String(err);
				if (isCloudflareAPI(message)) {
					return true;
				}
				if (
					err &&
					typeof err === "object" &&
					"hostname" in err &&
					typeof (err as { hostname?: unknown }).hostname === "string" &&
					isCloudflareAPI((err as { hostname: string }).hostname)
				) {
					return true;
				}
			}

			return undefined;
		}) === true
	);
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
	const hasTimeoutNode =
		visitErrorOrCause(e, (err) => {
			if (
				err !== null &&
				typeof err === "object" &&
				"code" in err &&
				(err as { code?: unknown }).code === "UND_ERR_CONNECT_TIMEOUT"
			) {
				return true;
			}
			if (
				err instanceof Error &&
				err.constructor?.name === "ConnectTimeoutError"
			) {
				return true;
			}
			return undefined;
		}) === true;

	if (!hasTimeoutNode) {
		return false;
	}

	// The Cloudflare URL may live on any node in the chain — the leaf error
	// (`ConnectTimeoutError`) often does not include the URL, while a parent
	// wrapper (e.g., cfetch) does.
	return (
		visitErrorOrCause(e, (err) => {
			const message = err instanceof Error ? err.message : String(err);
			if (isCloudflareAPI(message)) {
				return true;
			}
			if (
				err !== null &&
				typeof err === "object" &&
				"hostname" in err &&
				typeof (err as { hostname?: unknown }).hostname === "string" &&
				isCloudflareAPI((err as { hostname: string }).hostname)
			) {
				return true;
			}
			return undefined;
		}) === true
	);
}

/**
 * Transient network errors that have no actionable Wrangler bug.
 *
 * These are environmental issues (network glitches, server-side resets,
 * proxy/VPN handshake failures, captive portals) that should be filtered
 * from Sentry but reported to the user with a helpful message.
 *
 * Distinct from {@link isBenignWriteError}, which covers writes to peer-
 * closed sockets/pipes (EPIPE/EOF/ECONNRESET-on-write).
 */
const TRANSIENT_NETWORK_ERROR_CODES = new Set([
	"ECONNRESET",
	"ECONNREFUSED",
	"EAI_AGAIN", // DNS temporary failure (different from ENOTFOUND)
	"ETIMEDOUT", // OS-level connect timeout
	"EHOSTUNREACH",
	"ENETUNREACH",
	"EAI_FAIL",
	"UND_ERR_SOCKET", // undici "other side closed"
	"UND_ERR_CLOSED",
	"UND_ERR_BODY_TIMEOUT",
	"UND_ERR_HEADERS_TIMEOUT",
	// Note: UND_ERR_CONNECT_TIMEOUT is intentionally absent — that case is
	// handled separately by `isCloudflareAPIConnectionTimeoutError` for
	// Cloudflare-API URLs (the user gets a more specific message), and is
	// otherwise allowed through (timeouts to the user's own endpoints can
	// indicate real bugs).
]);
const TRANSIENT_NETWORK_ERROR_CLASSES = new Set([
	"ConnectTimeoutError",
	"SocketError",
	"BodyTimeoutError",
	"HeadersTimeoutError",
]);
const TRANSIENT_NETWORK_ERROR_MESSAGE_PATTERNS = [
	"Client network socket disconnected before secure TLS connection was established",
	"other side closed",
];
function isTransientNetworkError(e: unknown): boolean {
	return (
		visitErrorOrCause(e, (err) => {
			if (err === null || typeof err !== "object") {
				return undefined;
			}
			if (
				"code" in err &&
				typeof (err as { code: unknown }).code === "string" &&
				TRANSIENT_NETWORK_ERROR_CODES.has((err as { code: string }).code)
			) {
				return true;
			}
			if (
				err instanceof Error &&
				err.constructor?.name &&
				TRANSIENT_NETWORK_ERROR_CLASSES.has(err.constructor.name)
			) {
				return true;
			}
			if (err instanceof Error) {
				const message = err.message;
				if (
					TRANSIENT_NETWORK_ERROR_MESSAGE_PATTERNS.some((m) =>
						message.includes(m)
					)
				) {
					return true;
				}
			}
			return undefined;
		}) === true
	);
}

/**
 * Writes to a closed pipe or socket (EPIPE / EOF / ECONNRESET-on-write)
 * happen when the peer closes a stream while we still have writes in
 * flight. Common causes: workerd dying with a separate (real) error and
 * us trying to flush stderr to it, the user `Ctrl+C`-ing the terminal
 * while wrangler streams to stdout, the user doing `wrangler tail | head`.
 *
 * These are never Wrangler bugs — the pipe/socket close already happened
 * for some other reason and the underlying error (if any) will surface
 * separately.
 */
const BENIGN_WRITE_ERROR_CODES = new Set([
	"EPIPE",
	"EOF",
	"ERR_STREAM_WRITE_AFTER_END",
	"ERR_STREAM_DESTROYED",
]);
function isBenignWriteError(e: unknown): boolean {
	return (
		visitErrorOrCause(e, (err) => {
			if (err === null || typeof err !== "object") {
				return undefined;
			}
			const code = "code" in err ? (err as { code: unknown }).code : undefined;
			if (typeof code === "string" && BENIGN_WRITE_ERROR_CODES.has(code)) {
				return true;
			}
			// `read ECONNRESET` is a transient network error; only `write ECONNRESET`
			// (peer closed during our send) is benign-write.
			if (
				typeof code === "string" &&
				code === "ECONNRESET" &&
				"syscall" in err &&
				(err as { syscall: unknown }).syscall === "write"
			) {
				return true;
			}
			return undefined;
		}) === true
	);
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
	return (
		visitErrorOrCause(e, (err) => {
			if (err instanceof TypeError && err.message.includes("fetch failed")) {
				return true;
			}
			return undefined;
		}) === true
	);
}

/**
 * Is this a Containers/Cloudchamber-based auth error?
 *
 * Containers uses custom OpenAPI-based generated client that throws an error
 * with a different structure to standard cfetch auth errors. We accept either
 * a 401 or 403 because both indicate the user's credentials are insufficient.
 */
function isContainersAuthenticationError(e: unknown): e is UserError {
	return (
		visitErrorOrCause(e, (err) => {
			if (
				err instanceof ApiError &&
				(err.status === 401 || err.status === 403)
			) {
				return true;
			}
			return undefined;
		}) === true
	);
}

/**
 * @returns whether `e` is a standard Cloudflare API authentication error.
 *
 * The legacy fingerprint is `ParseError` + `code === 10000`, but the auth
 * stack returns several different envelope codes (10000, 9109, 10001, ...)
 * with the same "Authentication error" semantic. Accept any 401/403 from
 * a `ParseError` or `APIError`, plus the historical code-10000 case for
 * non-status errors.
 */
export function isAuthenticationError(e: unknown): e is ParseError {
	return (
		visitErrorOrCause(e, (err) => {
			if (err instanceof ParseError) {
				if ((err as { code?: number }).code === 10000) {
					return true;
				}
				const status = (err as { status?: number }).status;
				if (status === 401 || status === 403) {
					return true;
				}
			}
			if (err instanceof APIError) {
				const status = (err as { status?: number }).status;
				if (status === 401 || status === 403) {
					return true;
				}
			}
			return undefined;
		}) === true
	);
}

/**
 * Determines the error type for telemetry purposes, or `undefined` if it cannot be determined.
 *
 * Order matters: more specific predicates run before more generic ones so that
 * (e.g.) a Cloudflare-API connection timeout is reported as `ConnectionTimeout`
 * rather than the generic `TransientNetworkError`.
 */
export function getErrorType(e: unknown): string | undefined {
	if (isCloudflareAPIDNSError(e)) {
		return "DNSError";
	}
	if (isCloudflareAPIConnectionTimeoutError(e)) {
		return "ConnectionTimeout";
	}
	if (isPermissionError(e)) {
		return "PermissionError";
	}
	if (isFileNotFoundError(e)) {
		return "FileNotFoundError";
	}
	if (isFileSystemEnvError(e)) {
		return "FileSystemEnvError";
	}
	if (isBenignWriteError(e)) {
		return "BenignWriteError";
	}
	if (isCertificateError(e)) {
		return "CertificateError";
	}
	if (isTransientNetworkError(e)) {
		return "TransientNetworkError";
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

	// Unwrap StartDevEnv error envelopes early so all downstream predicates see
	// the underlying user-recognisable error.
	if (
		e &&
		typeof e === "object" &&
		"type" in e &&
		(e as { type?: unknown }).type === "error" &&
		"cause" in e &&
		(e as { cause?: unknown }).cause instanceof Error
	) {
		loggableException = (e as { cause: Error }).cause;
	}

	// Log a helpful warning for SSL certificate errors caused by corporate proxies/VPNs
	if (isCertificateError(e)) {
		mayReport = false;
		logger.warn(
			"Wrangler detected that a corporate proxy or VPN might be enabled on your machine, " +
				"resulting in API calls failing due to a certificate mismatch. " +
				"It is likely that you need to install the missing system roots provided by your corporate proxy vendor."
		);
	}

	// Filter benign write-side stream errors (EPIPE/EOF/ECONNRESET-on-write).
	// These are never Wrangler bugs — the underlying cause has already
	// produced its own error somewhere else.
	if (isBenignWriteError(e)) {
		mayReport = false;
		logger.debug(`Benign write error: ${e}`);
	}

	// Filter unactionable filesystem environment errors
	// (EBUSY, EISDIR, ENOTDIR, EEXIST, ENOSPC, EMFILE, ENAMETOOLONG, EROFS, ELOOP, ...)
	if (isFileSystemEnvError(e)) {
		mayReport = false;
		const message = e instanceof Error ? e.message : String(e);
		logger.error(dedent`
			A filesystem error occurred.

			${message}

			This is typically caused by your environment (disk full, file locked
			by another process, system limits reached, read-only mount, etc.) and
			is not a Wrangler bug.
		`);
		return;
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

	// Filter transient network errors (ECONNRESET, ETIMEDOUT, EAI_AGAIN,
	// SocketError "other side closed", TLS pre-handshake disconnects).
	// Runs after `isCloudflareAPIConnectionTimeoutError` so that connection
	// timeouts to Cloudflare's API get the more specific message.
	if (isTransientNetworkError(e)) {
		mayReport = false;
		logger.error(dedent`
			A network request failed due to a transient connectivity issue.

			Common causes:
			  - Intermittent internet connection
			  - Captive portal / corporate proxy interfering with TLS
			  - Server-side connection reset

			Please check your network connection and try again.
		`);
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

		const nonFlagArgs = subCommandParts.filter(
			(arg) => !arg.startsWith("-") && arg !== ""
		);

		const isUnknownArgOrCommand =
			e.message.includes("Unknown argument") ||
			e.message.includes("Unknown command");

		const unknownArgsMatch = e.message.match(
			/Unknown (?:arguments?|command): (.+)/
		);
		const unknownArgs = unknownArgsMatch
			? unknownArgsMatch[1].split(",").map((a) => a.trim())
			: [];

		// Check if any of the unknown args match the first non-flag argument
		// If so, it's an unknown command (not an unknown flag on a valid command)
		// Note: we check !arg.startsWith("-") to exclude flag-like args,
		// but command names can contain dashes (e.g., "dispatch-namespace")
		const isUnknownCommand = unknownArgs.some(
			(arg) => arg === nonFlagArgs[0] && !arg.startsWith("-")
		);

		const isRootLevelError = isUnknownArgOrCommand && isUnknownCommand;

		const { wrangler, showHelpWithCategories } = createCLIParser([
			...(isRootLevelError ? [] : nonFlagArgs),
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
			status: e.status,
			telemetryMessage: false,
		});
		// 4xx responses are user errors (bad credentials, missing perms, wrong
		// resource id, malformed input). Don't report to Sentry.
		if (typeof e.status === "number" && e.status >= 400 && e.status < 500) {
			error.preventReport();
		}
		error.notes.push({
			text: "\nIf you think this is a bug, please open an issue at: https://github.com/cloudflare/workers-sdk/issues/new/choose",
		});
		logger.error(error);
	} else {
		logger.error(
			loggableException instanceof Error
				? loggableException.message
				: loggableException
		);
		if (loggableException instanceof Error) {
			logger.debug(loggableException.stack);
		}

		if (!isUserErrorLike(loggableException)) {
			await logPossibleBugMessage();
		}
	}

	if (
		// Only report the error if we didn't just handle it
		mayReport &&
		// ...and it's not a user error (UserError, cross-bundle UserError, or
		// MiniflareError.isUserError())
		!isUserErrorLike(loggableException) &&
		// ...and it's not an un-reportable API error
		!(loggableException instanceof APIError && !loggableException.reportable)
	) {
		await captureGlobalException(loggableException);
	}
}
