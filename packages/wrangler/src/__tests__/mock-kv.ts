import { createFetchResult, setMockRawResponse } from "./mock-cfetch";

export function mockKeyListRequest(
  expectedNamespaceId: string,
  expectedKeys: string[],
  keysPerRequest = 1000,
  blankCursorValue: "" | undefined | null = undefined
) {
  const requests = { count: 0 };
  // See https://api.cloudflare.com/#workers-kv-namespace-list-a-namespace-s-keys
  const expectedKeyObjects = expectedKeys.map((name) => ({
    name,
    expiration: 123456789,
    metadata: {},
  }));
  setMockRawResponse(
    "/accounts/:accountId/storage/kv/namespaces/:namespaceId/keys",
    "GET",
    ([_url, accountId, namespaceId], _init, query) => {
      requests.count++;
      expect(accountId).toEqual("some-account-id");
      expect(namespaceId).toEqual(expectedNamespaceId);
      if (expectedKeyObjects.length <= keysPerRequest) {
        return createFetchResult(expectedKeyObjects);
      } else {
        const start = parseInt(query.get("cursor") ?? "0") || 0;
        const end = start + keysPerRequest;
        const cursor = end < expectedKeyObjects.length ? end : blankCursorValue;
        return createFetchResult(
          expectedKeyObjects.slice(start, end),
          true,
          [],
          [],
          { cursor }
        );
      }
    }
  );
  return requests;
}
