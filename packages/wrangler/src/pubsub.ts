import { fetchResult } from "./cfetch";

/**
 * Information about a bucket, returned from `listPubSubNamespace()`.
 */
export interface PubSubNamespaceInfo {
  name: string;
  creation_date: string;
}

/**
 * Fetch a list of all the buckets under the given `accountId`.
 */
export async function listPubSubNamespace(
  accountId: string
): Promise<PubSubNamespaceInfo[]> {
  const results = await fetchResult<{
    buckets: PubSubNamespaceInfo[];
  }>(`/accounts/${accountId}/r2/buckets`);
  return results.buckets;
}

/**
 * Create a bucket with the given `bucketName` within the account given by `accountId`.
 *
 * A 400 is returned if the account already owns a bucket with this name.
 * A bucket must be explicitly deleted to be replaced.
 */
//DELETE: https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/pubsub/namespaces


export async function createPubSubNamespace(
  accountId: string,
  name: string
): Promise<void> {
  return await fetchResult<void>(
    `/accounts/${accountId}/pubsub/namespaces`,
    { method: "POST",
      body: JSON.stringify({
      name: name,})
    }
  );
}

/**
 * Delete a bucket with the given name
 */
export async function deletePubSubNamespace(
  accountId: string,
  pubsubNamespace: string
): Promise<void> {
  return await fetchResult<void>(
    `/accounts/${accountId}/pubsub/namespaces/${pubsubNamespace}`,
    { method: "DELETE" }
  );
}
