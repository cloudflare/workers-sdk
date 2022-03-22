import { URLSearchParams } from "node:url";
import { fetchListResult, fetchResult, fetchKVGetValue } from "./cfetch";
import type { Config } from "./config";

/** The largest number of kv items we can pass to the API in a single request. */
const API_MAX = 10000;
// The const below are halved from the API's true capacity to help avoid
// hammering it with large requests.
const BATCH_KEY_MAX = API_MAX / 2;

type KvArgs = {
  binding?: string;
  "namespace-id"?: string;
  preview?: boolean;
};

/**
 * Create a new namespace under the given `accountId` with the given `title`.
 *
 * @returns the generated id of the created namespace.
 */
export async function createNamespace(
  accountId: string,
  title: string
): Promise<string> {
  const response = await fetchResult<{ id: string }>(
    `/accounts/${accountId}/storage/kv/namespaces`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title,
      }),
    }
  );

  return response.id;
}

/**
 * The information about a namespace that is returned from `listNamespaces()`.
 */
export interface KVNamespaceInfo {
  id: string;
  title: string;
  supports_url_encoding?: boolean;
}

/**
 * Fetch a list of all the namespaces under the given `accountId`.
 */
export async function listNamespaces(
  accountId: string
): Promise<KVNamespaceInfo[]> {
  const pageSize = 100;
  let page = 1;
  const results: KVNamespaceInfo[] = [];
  while (results.length % pageSize === 0) {
    const json = await fetchResult<KVNamespaceInfo[]>(
      `/accounts/${accountId}/storage/kv/namespaces`,
      {},
      new URLSearchParams({
        per_page: pageSize.toString(),
        order: "title",
        direction: "asc",
        page: page.toString(),
      })
    );
    page++;
    results.push(...json);
    if (json.length < pageSize) {
      break;
    }
  }
  return results;
}

export interface NamespaceKeyInfo {
  name: string;
  expiration?: number;
  metadata?: { [key: string]: unknown };
}

export async function listNamespaceKeys(
  accountId: string,
  namespaceId: string,
  prefix = ""
) {
  return await fetchListResult<NamespaceKeyInfo>(
    `/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/keys`,
    {},
    new URLSearchParams({ prefix })
  );
}

/**
 * Information about a key-value pair, including its "metadata" fields.
 */
export interface KeyValue {
  key: string;
  value: string;
  expiration?: number;
  expiration_ttl?: number;
  metadata?: object;
  base64?: boolean;
}

const KeyValueKeys = new Set([
  "key",
  "value",
  "expiration",
  "expiration_ttl",
  "metadata",
  "base64",
]);

/**
 * Is the given object a valid `KeyValue` type?
 */
export function isKeyValue(keyValue: object): keyValue is KeyValue {
  const props = Object.keys(keyValue);
  if (!props.includes("key") || !props.includes("value")) {
    return false;
  }
  return true;
}

/**
 * Get all the properties on the `keyValue` that are not expected.
 */
export function unexpectedKeyValueProps(keyValue: KeyValue): string[] {
  const props = Object.keys(keyValue);
  return props.filter((prop) => !KeyValueKeys.has(prop));
}

export async function putKeyValue(
  accountId: string,
  namespaceId: string,
  keyValue: KeyValue
) {
  let searchParams: URLSearchParams | undefined;
  if (keyValue.expiration || keyValue.expiration_ttl) {
    searchParams = new URLSearchParams();
    if (keyValue.expiration) {
      searchParams.set("expiration", `${keyValue.expiration}`);
    }
    if (keyValue.expiration_ttl) {
      searchParams.set("expiration_ttl", `${keyValue.expiration_ttl}`);
    }
  }
  return await fetchResult(
    `/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${keyValue.key}`,
    { method: "PUT", body: keyValue.value },
    searchParams
  );
}

export async function getKeyValue(
  accountId: string,
  namespaceId: string,
  key: string
): Promise<string> {
  return await fetchKVGetValue(accountId, namespaceId, key);
}

export async function putBulkKeyValue(
  accountId: string,
  namespaceId: string,
  keyValues: KeyValue[],
  progressCallback: (index: number, total: number) => void
) {
  for (let index = 0; index < keyValues.length; index += BATCH_KEY_MAX) {
    if (progressCallback && keyValues.length > BATCH_KEY_MAX) {
      progressCallback(index, keyValues.length);
    }

    await fetchResult(
      `/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/bulk`,
      {
        method: "PUT",
        body: JSON.stringify(keyValues.slice(index, index + BATCH_KEY_MAX)),
        headers: { "Content-Type": "application/json" },
      }
    );
  }
  if (progressCallback && keyValues.length > BATCH_KEY_MAX) {
    progressCallback(keyValues.length, keyValues.length);
  }
}

export async function deleteBulkKeyValue(
  accountId: string,
  namespaceId: string,
  keys: string[],
  progressCallback: (index: number, total: number) => void
) {
  for (let index = 0; index < keys.length; index += BATCH_KEY_MAX) {
    if (progressCallback && keys.length > BATCH_KEY_MAX) {
      progressCallback(index, keys.length);
    }

    await fetchResult(
      `/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/bulk`,
      {
        method: "DELETE",
        body: JSON.stringify(keys.slice(index, index + BATCH_KEY_MAX)),
        headers: { "Content-Type": "application/json" },
      }
    );
  }
  if (progressCallback && keys.length > BATCH_KEY_MAX) {
    progressCallback(keys.length, keys.length);
  }
}

export function getNamespaceId(
  { preview, binding, "namespace-id": namespaceId }: KvArgs,
  config: Config
): string {
  // nice
  if (namespaceId) {
    return namespaceId;
  }

  // begin pre-flight checks

  // `--binding` is only valid if there's a wrangler configuration.
  if (binding && !config) {
    throw new Error("--binding specified, but no config file was found.");
  }

  // there's no config. abort here
  if (!config) {
    throw new Error(
      "Failed to find a config file.\n" +
        "Either use --namespace-id to upload directly or create a configuration file with a binding."
    );
  }

  // there's no KV namespaces
  if (!config.kv_namespaces || config.kv_namespaces.length === 0) {
    throw new Error(
      "No KV Namespaces configured! Either use --namespace-id to upload directly or add a KV namespace to your wrangler config file."
    );
  }

  const namespace = config.kv_namespaces.find((ns) => ns.binding === binding);

  // we couldn't find a namespace with that binding
  if (!namespace) {
    throw new Error(
      `A namespace with binding name "${binding}" was not found in the configured "kv_namespaces".`
    );
  }

  // end pre-flight checks

  // we're in preview mode, `--preview true` or `--preview` was passed
  if (preview && namespace.preview_id) {
    namespaceId = namespace.preview_id;
    // We don't want to execute code below if preview is set to true, so we just return. Otherwise we will get errors!
    return namespaceId;
  } else if (preview) {
    throw new Error(
      `No preview ID found for ${binding}. Add one to your wrangler config file to use a separate namespace for previewing your worker.`
    );
  }

  // either `--preview false`, or preview wasn't passed
  // TODO: should we care? or should we just treat false and undefined the same
  const previewIsDefined = typeof preview !== "undefined";

  // --preview false was passed
  if (previewIsDefined && namespace.id) {
    namespaceId = namespace.id;
    // We don't want to execute code below if preview is set to true, so we just return. Otherwise we can get error!
    return namespaceId;
  } else if (previewIsDefined) {
    throw new Error(
      `No namespace ID found for ${binding}. Add one to your wrangler config file to use a separate namespace for previewing your worker.`
    );
  }

  // `--preview` wasn't passed
  const bindingHasOnlyOneId =
    (namespace.id && !namespace.preview_id) ||
    (!namespace.id && namespace.preview_id);
  if (bindingHasOnlyOneId) {
    namespaceId = namespace.id || namespace.preview_id;
  } else {
    throw new Error(
      `${binding} has both a namespace ID and a preview ID. Specify "--preview" or "--preview false" to avoid writing data to the wrong namespace.`
    );
  }

  // shouldn't happen. we should be able to prove this with strong typing.
  // TODO: when we add strongly typed commands, rewrite these checks so they're exhaustive
  if (!namespaceId) {
    throw Error(
      "Something went wrong trying to determine which namespace to upload to.\n" +
        "Please create a github issue with the command you just ran along with your wrangler configuration."
    );
  }

  return namespaceId;
}

/**
 * KV namespace binding names must be valid JS identifiers.
 */
export function isValidNamespaceBinding(
  binding: string | undefined
): binding is string {
  return (
    typeof binding === "string" && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(binding)
  );
}
