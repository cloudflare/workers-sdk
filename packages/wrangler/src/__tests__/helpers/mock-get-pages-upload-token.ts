import { http, HttpResponse } from "msw";
import { msw } from "./msw";
import type { ExpectStatic } from "vitest";

/**
 * Mocks the `/accounts/:accountId/pages/projects/:projectName/upload-token` GET request
 */
export function mockGetUploadTokenRequest(
	expect: ExpectStatic,
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
