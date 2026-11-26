import { http, HttpResponse } from "msw";
import { createFetchResult, msw } from "./msw";

const temporaryPreviewAccountUrl =
	"https://api.cloudflare.com/client/v4/provisioning/previews";

/**
 * Mocks the temporary preview-account challenge and creation endpoints. The
 * created account is `preview-account-id` with token `preview-account-token`,
 * and event codes are acknowledged.
 *
 * @returns The creation request bodies, appended to as requests arrive.
 */
export function mockTemporaryPreviewAccount(): { eventCode?: string }[] {
	const creationRequests: { eventCode?: string }[] = [];
	msw.use(
		// Small k/g so the proof-of-work solve is instant.
		http.post(`${temporaryPreviewAccountUrl}/challenge`, () =>
			HttpResponse.json(
				createFetchResult({
					challengeToken: "challenge-token",
					seed: Buffer.alloc(32, 1).toString("base64url"),
					k: 2,
					g: 2,
					s: 16,
					expiresAt: 9999999999,
				})
			)
		),
		http.post(temporaryPreviewAccountUrl, async ({ request }) => {
			const body = (await request.json()) as { eventCode?: string };
			creationRequests.push(body);
			return HttpResponse.json(
				createFetchResult({
					account: {
						id: "preview-account-id",
						name: "Preview Account Alpha",
						apiToken: "preview-account-token",
						expiresAt: "2027-01-01T00:00:00.000Z",
					},
					claim: {
						url: "https://dash.cloudflare.com/claim-preview",
						expiresAt: "2027-01-02T00:00:00.000Z",
					},
					...(body.eventCode ? { eventCodeAccepted: true } : {}),
				})
			);
		})
	);
	return creationRequests;
}
