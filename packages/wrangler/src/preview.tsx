import getPort from "get-port";
import { render } from "ink";
import React from "react";

import { readConfig } from "./config";
import Dev from "./dev/dev";
import { getEntry } from "./entry";
import { DeprecationError } from "./errors";
import { logger } from "./logger";
import { requireAuth } from "./user";
import {
  isLegacyEnv,
  getDevCompatibilityDate,
  getRules,
  DEFAULT_LOCAL_PORT,
} from "./index";
import type { ConfigPath } from "./index";

import type { Argv, ArgumentsCamelCase } from "yargs";

interface PreviewArgs {
  method: string;
  body: string;
  env: string;
  watch: boolean;
}

export function previewOptions(yargs: Argv) {
  return yargs
    .positional("method", {
      type: "string",
      describe: "Type of request to preview your worker",
    })
    .positional("body", {
      type: "string",
      describe: "Body string to post to your preview worker request.",
    })
    .option("env", {
      type: "string",
      requiresArg: true,
      describe: "Perform on a specific environment",
    })
    .option("watch", {
      default: true,
      describe: "Enable live preview",
      type: "boolean",
    });
}

export async function previewHandler(args: ArgumentsCamelCase<PreviewArgs>) {
  if (args.method || args.body) {
    throw new DeprecationError(
      "The `wrangler preview` command has been deprecated.\n" +
        "Try using `wrangler dev` to to try out a worker during development.\n"
    );
  }

  // Delegate to `wrangler dev`
  logger.warn(
    "***************************************************\n" +
      "The `wrangler preview` command has been deprecated.\n" +
      "Attempting to run `wrangler dev` instead.\n" +
      "***************************************************\n"
  );

  const config = readConfig(args.config as ConfigPath, args);
  const entry = await getEntry({}, config, "dev");

  const accountId = await requireAuth(config);

  const { waitUntilExit } = render(
    <Dev
      name={config.name}
      entry={entry}
      rules={getRules(config)}
      env={args.env}
      zone={undefined}
      host={undefined}
      legacyEnv={isLegacyEnv(config)}
      build={config.build || {}}
      minify={undefined}
      nodeCompat={config.node_compat}
      initialMode={args.local ? "local" : "remote"}
      jsxFactory={config.jsx_factory}
      jsxFragment={config.jsx_fragment}
      tsconfig={config.tsconfig}
      upstreamProtocol={config.dev.upstream_protocol}
      localProtocol={config.dev.local_protocol}
      localUpstream={undefined}
      enableLocalPersistence={false}
      accountId={accountId}
      assetPaths={undefined}
      port={config.dev.port || (await getPort({ port: DEFAULT_LOCAL_PORT }))}
      ip={config.dev.ip}
      isWorkersSite={false}
      compatibilityDate={getDevCompatibilityDate(config)}
      compatibilityFlags={config.compatibility_flags}
      usageModel={config.usage_model}
      bindings={{
        kv_namespaces: config.kv_namespaces?.map(
          ({ binding, preview_id, id: _id }) => {
            // In `dev`, we make folks use a separate kv namespace called
            // `preview_id` instead of `id` so that they don't
            // break production data. So here we check that a `preview_id`
            // has actually been configured.
            // This whole block of code will be obsoleted in the future
            // when we have copy-on-write for previews on edge workers.
            if (!preview_id) {
              // TODO: This error has to be a _lot_ better, ideally just asking
              // to create a preview namespace for the user automatically
              throw new Error(
                `In development, you should use a separate kv namespace than the one you'd use in production. Please create a new kv namespace with "wrangler kv:namespace create <name> --preview" and add its id as preview_id to the kv_namespace "${binding}" in your wrangler.toml`
              ); // Ugh, I really don't like this message very much
            }
            return {
              binding,
              id: preview_id,
            };
          }
        ),
        vars: config.vars,
        wasm_modules: config.wasm_modules,
        text_blobs: config.text_blobs,
        data_blobs: config.data_blobs,
        durable_objects: config.durable_objects,
        r2_buckets: config.r2_buckets?.map(
          ({ binding, preview_bucket_name, bucket_name: _bucket_name }) => {
            // same idea as kv namespace preview id,
            // same copy-on-write TODO
            if (!preview_bucket_name) {
              throw new Error(
                `In development, you should use a separate r2 bucket than the one you'd use in production. Please create a new r2 bucket with "wrangler r2 bucket create <name>" and add its name as preview_bucket_name to the r2_buckets "${binding}" in your wrangler.toml`
              );
            }
            return {
              binding,
              bucket_name: preview_bucket_name,
            };
          }
        ),
        services: config.services,
        unsafe: config.unsafe?.bindings,
      }}
      crons={config.triggers.crons}
      inspectorPort={await getPort({ port: 9229 })}
    />
  );
  await waitUntilExit();
}
