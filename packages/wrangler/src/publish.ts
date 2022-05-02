import assert from "node:assert";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { URLSearchParams } from "node:url";
import tmp from "tmp-promise";
import { bundleWorker } from "./bundle";
import { fetchResult } from "./cfetch";
import { createWorkerUploadForm } from "./create-worker-upload-form";
import { logger } from "./logger";
import { syncAssets } from "./sites";
import type { Config } from "./config";
import type { Entry } from "./entry";
import type { AssetPaths } from "./sites";
import type { CfWorkerInit } from "./worker";

type Props = {
  config: Config;
  accountId: string;
  entry: Entry;
  rules: Config["rules"];
  name: string | undefined;
  env: string | undefined;
  compatibilityDate: string | undefined;
  compatibilityFlags: string[] | undefined;
  assetPaths: AssetPaths | undefined;
  triggers: string[] | undefined;
  routes: string[] | undefined;
  legacyEnv: boolean | undefined;
  jsxFactory: string | undefined;
  jsxFragment: string | undefined;
  tsconfig: string | undefined;
  experimentalPublic: boolean;
  minify: boolean | undefined;
  nodeCompat: boolean | undefined;
  outDir: string | undefined;
  dryRun: boolean | undefined;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default async function publish(props: Props): Promise<void> {
  // TODO: warn if git/hg has uncommitted changes
  const { config, accountId } = props;

  assert(
    props.compatibilityDate || config.compatibility_date,
    "A compatibility_date is required when publishing. Add one to your wrangler.toml file, or pass it in your terminal as --compatibility-date. See https://developers.cloudflare.com/workers/platform/compatibility-dates for more information."
  );

  const triggers = props.triggers || config.triggers?.crons;
  const routes =
    props.routes ?? config.routes ?? (config.route ? [config.route] : []) ?? [];

  // deployToWorkersDev defaults to true only if there aren't any routes defined
  const deployToWorkersDev = config.workers_dev ?? routes.length === 0;

  const jsxFactory = props.jsxFactory || config.jsx_factory;
  const jsxFragment = props.jsxFragment || config.jsx_fragment;

  const minify = props.minify ?? config.minify;

  const nodeCompat = props.nodeCompat ?? config.node_compat;
  if (nodeCompat) {
    logger.warn(
      "Enabling node.js compatibility mode for builtins and globals. This is experimental and has serious tradeoffs. Please see https://github.com/ionic-team/rollup-plugin-node-polyfills/ for more details."
    );
  }

  const scriptName = props.name;
  assert(
    scriptName,
    'You need to provide a name when publishing a worker. Either pass it as a cli arg with `--name <name>` or in your config file as `name = "<name>"`'
  );

  assert(
    !config.site || config.site.bucket,
    "A [site] definition requires a `bucket` field with a path to the site's public directory."
  );

  if (props.outDir) {
    // we're using a custom output directory,
    // so let's first ensure it exists
    mkdirSync(props.outDir, { recursive: true });
    // add a README
    const readmePath = path.join(props.outDir, "README.md");
    writeFileSync(
      readmePath,
      `This folder contains the built output assets for the worker "${scriptName}" generated at ${new Date().toISOString()}.`
    );
  }

  const destination = props.outDir ?? (await tmp.dir({ unsafeCleanup: true }));
  const envName = props.env ?? "production";

  const start = Date.now();
  const notProd = !props.legacyEnv && props.env;
  const workerName = notProd ? `${scriptName} (${envName})` : scriptName;
  const workerUrl = notProd
    ? `/accounts/${accountId}/workers/services/${scriptName}/environments/${envName}`
    : `/accounts/${accountId}/workers/scripts/${scriptName}`;

  let available_on_subdomain; // we'll set this later

  const { format } = props.entry;

  if (props.experimentalPublic && format === "service-worker") {
    throw new Error(
      "You cannot publish in the service-worker format with a public directory."
    );
  }

  if (config.wasm_modules && format === "modules") {
    throw new Error(
      "You cannot configure [wasm_modules] with an ES module worker. Instead, import the .wasm module directly in your code"
    );
  }

  if (config.text_blobs && format === "modules") {
    throw new Error(
      "You cannot configure [text_blobs] with an ES module worker. Instead, import the file directly in your code, and optionally configure `[rules]` in your wrangler.toml"
    );
  }

  if (config.data_blobs && format === "modules") {
    throw new Error(
      "You cannot configure [data_blobs] with an ES module worker. Instead, import the file directly in your code, and optionally configure `[rules]` in your wrangler.toml"
    );
  }
  try {
    const { modules, resolvedEntryPointPath, bundleType } = await bundleWorker(
      props.entry,
      typeof destination === "string" ? destination : destination.path,
      {
        serveAssetsFromWorker: props.experimentalPublic,
        jsxFactory,
        jsxFragment,
        rules: props.rules,
        tsconfig: props.tsconfig ?? config.tsconfig,
        minify,
        nodeCompat,
      }
    );

    // Some validation of durable objects + migrations
    if (config.durable_objects.bindings.length > 0) {
      // intrinsic [durable_objects] implies [migrations]
      const exportedDurableObjects = config.durable_objects.bindings.filter(
        (binding) => !binding.script_name
      );
      if (exportedDurableObjects.length > 0 && config.migrations.length === 0) {
        logger.warn(
          `In wrangler.toml, you have configured [durable_objects] exported by this Worker (${exportedDurableObjects.map(
            (durable) => durable.class_name
          )}), but no [migrations] for them. This may not work as expected until you add a [migrations] section to your wrangler.toml. Refer to https://developers.cloudflare.com/workers/learning/using-durable-objects/#durable-object-migrations-in-wranglertoml for more details.`
        );
      }
    }

    const content = readFileSync(resolvedEntryPointPath, {
      encoding: "utf-8",
    });

    // if config.migrations
    let migrations;
    if (config.migrations.length > 0) {
      // get current migration tag
      type ScriptData = { id: string; migration_tag?: string };
      let script: ScriptData | undefined;
      if (!props.legacyEnv) {
        try {
          if (props.env) {
            const scriptData = await fetchResult<{
              script: ScriptData;
            }>(
              `/accounts/${accountId}/workers/services/${scriptName}/environments/${props.env}`
            );
            script = scriptData.script;
          } else {
            const scriptData = await fetchResult<{
              default_environment: {
                script: ScriptData;
              };
            }>(`/accounts/${accountId}/workers/services/${scriptName}`);
            script = scriptData.default_environment.script;
          }
        } catch (err) {
          if (
            ![
              10090, // corresponds to workers.api.error.service_not_found, so the script wasn't previously published at all
              10092, // workers.api.error.environment_not_found, so the script wasn't published to this environment yet
            ].includes((err as { code: number }).code)
          ) {
            throw err;
          }
          // else it's a 404, no script found, and we can proceed
        }
      } else {
        const scripts = await fetchResult<ScriptData[]>(
          `/accounts/${accountId}/workers/scripts`
        );
        script = scripts.find(({ id }) => id === scriptName);
      }

      if (script?.migration_tag) {
        // was already published once
        const scriptMigrationTag = script.migration_tag;
        const foundIndex = config.migrations.findIndex(
          (migration) => migration.tag === scriptMigrationTag
        );
        if (foundIndex === -1) {
          logger.warn(
            `The published script ${scriptName} has a migration tag "${script.migration_tag}, which was not found in wrangler.toml. You may have already deleted it. Applying all available migrations to the script...`
          );
          migrations = {
            old_tag: script.migration_tag,
            new_tag: config.migrations[config.migrations.length - 1].tag,
            steps: config.migrations.map(({ tag: _tag, ...rest }) => rest),
          };
        } else {
          if (foundIndex !== config.migrations.length - 1) {
            // there are new migrations to send up
            migrations = {
              old_tag: script.migration_tag,
              new_tag: config.migrations[config.migrations.length - 1].tag,
              steps: config.migrations
                .slice(foundIndex + 1)
                .map(({ tag: _tag, ...rest }) => rest),
            };
          }
          // else, we're up to date, no migrations to send
        }
      } else {
        // first time publishing durable objects to this script,
        // so we send all the migrations
        migrations = {
          new_tag: config.migrations[config.migrations.length - 1].tag,
          steps: config.migrations.map(({ tag: _tag, ...rest }) => rest),
        };
      }
    }

    const assets = await syncAssets(
      accountId,
      // When we're using the newer service environments, we wouldn't
      // have added the env name on to the script name. However, we must
      // include it in the kv namespace name regardless (since there's no
      // concept of service environments for kv namespaces yet).
      scriptName + (!props.legacyEnv && props.env ? `-${props.env}` : ""),
      props.assetPaths,
      false,
      props.dryRun
    );

    const bindings: CfWorkerInit["bindings"] = {
      kv_namespaces: (config.kv_namespaces || []).concat(
        assets.namespace
          ? { binding: "__STATIC_CONTENT", id: assets.namespace }
          : []
      ),
      vars: config.vars,
      wasm_modules: config.wasm_modules,
      text_blobs: {
        ...config.text_blobs,
        ...(assets.manifest &&
          format === "service-worker" && {
            __STATIC_CONTENT_MANIFEST: "__STATIC_CONTENT_MANIFEST",
          }),
      },
      data_blobs: config.data_blobs,
      durable_objects: config.durable_objects,
      r2_buckets: config.r2_buckets,
      unsafe: config.unsafe?.bindings,
    };

    if (assets.manifest) {
      modules.push({
        name: "__STATIC_CONTENT_MANIFEST",
        content: JSON.stringify(assets.manifest),
        type: "text",
      });
    }

    const worker: CfWorkerInit = {
      name: scriptName,
      main: {
        name: path.basename(resolvedEntryPointPath),
        content: content,
        type: bundleType,
      },
      bindings,
      migrations,
      modules,
      compatibility_date: props.compatibilityDate ?? config.compatibility_date,
      compatibility_flags:
        props.compatibilityFlags ?? config.compatibility_flags,
      usage_model: config.usage_model,
    };

    if (!props.dryRun) {
      // Upload the script so it has time to propagate.
      // We can also now tell whether available_on_subdomain is set
      available_on_subdomain = (
        await fetchResult<{ available_on_subdomain: boolean }>(
          workerUrl,
          {
            method: "PUT",
            body: createWorkerUploadForm(worker),
          },
          new URLSearchParams({ include_subdomain_availability: "true" })
        )
      ).available_on_subdomain;
    }
  } finally {
    if (typeof destination !== "string") {
      // this means we're using a temp dir,
      // so let's clean up before we proceed
      await destination.cleanup();
    }
  }

  if (props.dryRun) {
    logger.log(`--dry-run: exiting now.`);
    return;
  }

  const uploadMs = Date.now() - start;
  const deployments: Promise<string[]>[] = [];

  if (deployToWorkersDev) {
    // Deploy to a subdomain of `workers.dev`
    const userSubdomain = await getSubdomain(accountId);
    const scriptURL =
      props.legacyEnv || !props.env
        ? `${scriptName}.${userSubdomain}.workers.dev`
        : `${envName}.${scriptName}.${userSubdomain}.workers.dev`;
    if (!available_on_subdomain) {
      // Enable the `workers.dev` subdomain.
      deployments.push(
        fetchResult(`${workerUrl}/subdomain`, {
          method: "POST",
          body: JSON.stringify({ enabled: true }),
          headers: {
            "Content-Type": "application/json",
          },
        })
          .then(() => [scriptURL])
          // Add a delay when the subdomain is first created.
          // This is to prevent an issue where a negative cache-hit
          // causes the subdomain to be unavailable for 30 seconds.
          // This is a temporary measure until we fix this on the edge.
          .then(async (url) => {
            await sleep(3000);
            return url;
          })
      );
    } else {
      deployments.push(Promise.resolve([scriptURL]));
    }
  } else {
    if (available_on_subdomain) {
      // Disable the workers.dev deployment
      await fetchResult(`${workerUrl}/subdomain`, {
        method: "POST",
        body: JSON.stringify({ enabled: false }),
        headers: {
          "Content-Type": "application/json",
        },
      });
    }
  }

  logger.log("Uploaded", workerName, formatTime(uploadMs));

  // Update routing table for the script.
  if (routes.length > 0) {
    deployments.push(
      fetchResult(`${workerUrl}/routes`, {
        // Note: PUT will delete previous routes on this script.
        method: "PUT",
        body: JSON.stringify(
          routes.map((route) =>
            typeof route !== "object" ? { pattern: route } : route
          )
        ),
        headers: {
          "Content-Type": "application/json",
        },
      }).then(() => {
        if (routes.length > 10) {
          return routes
            .slice(0, 9)
            .map((route) =>
              typeof route === "string"
                ? route
                : "zone_id" in route
                ? `${route.pattern} (zone id: ${route.zone_id})`
                : `${route.pattern} (zone name: ${route.zone_name})`
            )
            .concat([`...and ${routes.length - 10} more routes`]);
        }
        return routes.map((route) =>
          typeof route === "string"
            ? route
            : "zone_id" in route
            ? `${route.pattern} (zone id: ${route.zone_id})`
            : `${route.pattern} (zone name: ${route.zone_name})`
        );
      })
    );
  }

  // Configure any schedules for the script.
  // TODO: rename this to `schedules`?
  if (triggers && triggers.length) {
    deployments.push(
      fetchResult(`${workerUrl}/schedules`, {
        // Note: PUT will override previous schedules on this script.
        method: "PUT",
        body: JSON.stringify(triggers.map((cron) => ({ cron }))),
        headers: {
          "Content-Type": "application/json",
        },
      }).then(() => triggers.map((trigger) => `schedule: ${trigger}`))
    );
  }

  const targets = await Promise.all(deployments);
  const deployMs = Date.now() - start - uploadMs;

  if (deployments.length > 0) {
    logger.log("Published", workerName, formatTime(deployMs));
    for (const target of targets.flat()) {
      logger.log(" ", target);
    }
  } else {
    logger.log("No publish targets for", workerName, formatTime(deployMs));
  }
}

function formatTime(duration: number) {
  return `(${(duration / 1000).toFixed(2)} sec)`;
}

async function getSubdomain(accountId: string): Promise<string> {
  try {
    const { subdomain } = await fetchResult(
      `/accounts/${accountId}/workers/subdomain`
    );
    return subdomain;
  } catch (e) {
    const error = e as { code?: number };
    if (typeof error === "object" && !!error && error.code === 10007) {
      // 10007 error code: not found
      // https://api.cloudflare.com/#worker-subdomain-get-subdomain

      const errorMessage =
        "Error: You need to register a workers.dev subdomain before publishing to workers.dev";
      const solutionMessage =
        "You can either publish your worker to one or more routes by specifying them in wrangler.toml, or register a workers.dev subdomain here:";
      const onboardingLink = `https://dash.cloudflare.com/${accountId}/workers/onboarding`;

      throw new Error(`${errorMessage}\n${solutionMessage}\n${onboardingLink}`);
    } else {
      throw e;
    }
  }
}
