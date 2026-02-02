import { http, HttpResponse } from "msw";
import { expect } from "vitest";
import { createFetchResult, msw } from "./msw";
import type {
	KVNamespaceInfo,
	NamespaceKeyInfo,
} from "../../commands/kv/helpers";

export function mockKeyListRequest(
	expectedNamespaceId: string,
	expectedKeys: NamespaceKeyInfo[],
	keysPerRequest = 1000,
	blankCursorValue: "" | undefined | null = undefined
) {
	const requests = { count: 0 };
	// See https://api.cloudflare.com/#workers-kv-namespace-list-a-namespace-s-keys
	msw.use(
		http.get(
			"*/accounts/:accountId/storage/kv/namespaces/:namespaceId/keys",
			({ request, params }) => {
				const url = new URL(request.url);

				requests.count++;
				expect(params.accountId).toEqual("some-account-id");
				expect(params.namespaceId).toEqual(expectedNamespaceId);
				let response: undefined | NamespaceKeyInfo[];
				if (expectedKeys.length <= keysPerRequest) {
					response = expectedKeys;
				}

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

export function mockListKVNamespacesRequest(...namespaces: KVNamespaceInfo[]) {
	msw.use(
		http.get(
			"*/accounts/:accountId/storage/kv/namespaces",
			({ params }) => {
				expect(params.accountId).toEqual("some-account-id");
				return HttpResponse.json(createFetchResult(namespaces));
			},
			{ once: true }
		)
	);
}

export function mockCreateKVNamespace(
	options: {
		resultId?: string;
		assertTitle?: string;
	} = {}
) {
	msw.use(
		http.post(
			"*/accounts/:accountId/storage/kv/namespaces",
			async ({ request }) => {
				if (options.assertTitle) {
					const requestBody = await request.json();
					expect(requestBody).toEqual({ title: options.assertTitle });
				}

				return HttpResponse.json(
					createFetchResult({ id: options.resultId ?? "some-namespace-id" })
				);
			},
			{ once: true }
		)
	);
}
