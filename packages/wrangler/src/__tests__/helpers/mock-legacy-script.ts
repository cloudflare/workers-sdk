import { http, HttpResponse } from "msw";
import { assert } from "vitest";
import { msw } from "./msw";

type LegacyScriptInfo = { id: string; migration_tag?: string };

export function mockLegacyScriptData(options: { scripts: LegacyScriptInfo[] }) {
	const { scripts } = options;
	msw.use(
		http.get(
			"*/accounts/:accountId/workers/scripts",
			({ params }) => {
				assert(params.accountId === "some-account-id");
				return HttpResponse.json({
					success: true,
					errors: [],
					messages: [],
					result: scripts,
				});
			},
			{ once: true }
		)
	);
}
