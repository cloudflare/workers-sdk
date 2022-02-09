import { fetchResult } from "./cfetch";

/**
 * Information about a bucket, returned from `listR2Buckets()`.
 */
export interface R2BucketInfo {
  name: string;
  creation_date: string;
}

/**
 * Fetch a list of all the buckets under the given `accountId`.
 */
export async function listR2Buckets(
  accountId: string
): Promise<R2BucketInfo[]> {
  const results = await fetchResult<{
    buckets: R2BucketInfo[];
  }>(`/accounts/${accountId}/r2/buckets`);
  return results.buckets;
}

/**
 * Create a bucket with the given `bucketName` within the account given by `accountId`.
 *
 * A 400 is returned if the account already owns a bucket with this name.
 * A bucket must be explicitly deleted to be replaced.
 */
export async function createR2Bucket(
  accountId: string,
  bucketName: string
): Promise<void> {
  return await fetchResult<void>(
    `/accounts/${accountId}/r2/buckets/${bucketName}`,
    { method: "PUT" }
  );
}

/**
 * Delete a bucket with the given name
 */
export async function deleteR2Bucket(
  accountId: string,
  bucketName: string
): Promise<void> {
  return await fetchResult<void>(
    `/accounts/${accountId}/r2/buckets/${bucketName}`,
    { method: "DELETE" }
  );
}
