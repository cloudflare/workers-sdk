import { fetchResult } from "../../cfetch";

type BulkGetResponse = {
	values: {
		[key: string]: {
			value: string | object | null;
			metadata?: object;
		}
	}
}

export async function getKVBulkKeyValue(
	accountId: string,
	namespaceId: string,
	keys: string[],
) {
	const requestPayload = { keys };

	return await fetchResult<BulkGetResponse>(
		`/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/bulk/get`,
		{
			method: "POST",
			body: JSON.stringify(requestPayload),
			headers: { "Content-Type": "application/json" },
		},
	);
}