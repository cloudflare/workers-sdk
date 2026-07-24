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
}): string => `${verificationUri}?user_code=${encodeURIComponent(userCode)}`;
