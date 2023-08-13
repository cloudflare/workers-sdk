import { rest } from "msw";
import { createFetchResult, msw } from "./msw";
import type { NamespaceKeyInfo } from "../../kv/helpers";

export function mockKeyListRequest(
	expectedNamespaceId: string,
	expectedKeys: NamespaceKeyInfo[],
	keysPerRequest = 1000,
	blankCursorValue: "" | undefined | null = undefined
) {
	const requests = { count: 0 };
	// See https://api.cloudflare.com/#workers-kv-namespace-list-a-namespace-s-keys
	msw.use(
		rest.get(
			"*/accounts/:accountId/storage/kv/namespaces/:namespaceId/keys",
			(req, res, ctx) => {
				requests.count++;
				expect(req.params.accountId).toEqual("some-account-id");
				expect(req.params.namespaceId).toEqual(expectedNamespaceId);
				let response: undefined | NamespaceKeyInfo[];
				if (expectedKeys.length <= keysPerRequest) {
					response = expectedKeys;
				}

				const start = parseInt(req.url.searchParams.get("cursor") ?? "0") || 0;
				const end = start + keysPerRequest;
				const cursor = end < expectedKeys.length ? end : blankCursorValue;

				return res(
					ctx.json(
						createFetchResult(
							response ? response : expectedKeys.slice(start, end),
							true,
							[],
							[],
							{
								cursor,
							}
						)
					)
				);
			}
		)
	);
	return requests;
}
