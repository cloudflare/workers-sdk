import assert from "node:assert";
import { http, HttpResponse } from "msw";
import { msw } from "./msw";

type LegacyScriptInfo = { id: string; migration_tag?: string };

/**
 * Mocks service metadata used by pre-upload checks and migration resolution.
 *
 * @param options.script - The script metadata to return. When omitted, the
 *   mock returns a not-found error.
 * @returns Nothing.
 */
export function mockLegacyScriptData(options: { script?: LegacyScriptInfo }) {
	const { script } = options;
	msw.use(
		http.get(
			"*/accounts/:accountId/workers/services/:scriptName",
			({ params }) => {
				assert(params.accountId === "some-account-id");
				if (!script) {
					return HttpResponse.json({
						success: false,
						errors: [
							{
								code: 10090,
								message: "workers.api.error.service_not_found",
							},
						],
						messages: [],
						result: null,
					});
				}
				return HttpResponse.json({
					success: true,
					errors: [],
					messages: [],
					result: {
						default_environment: {
							environment: "production",
							script: {
								last_deployed_from: "wrangler",
								tag: `tag:${params["scriptName"]}`,
								...script,
							},
						},
					},
				});
			}
		)
	);
}
