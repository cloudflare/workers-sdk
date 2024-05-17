import { rest } from "msw";
import { assert } from "vitest";
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
		rest.get(
			`*/accounts/:accountId/pages/projects/${projectName}/upload-token`,
			(req, res, ctx) => {
				assert(req.params.accountId == accountId);

				return res(
					ctx.status(200),
					ctx.json({ success: true, errors: [], messages: [], result: { jwt } })
				);
			}
		)
	);
}
