export const EMAIL_PREVIEW_CSP =
	"default-src 'none'; img-src data: cid:; style-src 'unsafe-inline'; font-src data:";

/**
 * Adds a restrictive policy to untrusted email HTML before iframe rendering.
 * The iframe sandbox blocks active content, while this policy also prevents
 * passive resources such as tracking images and remote styles from loading.
 *
 * @param html - The captured email HTML.
 * @returns HTML prefixed with a preview-only Content Security Policy.
 */
export function createSafeEmailPreview(html: string): string {
	return `<meta http-equiv="Content-Security-Policy" content="${EMAIL_PREVIEW_CSP}">${html}`;
}
