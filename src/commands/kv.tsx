import type { Config } from "../config";

type KvArgs = {
  binding?: string;
  "namespace-id"?: string;
  env?: string;
  preview?: boolean;
  config?: Config;
};

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
        "Either use --namespace to upload directly or create a configuration file with a binding."
    );
  }

  // they want to use an environment, actually
  if (env) {
    if (!config.env || !config.env[env]) {
      throw new Error(
        `Failed to find environment "${env}" in configuration file!`
      );
    }

    // TODO: either a bespoke arg type for this function to avoid undefineds or a EnvOrConfig type
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
      "No KV Namespace to upload to! Either use --namespace to upload directly or add a KV namespace to your wrangler config file."
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

  // we're in preview mode, `--preview true` or `--preivew` was passed
  if (preview && namespace.preview_id) {
    namespaceId = namespace.preview_id;
  } else {
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
  } else {
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
