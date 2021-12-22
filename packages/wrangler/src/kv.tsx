import type { Config } from "./config";
import cfetch from "./cfetch";
import qs from "node:querystring";

type KvArgs = {
  binding?: string;
  "namespace-id"?: string;
  env?: string;
  preview?: boolean;
  config?: Config;
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
  const response = await cfetch<{ id: string }>(
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
    const json = await cfetch<KVNamespaceInfo[]>(
      `/accounts/${accountId}/storage/kv/namespaces?per_page=${pageSize}&order=title&direction=asc&page=${page}`
    );
    page++;
    results.push(...json);
    if (json.length < pageSize) {
      break;
    }
  }
  return results;
}

export async function listNamespaceKeys(
  accountId: string,
  namespaceId: string,
  prefix?: string,
  limit?: number
) {
  // TODO: this doesn't appear to do pagination
  return await cfetch<
    { name: string; expiration: number; metadata: { [key: string]: unknown } }[]
  >(
    `/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/keys?${qs.stringify(
      { prefix, limit }
    )}`
  );
}

export async function putKeyValue(
  accountId: string,
  namespaceId: string,
  key: string,
  value: string,
  args?: { expiration?: number; expiration_ttl?: number }
) {
  return await cfetch(
    `/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${key}?${
      args
        ? qs.stringify({
            expiration: args.expiration,
            expiration_ttl: args.expiration_ttl,
          })
        : ""
    }`,
    { method: "PUT", body: value }
  );
}

export async function putBulkKeyValue(
  accountId: string,
  namespaceId: string,
  keyvalueStr: string
) {
  return await cfetch(
    `/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/bulk`,
    {
      method: "PUT",
      body: keyvalueStr,
      headers: { "Content-Type": "application/json" },
    }
  );
}

export async function deleteBulkKeyValue(
  accountId: string,
  namespaceId: string,
  keyStr: string
) {
  return await cfetch(
    `/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/bulk`,
    {
      method: "DELETE",
      body: keyStr,
      headers: { "Content-Type": "application/json" },
    }
  );
}

export function getNamespaceId({
  preview,
  binding,
  config,
  "namespace-id": namespaceId,
  env,
}: KvArgs): string {
  // nice
  if (namespaceId) {
    return namespaceId;
  }

  // begin pre-flight checks

  // `--binding` is only valid if there's a wrangler configuration file.
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

  // they want to use an environment, actually
  if (env) {
    if (!config.env || !config.env[env]) {
      throw new Error(
        `Failed to find environment "${env}" in configuration file!`
      );
    }

    // TODO: either a bespoke arg type for this function to avoid `undefined`s or an `EnvOrConfig` type
    return getNamespaceId({
      binding,
      "namespace-id": namespaceId,
      env: undefined,
      preview,
      config: {
        env: undefined,
        build: undefined,
        name: undefined,
        account_id: undefined,
        ...config.env[env],
      },
    });
  }

  // there's no KV namespaces
  if (!config.kv_namespaces || config.kv_namespaces.length === 0) {
    throw new Error(
      "No KV Namespace to upload to! Either use --namespace-id to upload directly or add a KV namespace to your wrangler config file."
    );
  }

  const namespace = config.kv_namespaces.find(
    (namespace) => namespace.binding === binding
  );

  // we couldn't find a namespace with that binding
  if (!namespace) {
    throw new Error(`No KV Namespaces found with binding ${binding}!`);
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
export function isValidNamespaceBinding(binding: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(binding);
}
