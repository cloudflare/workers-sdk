import path from "node:path";
import { watch } from "chokidar";
import getPort from "get-port";
import { render } from "ink";
import React from "react";
import { findWranglerToml, printBindings, readConfig } from "./config";
import Dev from "./dev/dev";
import { getVarsForDev } from "./dev/dev-vars";

import { getEntry } from "./entry";
import { logger } from "./logger";
import { getAssetPaths, getSiteAssetPaths } from "./sites";
import { getZoneIdFromHost, getZoneForRoute } from "./zones";
import {
  printWranglerBanner,
  DEFAULT_LOCAL_PORT,
  type ConfigPath,
  getScriptName,
  getDevCompatibilityDate,
  getRules,
  isLegacyEnv,
} from ".";

import type { Config } from "./config";

interface DevArgs {
  config?: string;
  script?: string;
  name?: string;
  format?: string;
  env?: string;
  compatibilityDate?: string;
  "compatibility-date"?: string;
  compatibilityFlags?: string[];
  "compatibility-flags"?: string[];
  latest?: boolean;
  ip?: string;
  inspect?: boolean;
  port?: number;
  inspectorPort?: number;
  "inspector-port"?: number;
  routes?: string[];
  host?: string;
  localProtocol?: "http" | "https";
  "local-protocol"?: "http" | "https";
  experimentalPublic?: string;
  "experimental-public"?: string;
  public?: string;
  assets?: string;
  site?: string;
  siteInclude?: string[];
  "site-include"?: string[];
  siteExclude?: string[];
  "site-exclude"?: string[];
  upstreamProtocol?: "http" | "https";
  "upstream-protocol"?: "http" | "https";
  jsxFactory?: string;
  "jsx-factory"?: string;
  jsxFragment?: string;
  "jsx-fragment"?: string;
  tsconfig?: string;
  local?: boolean;
  minify?: boolean;
  nodeCompat?: boolean;
  "node-compat"?: boolean;
  experimentalEnableLocalPersistence?: boolean;
  "experimental-enable-local-persistence"?: boolean;
}

export async function dev(args: DevArgs) {
  let watcher: ReturnType<typeof watch> | undefined;
  try {
    await printWranglerBanner();
    const configPath =
      (args.config as ConfigPath) ||
      ((args.script &&
        findWranglerToml(path.dirname(args.script))) as ConfigPath);
    let config = readConfig(configPath, args);

    if (config.configPath) {
      watcher = watch(config.configPath, {
        persistent: true,
      }).on("change", async (_event) => {
        // TODO: Do we need to handle different `_event` types differently?
        //       e.g. what if the file is deleted, or added?
        config = readConfig(configPath, args);
        if (config.configPath) {
          logger.log(`${path.basename(config.configPath)} changed...`);
          rerender(await getDevReactElement(config));
        }
      });
    }

    const entry = await getEntry(
      { assets: args.assets, script: args.script },
      config,
      "dev"
    );

    if (config.services && config.services.length > 0) {
      logger.warn(
        `This worker is bound to live services: ${config.services
          .map(
            (service) =>
              `${service.binding} (${service.service}${
                service.environment ? `@${service.environment}` : ""
              })`
          )
          .join(", ")}`
      );
    }

    if (args.inspect) {
      logger.warn(
        "Passing --inspect is unnecessary, now you can always connect to devtools."
      );
    }

    if (args["experimental-public"]) {
      throw new Error(
        "The --experimental-public field has been renamed to --assets"
      );
    }

    if (args.public) {
      throw new Error("The --public field has been renamed to --assets");
    }

    if ((args.assets || config.assets) && (args.site || config.site)) {
      throw new Error(
        "Cannot use Assets and Workers Sites in the same Worker."
      );
    }

    const upstreamProtocol =
      args["upstream-protocol"] || config.dev.upstream_protocol;
    if (upstreamProtocol === "http") {
      logger.warn(
        "Setting upstream-protocol to http is not currently implemented.\n" +
          "If this is required in your project, please add your use case to the following issue:\n" +
          "https://github.com/cloudflare/wrangler2/issues/583."
      );
    }

    // TODO: if worker_dev = false and no routes, then error (only for dev)

    // Compute zone info from the `host` and `route` args and config;
    let host = args.host || config.dev.host;
    let zoneId: string | undefined;

    if (!args.local) {
      if (host) {
        zoneId = await getZoneIdFromHost(host);
      }
      const routes = args.routes || config.route || config.routes;
      if (!zoneId && routes) {
        const firstRoute = Array.isArray(routes) ? routes[0] : routes;
        const zone = await getZoneForRoute(firstRoute);
        if (zone) {
          zoneId = zone.id;
          host = zone.host;
        }
      }
    }

    const nodeCompat = args["node-compat"] ?? config.node_compat;
    if (nodeCompat) {
      logger.warn(
        "Enabling node.js compatibility mode for built-ins and globals. This is experimental and has serious tradeoffs. Please see https://github.com/ionic-team/rollup-plugin-node-polyfills/ for more details."
      );
    }

    // eslint-disable-next-line no-inner-declarations
    async function getBindings(configParam: Config) {
      return {
        kv_namespaces: configParam.kv_namespaces?.map(
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
        // Use a copy of combinedVars since we're modifying it later
        vars: getVarsForDev(configParam),
        wasm_modules: configParam.wasm_modules,
        text_blobs: configParam.text_blobs,
        data_blobs: configParam.data_blobs,
        durable_objects: configParam.durable_objects,
        r2_buckets: configParam.r2_buckets?.map(
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
        services: configParam.services,
        unsafe: configParam.unsafe?.bindings,
      };
    }

    const getLocalPort = memoizeGetPort(DEFAULT_LOCAL_PORT);
    const getInspectorPort = memoizeGetPort(9229);

    // eslint-disable-next-line no-inner-declarations
    async function getDevReactElement(configParam: Config) {
      // now log all available bindings into the terminal
      const bindings = await getBindings(configParam);
      // mask anything that was overridden in .dev.vars
      // so that we don't log potential secrets into the terminal
      const maskedVars = { ...bindings.vars };
      for (const key of Object.keys(maskedVars)) {
        if (maskedVars[key] !== configParam.vars[key]) {
          // This means it was overridden in .dev.vars
          // so let's mask it
          maskedVars[key] = "(hidden)";
        }
      }

      printBindings({
        ...bindings,
        vars: maskedVars,
      });

      const assetPaths =
        args.assets || config.assets
          ? getAssetPaths(config, args.assets)
          : getSiteAssetPaths(
              config,
              args.site,
              args.siteInclude,
              args.siteExclude
            );

      return (
        <Dev
          name={getScriptName({ name: args.name, env: args.env }, config)}
          entry={entry}
          env={args.env}
          zone={zoneId}
          host={host}
          rules={getRules(config)}
          legacyEnv={isLegacyEnv(config)}
          minify={args.minify ?? config.minify}
          nodeCompat={nodeCompat}
          build={config.build || {}}
          initialMode={args.local ? "local" : "remote"}
          jsxFactory={args["jsx-factory"] || config.jsx_factory}
          jsxFragment={args["jsx-fragment"] || config.jsx_fragment}
          tsconfig={args.tsconfig ?? config.tsconfig}
          upstreamProtocol={upstreamProtocol}
          localProtocol={args["local-protocol"] || config.dev.local_protocol}
          enableLocalPersistence={
            args["experimental-enable-local-persistence"] || false
          }
          accountId={config.account_id}
          assetPaths={assetPaths}
          port={args.port || config.dev.port || (await getLocalPort())}
          ip={args.ip || config.dev.ip}
          inspectorPort={args["inspector-port"] ?? (await getInspectorPort())}
          isWorkersSite={Boolean(args.site || config.site)}
          compatibilityDate={getDevCompatibilityDate(
            config,
            args["compatibility-date"]
          )}
          compatibilityFlags={
            args["compatibility-flags"] || config.compatibility_flags
          }
          usageModel={config.usage_model}
          bindings={bindings}
          crons={config.triggers.crons}
        />
      );
    }
    const { waitUntilExit, rerender } = render(
      await getDevReactElement(config)
    );
    await waitUntilExit();
  } finally {
    await watcher?.close();
  }
}

/**
 * Avoiding calling `getPort()` multiple times by memoizing the first result.
 */
function memoizeGetPort(defaultPort: number) {
  let portValue: number;
  return async () => {
    return portValue || (portValue = await getPort({ port: defaultPort }));
  };
}
