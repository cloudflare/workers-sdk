/* Based heavily on code from https://github.com/BitySA/oauth2-auth-code-pkce
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { UserError } from "@cloudflare/workers-utils";
import encodeQR from "qr";
import dedent from "ts-dedent";
import { fetch } from "undici";
import { domainUsesAccess, getCloudflareAccessHeaders } from "./access";
import { getAuthDomainFromEnv, getDeviceAuthUrl } from "./env-vars";
import { toErrorClass } from "./errors";
import { generateVerificationUrl } from "./generate-device-auth-url";
import { fetchAuthToken } from "./token-exchange";
import type { OAuthFlowContext } from "./context";
import type { AccessContext } from "./token-exchange";
import type { Response } from "undici";

/**
 * Maximum time (in seconds) Wrangler will poll the token endpoint while
 * waiting for the user to approve a device authorization request.
 *
 * RFC 8628 §3.2 lets the server set `expires_in`, but we apply our own
 * hard cap on top of that to:
 *   - keep login feeling fast and finite to the user, and
 *   - shorten the window in which a leaked user code could be abused
 *     (RFC 8628 §5.4 — remote phishing).
 */
const DEVICE_FLOW_MAX_DURATION_SECONDS = 300;

/**
 * Minimum polling interval (in seconds) Wrangler will use between token
 * requests when the authorization server does not provide one or sends a
 * value below this floor. The server's `interval` is always respected when
 * it is larger than this value.
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

interface DeviceAuthorizationResponse {
	device_code: string;
	user_code: string;
	verification_uri: string;
	verification_uri_complete?: string;
	expires_in: number;
	interval?: number;
}

type DevicePollResponse =
	| {
			access_token: string;
			expires_in: number;
			refresh_token?: string;
			scope: string;
	  }
	| { error: string };

/**
 * Parse a JSON body from an `undici` response. Device-flow endpoints always
 * respond with JSON (both on success and on the RFC 8628 §3.5 error codes),
 * so a parse failure is treated as a hard error.
 */
async function readJson(response: Response): Promise<unknown> {
	const text = await response.text();
	try {
		return JSON.parse(text);
	} catch (e) {
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
		const body = await readJson(response).catch(() => undefined);
		const rawError =
			body && typeof body === "object" && "error" in body
				? String((body as { error: unknown }).error)
				: `HTTP ${response.status} ${response.statusText}`;
		throw toErrorClass(rawError);
	}

	return (await readJson(response)) as DeviceAuthorizationResponse;
}

/**
 * Send a single poll request to the token endpoint with grant type
 * `urn:ietf:params:oauth:grant-type:device_code` (RFC 8628 §3.4).
 *
 * Returns the parsed response. The caller is responsible for handling the
 * `authorization_pending` and `slow_down` error codes (continuing to poll)
 * vs the terminal error codes (aborting).
 *
 * Reuses `fetchAuthToken`, which logs non-2xx responses at `debug` level only.
 * This matters for the device flow because RFC 8628 §3.5 returns HTTP 400 with
 * `authorization_pending` / `slow_down` on every poll while the user is
 * approving — those are expected, non-terminal states, not errors, so they
 * must not produce user-visible error logging.
 */
async function pollDeviceToken(
	deviceCode: string,
	clientId: string,
	logger: OAuthFlowContext["logger"],
	isNonInteractiveOrCI: OAuthFlowContext["isNonInteractiveOrCI"]
): Promise<DevicePollResponse> {
	const params = new URLSearchParams({
		grant_type: "urn:ietf:params:oauth:grant-type:device_code",
		device_code: deviceCode,
		client_id: clientId,
	});

	const response = await fetchAuthToken(params, logger, isNonInteractiveOrCI);
	return (await readJson(response)) as DevicePollResponse;
}

/**
 * Default renderer for the device-flow verification QR code: a compact ASCII
 * QR of the verification URL.
 *
 * Consumers can override this via {@link OAuthFlowContext.renderDeviceQrCode}
 * (e.g. wrangler injects a shim its tests can mock for deterministic
 * snapshots).
 */
export const renderDeviceQrCode = (verificationUrl: string): string =>
	encodeQR(verificationUrl, "ascii", { border: 1 });

/**
 * Render a short ASCII QR code of the supplied URL to the terminal.
 *
 * Best-effort: any error encoding the QR is logged at debug level and
 * swallowed — we never want a missing/failed QR to prevent the user from
 * completing the login.
 */
function printVerificationQrCode(
	verificationUrl: string,
	logger: OAuthFlowContext["logger"],
	renderQrCode: (verificationUrl: string) => string
): void {
	try {
		logger.log(`\n${renderQrCode(verificationUrl)}`);
	} catch (e) {
		logger.debug(
			`Failed to render QR code: ${e instanceof Error ? e.message : String(e)}`
		);
	}
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
 *   2. Display the verification URL, the user code, and a QR code to the
 *      user. Attempt to open the URL in the default browser.
 *   3. Poll the token endpoint with `grant_type=device_code` until the user
 *      approves the request, denies it, or the device code expires. The
 *      first poll is sent immediately to minimise perceived latency for
 *      users who approve before we even finish rendering the QR.
 *
 * The polling loop applies a hard cap
 * ({@link DEVICE_FLOW_MAX_DURATION_SECONDS}) on top of the server-provided
 * `expires_in` to limit any leaked-code abuse window. Whichever expires
 * first wins.
 */
export async function getOauthTokenViaDeviceFlow(options: {
	browser: boolean;
	scopes: string[];
	clientId: string;
	logger: OAuthFlowContext["logger"];
	openInBrowser: OAuthFlowContext["openInBrowser"];
	isNonInteractiveOrCI: OAuthFlowContext["isNonInteractiveOrCI"];
	renderQrCode?: (verificationUrl: string) => string;
}): Promise<AccessContext> {
	const { logger, openInBrowser, isNonInteractiveOrCI } = options;
	const renderQrCode = options.renderQrCode ?? renderDeviceQrCode;

	const deviceAuth = await requestDeviceAuthorization(
		options.scopes,
		options.clientId,
		logger,
		isNonInteractiveOrCI
	);

	// Prefer the server-provided verification_uri_complete (RFC 8628 §3.3.1).
	// Otherwise synthesise one ourselves so QR-scanning users don't have to
	// type the user_code manually.
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
	// have a complete URL / QR. RFC 8628 §3.3.1: "Clients MUST still display
	// the user_code, as the authorization server will require the user to
	// confirm it to disambiguate devices or as remote phishing mitigation".
	logger.log(
		dedent`
		To authorize Wrangler, please visit:

		  ${deviceAuth.verification_uri}

		and enter the code:

		  ${deviceAuth.user_code}

		You have ${maxDurationSeconds / 60} minutes to approve this request.
	`
	);

	// Print the QR code (encodes the URL with the user code embedded so the
	// user does not have to type anything if they scan it).
	printVerificationQrCode(verificationUrl, logger, renderQrCode);

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
	// In the common case the user approves before we even render the QR, so
	// the perceived login latency drops from 1-5s to ~the network RTT.
	let firstPoll = true;

	while (Date.now() < deadline) {
		if (!firstPoll) {
			await sleep(intervalSeconds);
		}
		firstPoll = false;

		const result = await pollDeviceToken(
			deviceAuth.device_code,
			options.clientId,
			logger,
			isNonInteractiveOrCI
		);

		if ("error" in result) {
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
						"Consent denied. You must grant consent to Wrangler in order to login.\n" +
							"If you don't want to do this consider passing an API token via the `CLOUDFLARE_API_TOKEN` environment variable.",
						{ telemetryMessage: "user device-flow consent denied" }
					);
				case "expired_token":
					throw new UserError(
						"Device code expired before the request was approved. Please run `wrangler login --experimental-device` again to obtain a new code.",
						{ telemetryMessage: "user device-flow code expired" }
					);
				default:
					throw toErrorClass(result.error);
			}
		}

		// Success — we have an access token.
		const accessToken = {
			value: result.access_token,
			expiry: new Date(Date.now() + result.expires_in * 1000).toISOString(),
		};
		const scopes: string[] = result.scope ? result.scope.split(" ") : [];
		return {
			token: accessToken,
			scopes,
			refreshToken: result.refresh_token
				? { value: result.refresh_token }
				: undefined,
		};
	}

	throw new UserError(
		`Device authorization timed out after ${maxDurationSeconds / 60} minutes. Please run \`wrangler login --experimental-device\` again to obtain a new code.`,
		{ telemetryMessage: "user device-flow authorization timeout" }
	);
}
