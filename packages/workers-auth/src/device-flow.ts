import { UserError } from "@cloudflare/workers-utils";
import dedent from "ts-dedent";
import { fetch } from "undici";
import { domainUsesAccess, getCloudflareAccessHeaders } from "./access";
import { getAuthDomainFromEnv, getDeviceAuthUrl } from "./env-vars";
import { toErrorClass } from "./errors";
import {
	assertTrustedVerificationUrl,
	generateVerificationUrl,
} from "./generate-device-auth-url";
import { fetchAuthToken } from "./token-exchange";
import type { OAuthFlowContext } from "./context";
import type { AccessContext } from "./token-exchange";
import type { Response } from "undici";

/**
 * Maximum time (in seconds) the CLI polls the token endpoint while waiting for
 * the user to approve a device authorization request.
 *
 * RFC 8628 §3.2 lets the server set `expires_in`, but we apply our own
 * hard cap on top of that to:
 *   - keep login feeling fast and finite to the user, and
 *   - shorten the window in which a leaked user code could be abused
 *     (RFC 8628 §5.4 — remote phishing).
 */
const DEVICE_FLOW_MAX_DURATION_SECONDS = 300;

/**
 * Minimum polling interval (in seconds) used between token requests when the
 * authorization server does not provide one or sends a value below this floor.
 * The server's `interval` is always respected when it is larger than this
 * value.
 *
 * RFC 8628 §3.5 mandates a default of 5 seconds when the server omits
 * `interval`. We deviate to 1 second because:
 *   - the server can still throttle us via the `slow_down` error code
 *     (which adds 5 seconds per RFC 8628 §3.5), and
 *   - a 5 second baseline feels unacceptably slow for an interactive CLI
 *     login on a developer's primary workstation.
 *
 * If the server explicitly returns a value (e.g. `interval: 5`), that value
 * is honoured rather than this floor.
 */
const DEVICE_FLOW_MIN_POLL_INTERVAL_SECONDS = 1;

/** Per-login options for {@link getOauthTokenViaDeviceFlow}. */
export interface GetOauthTokenViaDeviceFlowOptions {
	browser: boolean;
	scopes: string[];
	clientId: string;
}

interface DeviceAuthorizationResponse {
	device_code: string;
	user_code: string;
	verification_uri: string;
	verification_uri_complete?: string;
	expires_in: number;
	interval?: number;
}

interface DeviceTokenGrant {
	access_token: string;
	expires_in: number;
	refresh_token?: string;
	scope?: string;
}

/**
 * The outcome of a single poll, classified so the loop never has to guess.
 *
 * `unexpected` exists because neither the HTTP status nor the body shape can be
 * trusted: an intermediary (corporate proxy, WAF) or a Cloudflare API envelope
 * (`{"success": false, "errors": [...]}`) can arrive in place of the RFC 8628
 * response. Those bodies carry no `error` code, so without this case they would
 * fall through to the success path and be read as a token grant.
 */
type DevicePollResult =
	| { kind: "token"; grant: DeviceTokenGrant }
	| { kind: "oauth-error"; error: string }
	| { kind: "unexpected"; detail: string; retryable: boolean };

/**
 * Read a non-empty string member from a parsed JSON body. Anything else
 * (missing, wrong type, empty) is reported as absent so callers can treat the
 * response as unusable rather than trusting `undefined` into a template.
 */
function getStringMember(body: unknown, key: string): string | undefined {
	if (typeof body !== "object" || body === null) {
		return undefined;
	}
	const value = (body as Record<string, unknown>)[key];
	return typeof value === "string" && value !== "" ? value : undefined;
}

/**
 * Read a positive, finite number member from a parsed JSON body. Guards the
 * arithmetic that turns `expires_in` into a timestamp — `undefined * 1000` is
 * `NaN`, and `new Date(NaN).toISOString()` throws a `RangeError`.
 */
function getPositiveNumberMember(
	body: unknown,
	key: string
): number | undefined {
	if (typeof body !== "object" || body === null) {
		return undefined;
	}
	const value = (body as Record<string, unknown>)[key];
	return typeof value === "number" && Number.isFinite(value) && value > 0
		? value
		: undefined;
}

/**
 * A short, user-safe summary of a response we could not interpret: the status
 * line, plus the standard OAuth `error_description` when the server sent one.
 * The full body is logged at `debug` by the caller.
 */
function describeUnusableResponse(response: Response, body: unknown): string {
	const status = `HTTP ${response.status} ${response.statusText}`.trim();
	const description = getStringMember(body, "error_description");
	return description ? `${status}: ${description}` : status;
}

/**
 * Whether a status that carried no usable OAuth payload is worth another poll.
 * 5xx and 429 are the conventional "try again" signals; any other 4xx means the
 * request itself was rejected, so repeating it until the deadline would only
 * delay the error the user needs to see.
 */
function isRetryableStatus(status: number): boolean {
	return status >= 500 || status === 429;
}

/**
 * Narrow a parsed device-authorization body to the members the flow relies on.
 *
 * Optional members are dropped unless correctly typed, so a bogus `interval`
 * falls back to our floor and a bogus `verification_uri_complete` falls back to
 * the URL we build ourselves.
 */
function asDeviceAuthorizationResponse(
	body: unknown
): DeviceAuthorizationResponse | undefined {
	const deviceCode = getStringMember(body, "device_code");
	const userCode = getStringMember(body, "user_code");
	const verificationUri = getStringMember(body, "verification_uri");
	const expiresIn = getPositiveNumberMember(body, "expires_in");

	if (!deviceCode || !userCode || !verificationUri || expiresIn === undefined) {
		return undefined;
	}

	return {
		device_code: deviceCode,
		user_code: userCode,
		verification_uri: verificationUri,
		verification_uri_complete: getStringMember(
			body,
			"verification_uri_complete"
		),
		expires_in: expiresIn,
		interval: getPositiveNumberMember(body, "interval"),
	};
}

/**
 * Parse a JSON body from an `undici` response. Device-flow endpoints are
 * expected to respond with JSON (both on success and on the RFC 8628 §3.5
 * error codes), so a parse failure is thrown.
 */
async function readJson(
	response: Response,
	logger: OAuthFlowContext["logger"]
): Promise<unknown> {
	const text = await response.text();
	try {
		return JSON.parse(text);
	} catch (e) {
		// Sometimes we get a response where the body is HTML rather than JSON.
		if (text.match(/<!DOCTYPE html>/)) {
			logger.debug(
				"The body of the response was HTML rather than JSON. Check the debug logs to see the full body of the response."
			);
			if (text.match(/challenge-platform/)) {
				logger.debug(
					`It looks like you might have hit a bot challenge page. This may be transient but if not, please contact Cloudflare to find out what can be done. When you contact Cloudflare, please provide your Ray ID: ${response.headers.get(
						"cf-ray"
					)}`
				);
			}
		}
		logger.debug("Full body of response\n\n", text);
		throw new Error(
			`Invalid JSON in response: status: ${response.status} ${response.statusText}`,
			{ cause: e }
		);
	}
}

/**
 * Build the headers for a request to the OAuth provider's device-authorization
 * endpoint. Mirrors `fetchAuthToken` in `token-exchange.ts`: when the auth
 * domain is behind Cloudflare Access (typically staging), the request needs
 * Access service-token / cookie headers.
 */
async function buildDeviceAuthHeaders(
	logger: OAuthFlowContext["logger"],
	isNonInteractiveOrCI: OAuthFlowContext["isNonInteractiveOrCI"]
): Promise<Record<string, string>> {
	const headers: Record<string, string> = {
		"Content-Type": "application/x-www-form-urlencoded",
	};
	if (await domainUsesAccess(getAuthDomainFromEnv(), logger)) {
		logger.debug(
			"Using Cloudflare Access to get an access token for the device authorization request"
		);
		Object.assign(
			headers,
			await getCloudflareAccessHeaders({ logger, isNonInteractiveOrCI })
		);
	}
	return headers;
}

/**
 * Request a `device_code` and `user_code` from the authorization server's
 * device authorization endpoint (RFC 8628 §3.1, §3.2).
 */
async function requestDeviceAuthorization(
	scopes: string[],
	clientId: string,
	logger: OAuthFlowContext["logger"],
	isNonInteractiveOrCI: OAuthFlowContext["isNonInteractiveOrCI"]
): Promise<DeviceAuthorizationResponse> {
	// `offline_access` is appended unconditionally so the eventual token
	// response includes a refresh token, matching the behaviour of the
	// authorization-code flow (see generate-auth-url.ts).
	const params = new URLSearchParams({
		client_id: clientId,
		scope: [...scopes, "offline_access"].join(" "),
	});

	const headers = await buildDeviceAuthHeaders(logger, isNonInteractiveOrCI);
	const deviceAuthUrl = getDeviceAuthUrl();
	logger.debug("Fetching device authorization from", deviceAuthUrl);
	const response = await fetch(deviceAuthUrl, {
		method: "POST",
		body: params.toString(),
		headers,
	});

	if (!response.ok) {
		const body = await readJson(response, logger).catch(() => undefined);
		const rawError =
			body && typeof body === "object" && "error" in body
				? String((body as { error: unknown }).error)
				: `HTTP ${response.status} ${response.statusText}`;
		throw toErrorClass(rawError);
	}

	const body = await readJson(response, logger);
	const deviceAuth = asDeviceAuthorizationResponse(body);
	if (deviceAuth === undefined) {
		// Without this the missing members flow onwards as `undefined`: a bogus
		// `expires_in` makes the poll deadline `NaN`, which skips the loop
		// entirely and reports a timeout "after NaN minutes".
		logger.debug("Unusable device authorization response body:", body);
		throw new UserError(
			`The device authorization endpoint returned a response that could not be interpreted (${describeUnusableResponse(response, body)}).\n` +
				"Enable debug logging to see the full response.",
			{
				telemetryMessage:
					"user device-flow unusable device authorization response",
			}
		);
	}
	return deviceAuth;
}

/**
 * Send a single poll request to the token endpoint with grant type
 * `urn:ietf:params:oauth:grant-type:device_code` (RFC 8628 §3.4) and classify
 * the reply into a {@link DevicePollResult}. The caller decides what each
 * classification means for the loop; nothing here is assumed to be a token.
 *
 * The `error` member is authoritative over the HTTP status, because RFC 8628
 * §3.5 delivers `authorization_pending` / `slow_down` as an `error` with HTTP
 * 400 on every poll while the user is still approving.
 *
 * Reuses `fetchAuthToken`, which logs non-2xx responses at `debug` level only.
 * That matters here for the same reason: those 400s are expected, non-terminal
 * states, not errors, so they must not produce user-visible error logging.
 *
 * This can reject if the network request fails or the body is not valid JSON
 * (e.g. a transient HTML 5xx or bot-challenge page from the Cloudflare edge).
 * The polling loop catches those rejections and treats them as transient, so a
 * single bad poll does not abort the whole login.
 */
async function pollDeviceToken(
	deviceCode: string,
	clientId: string,
	logger: OAuthFlowContext["logger"],
	isNonInteractiveOrCI: OAuthFlowContext["isNonInteractiveOrCI"]
): Promise<DevicePollResult> {
	const params = new URLSearchParams({
		grant_type: "urn:ietf:params:oauth:grant-type:device_code",
		device_code: deviceCode,
		client_id: clientId,
	});

	const response = await fetchAuthToken(params, logger, isNonInteractiveOrCI);
	const body = await readJson(response, logger);

	const error = getStringMember(body, "error");
	if (error !== undefined) {
		return { kind: "oauth-error", error };
	}

	const accessToken = getStringMember(body, "access_token");
	const expiresIn = getPositiveNumberMember(body, "expires_in");
	if (!response.ok || accessToken === undefined || expiresIn === undefined) {
		logger.debug("Unusable token response body:", body);
		return {
			kind: "unexpected",
			detail: describeUnusableResponse(response, body),
			// A 2xx that carries no usable grant is not going to become one on the
			// next attempt, so only the retryable statuses keep the loop alive.
			retryable: !response.ok && isRetryableStatus(response.status),
		};
	}

	return {
		kind: "token",
		grant: {
			access_token: accessToken,
			expires_in: expiresIn,
			refresh_token: getStringMember(body, "refresh_token"),
			scope: getStringMember(body, "scope"),
		},
	};
}

/**
 * Wait `seconds` seconds, then resolve. Extracted so tests can mock it
 * via vi.useFakeTimers().
 */
function sleep(seconds: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

/**
 * Acquire an access token via the OAuth 2.0 Device Authorization Grant
 * (RFC 8628).
 *
 * High-level flow:
 *   1. POST to the device authorization endpoint to get `device_code`,
 *      `user_code`, and a verification URL.
 *   2. Display the verification URL and the user code to the user. Attempt
 *      to open the URL in the default browser.
 *   3. Poll the token endpoint with `grant_type=device_code` until the user
 *      approves the request, denies it, or the device code expires. The
 *      first poll is sent immediately to minimise perceived latency for
 *      users who approve quickly.
 *
 * The polling loop applies a hard cap
 * ({@link DEVICE_FLOW_MAX_DURATION_SECONDS}) on top of the server-provided
 * `expires_in` to limit any leaked-code abuse window. Whichever expires
 * first wins.
 *
 * Every consumer-specific string the flow prints (the CLI's branded name and
 * the command that restarts the flow) comes from the injected context, so this
 * module stays CLI-agnostic.
 */
export async function getOauthTokenViaDeviceFlow(
	options: GetOauthTokenViaDeviceFlowOptions,
	ctx: OAuthFlowContext
): Promise<AccessContext> {
	const { logger, openInBrowser, isNonInteractiveOrCI } = ctx;

	const deviceAuth = await requestDeviceAuthorization(
		options.scopes,
		options.clientId,
		logger,
		isNonInteractiveOrCI
	);

	// The verification URLs are chosen by the server, and we both print them and
	// hand one to the OS browser opener. Prove they belong to the auth domain we
	// asked for the device code *before* anything is displayed or opened —
	// see `assertTrustedVerificationUrl` for the threat this closes.
	const authDomain = getAuthDomainFromEnv();
	assertTrustedVerificationUrl(deviceAuth.verification_uri, {
		field: "verification_uri",
		authDomain,
	});
	if (deviceAuth.verification_uri_complete !== undefined) {
		assertTrustedVerificationUrl(deviceAuth.verification_uri_complete, {
			field: "verification_uri_complete",
			authDomain,
		});
	}

	// Prefer the server-provided verification_uri_complete (RFC 8628 §3.3.1).
	// Otherwise synthesise one ourselves so the browser we open pre-fills the
	// user_code. Appending a query param cannot change the origin, so the
	// fallback inherits the check above.
	const verificationUrl =
		deviceAuth.verification_uri_complete ??
		generateVerificationUrl({
			verificationUri: deviceAuth.verification_uri,
			userCode: deviceAuth.user_code,
		});

	// Effective overall timeout is the smaller of the server's expires_in and
	// our hard cap. Computed before display so the message below quotes the
	// real deadline rather than always advertising the hard cap.
	const maxDurationSeconds = Math.min(
		deviceAuth.expires_in,
		DEVICE_FLOW_MAX_DURATION_SECONDS
	);

	// Always show the bare verification URI and the user code, even when we
	// have a complete URL. RFC 8628 §3.3.1: "Clients MUST still display
	// the user_code, as the authorization server will require the user to
	// confirm it to disambiguate devices or as remote phishing mitigation".
	logger.log(
		dedent`
		To authorize ${ctx.displayName}, please visit:

		  ${deviceAuth.verification_uri}

		and enter the code:

		  ${deviceAuth.user_code}

		You have ${toHumanPeriod(maxDurationSeconds)} to approve this request.
	`
	);

	if (options.browser) {
		logger.log(`\nOpening a link in your default browser: ${verificationUrl}`);
		await openInBrowser(verificationUrl);
	}

	const deadline = Date.now() + maxDurationSeconds * 1000;

	// Start with the server-provided interval, but floor it so we don't sit
	// idle for 5+ seconds between polls if the user approves quickly.
	let intervalSeconds = Math.max(
		deviceAuth.interval ?? DEVICE_FLOW_MIN_POLL_INTERVAL_SECONDS,
		DEVICE_FLOW_MIN_POLL_INTERVAL_SECONDS
	);

	// Send the first poll immediately rather than waiting `interval` seconds.
	// In the common case the user approves quickly, so the perceived login
	// latency drops from 1-5s to ~the network RTT.
	let firstPoll = true;

	// Set whenever a poll produces nothing we can interpret, cleared as soon as
	// one does. If it survives to the end of the loop, the run ended on failed
	// polls rather than on a user who never approved — reporting a timeout in
	// that case would send the user looking in the wrong place.
	let lastPollFailure: string | undefined;

	while (Date.now() < deadline) {
		if (!firstPoll) {
			await sleep(intervalSeconds);
		}
		firstPoll = false;

		let result: DevicePollResult;
		try {
			result = await pollDeviceToken(
				deviceAuth.device_code,
				options.clientId,
				logger,
				isNonInteractiveOrCI
			);
		} catch (e) {
			// A single poll can fail transiently: a network blip, or the
			// Cloudflare edge returning a non-JSON body (an HTML 5xx or a
			// bot-challenge page) instead of the expected RFC 8628 response.
			// Because we poll repeatedly over several minutes, one bad poll
			// must not abort the whole login.
			logger.debug("Ignoring transient error while polling for token:", e);
			lastPollFailure = e instanceof Error ? e.message : String(e);
			continue;
		}

		if (result.kind === "unexpected") {
			if (!result.retryable) {
				throw new UserError(
					`The token endpoint returned a response that could not be interpreted (${result.detail}).\n` +
						"Enable debug logging to see the full response.",
					{ telemetryMessage: "user device-flow unusable token response" }
				);
			}
			logger.debug(
				"Ignoring transient response while polling for token:",
				result.detail
			);
			lastPollFailure = result.detail;
			continue;
		}

		// The server said something we understand, so any earlier transient
		// failure is no longer the story of this login.
		lastPollFailure = undefined;

		if (result.kind === "oauth-error") {
			switch (result.error) {
				case "authorization_pending":
					continue;
				case "slow_down":
					// RFC 8628 §3.5: increase the polling interval by 5 seconds
					// for this and all subsequent requests.
					intervalSeconds += 5;
					continue;
				case "access_denied":
					throw new UserError(
						`Consent denied. You must grant consent to ${ctx.displayName} in order to login.\n` +
							"If you don't want to do this consider passing an API token via the `CLOUDFLARE_API_TOKEN` environment variable.",
						{ telemetryMessage: "user device-flow consent denied" }
					);
				case "expired_token":
					throw new UserError(
						`Device code expired before the request was approved. Please run \`${ctx.deviceLoginCommand}\` again to obtain a new code.`,
						{ telemetryMessage: "user device-flow code expired" }
					);
				default:
					throw toErrorClass(result.error);
			}
		}

		// Success — we have an access token.
		const { grant } = result;
		const accessToken = {
			value: grant.access_token,
			expiry: new Date(Date.now() + grant.expires_in * 1000).toISOString(),
		};
		const scopes: string[] = grant.scope ? grant.scope.split(" ") : [];
		return {
			token: accessToken,
			scopes,
			refreshToken: grant.refresh_token
				? { value: grant.refresh_token }
				: undefined,
		};
	}

	if (lastPollFailure !== undefined) {
		throw new UserError(
			`Gave up waiting for device authorization: the token endpoint kept returning responses that could not be interpreted (last: ${lastPollFailure}).\n` +
				`Enable debug logging to see the full response, then run \`${ctx.deviceLoginCommand}\` to try again.`,
			{ telemetryMessage: "user device-flow poll failed" }
		);
	}

	throw new UserError(
		`Device authorization timed out after ${toHumanPeriod(maxDurationSeconds)}. Please run \`${ctx.deviceLoginCommand}\` again to obtain a new code.`,
		{ telemetryMessage: "user device-flow authorization timeout" }
	);
}

/**
 * Converts a duration in seconds to a human-readable string.
 * @param seconds - The duration in seconds.
 * @returns A human-readable string representing the duration.
 */
function toHumanPeriod(seconds: number): string {
	if (seconds < 60) {
		return `${seconds} seconds`;
	}
	const minutes = Math.floor(seconds / 60);
	const minutesPostfix = minutes === 1 ? "minute" : "minutes";
	const remainingSeconds = seconds % 60;
	const secondsPostfix = remainingSeconds === 1 ? "second" : "seconds";
	if (remainingSeconds === 0) {
		return `${minutes} ${minutesPostfix}`;
	}
	if (remainingSeconds == 59) {
		// Let's round "x mins and 59 seconds" up to "x+1 mins" for better readability.
		return `${minutes + 1} ${minutesPostfix}`;
	}
	return `${minutes} ${minutesPostfix} and ${remainingSeconds} ${secondsPostfix}`;
}
