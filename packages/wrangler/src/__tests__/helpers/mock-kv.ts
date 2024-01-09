import { http, HttpResponse } from "msw";
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
		http.get<{ accountId: string; namespaceId: string }>(
			"*/accounts/:accountId/storage/kv/namespaces/:namespaceId/keys",
			({ params, request }) => {
				requests.count++;
				expect(params.accountId).toEqual("some-account-id");
				expect(params.namespaceId).toEqual(expectedNamespaceId);
				let response: undefined | NamespaceKeyInfo[];
				if (expectedKeys.length <= keysPerRequest) {
					response = expectedKeys;
				}

				const url = new URL(request.url);
				const start = parseInt(url.searchParams.get("cursor") ?? "0") || 0;
				const end = start + keysPerRequest;
				const cursor = end < expectedKeys.length ? end : blankCursorValue;

				return HttpResponse.json(
					createFetchResult(
						response ? response : expectedKeys.slice(start, end),
						true,
						[],
						[],
						{
							cursor,
						}
					)
				);
			}
		)
	);
	return requests;
}
