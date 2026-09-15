import { UserError } from "@cloudflare/workers-utils";

/**
 * Build the URL the user should visit to approve a device authorization
 * request, with the `user_code` embedded as a query parameter so the user
 * does not have to type it manually.
 *
 * Per RFC 8628 §3.3.1, this is the "verification_uri_complete" optimization
 * for non-textual transmission (such as QR codes). Authorization servers may
 * return their own `verification_uri_complete` in the device authorization
 * response — prefer that when it is provided. Use this helper as a fallback
 * when only `verification_uri` is available.
 *
 * Extracted into its own module (mirroring `generate-auth-url.ts`) so that
 * tests can mock the generated URL deterministically.
 */
export const generateVerificationUrl = ({
	verificationUri,
	userCode,
}: {
	verificationUri: string;
	userCode: string;
}): string => {
	const url = new URL(verificationUri);
	url.searchParams.set("user_code", userCode);
	return url.toString();
};

function parseUrl(value: string): URL | undefined {
	try {
		return new URL(value);
	} catch {
		return undefined;
	}
}

/**
 * Assert that a verification URL supplied by the authorization server is safe
 * to show the user and hand to the OS browser opener.
 *
 * Unlike the authorization-code flow — which builds its authorize URL itself
 * from the resolved auth domain — the device flow is *told* where to send the
 * user. That URL is printed to the terminal and passed to `openInBrowser`,
 * which shells out to the platform opener and will happily launch a `file:`
 * path or a registered custom-scheme handler. An off-domain URL is exactly the
 * remote-phishing scenario RFC 8628 §5.4 warns about: the user is instructed to
 * enter their `user_code` on whatever page opens.
 *
 * So a URL is only trusted when it
 *   - parses,
 *   - uses `https:`,
 *   - carries no embedded credentials (`https://real-looking@evil.example`),
 *   - and sits on exactly the auth domain we asked for the device code.
 *
 * @param verificationUrl the server-supplied URL to check
 * @param options `field` names the response member for the error message;
 *   `authDomain` is the resolved auth domain (`getAuthDomainFromEnv()`),
 *   with or without a port
 * @throws {UserError} when the URL fails any of the above
 */
export function assertTrustedVerificationUrl(
	verificationUrl: string,
	options: {
		field: "verification_uri" | "verification_uri_complete";
		authDomain: string;
	}
): void {
	const url = parseUrl(verificationUrl);
	const expected = parseUrl(`https://${options.authDomain}`);

	const trusted =
		url !== undefined &&
		expected !== undefined &&
		url.protocol === "https:" &&
		url.username === "" &&
		url.password === "" &&
		// `host` rather than `hostname` so a port in either value is significant.
		url.host === expected.host;

	if (!trusted) {
		throw new UserError(
			`The authorization server returned an untrusted \`${options.field}\`: ${verificationUrl}\n` +
				`Expected an \`https\` URL on \`${options.authDomain}\`. Refusing to display or open it.`,
			{ telemetryMessage: "user device-flow untrusted verification url" }
		);
	}
}
