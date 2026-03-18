import { http, HttpResponse } from "msw";
// eslint-disable-next-line no-restricted-imports
import { expect } from "vitest";
import { msw } from "./msw";

type LegacyScriptInfo = { id: string; migration_tag?: string };

export function mockLegacyScriptData(options: { scripts: LegacyScriptInfo[] }) {
	const { scripts } = options;
	msw.use(
		http.get(
			"*/accounts/:accountId/workers/scripts",
			({ params }) => {
				expect(params.accountId).toEqual("some-account-id");
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
