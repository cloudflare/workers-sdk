import { http, HttpResponse } from "msw";
import { assert } from "vitest";
import { msw } from "./msw";
import type { Settings } from "../../deployment-bundle/bindings";

export function mockGetSettings(
	options: {
		result?: Settings;
		assertAccountId?: string;
		assertScriptName?: string;
	} = {}
) {
	msw.use(
		http.get(
			"*/accounts/:accountId/workers/scripts/:scriptName/settings",
			async ({ params }) => {
				if (options.assertAccountId) {
					assert(params.accountId === options.assertAccountId);
				}

				if (options.assertScriptName) {
					assert(params.scriptName === options.assertScriptName);
				}

				if (!options.result) {
					return new Response(null, { status: 404 });
				}

				return HttpResponse.json({
					success: true,
					errors: [],
					messages: [],
					result: options.result,
				});
			}
		)
	);
}
