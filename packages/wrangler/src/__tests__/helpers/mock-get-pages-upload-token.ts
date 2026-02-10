import { http, HttpResponse } from "msw";
import { expect } from "vitest";
import { msw } from "./msw";

/**
 * Mocks the `/accounts/:accountId/pages/projects/:projectName/upload-token` GET request
 */
export function mockGetUploadTokenRequest(
	jwt: string,
	accountId: string,
	projectName: string
) {
	msw.use(
		http.get(
			`*/accounts/:accountId/pages/projects/${projectName}/upload-token`,
			({ params }) => {
				expect(params.accountId).toEqual(accountId);

				return HttpResponse.json(
					{ success: true, errors: [], messages: [], result: { jwt } },
					{ status: 200 }
				);
			}
		)
	);
}
