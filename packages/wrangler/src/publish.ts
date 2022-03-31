import assert from "node:assert";
import { readFileSync } from "node:fs";
import path from "node:path";
import { URLSearchParams } from "node:url";
import tmp from "tmp-promise";
import { bundleWorker } from "./bundle";
import { fetchResult } from "./cfetch";
import { createWorkerUploadForm } from "./create-worker-upload-form";
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
  triggers: (string | number)[] | undefined;
  routes: (string | number)[] | undefined;
  legacyEnv: boolean | undefined;
  jsxFactory: undefined | string;
  jsxFragment: undefined | string;
  tsconfig: undefined | string;
  experimentalPublic: boolean;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default async function publish(props: Props): Promise<void> {
  // TODO: warn if git/hg has uncommitted changes
  const { config, accountId } = props;

  assert(
    props.compatibilityDate || config.compatibility_date,
    "A compatibility_date is required when publishing. Add one to your wrangler.toml file, or pass it in your terminal as --compatibility_date. See https://developers.cloudflare.com/workers/platform/compatibility-dates for more information."
  );

  const triggers = props.triggers || config.triggers?.crons;
  const routes =
    props.routes ?? config.routes ?? (config.route ? [config.route] : []) ?? [];

  // deployToWorkersDev defaults to true only if there aren't any routes defined
  const deployToWorkersDev = config.workers_dev ?? routes.length === 0;

  const jsxFactory = props.jsxFactory || config.jsx_factory;
  const jsxFragment = props.jsxFragment || config.jsx_fragment;

  const scriptName = props.name;
  assert(
    scriptName,
    'You need to provide a name when publishing a worker. Either pass it as a cli arg with `--name <name>` or in your config file as `name = "<name>"`'
  );

  assert(
    !config.site || config.site.bucket,
    "A [site] definition requires a `bucket` field with a path to the site's public directory."
  );

  const destination = await tmp.dir({ unsafeCleanup: true });
  try {
    const envName = props.env ?? "production";

    const { format } = props.entry;

    if (props.experimentalPublic && format === "service-worker") {
      // TODO: check config too
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
        "You cannot configure [text_blobs] with an ES module worker. Instead, import the file directly in your code, and optionally configure `[build.upload.rules]` in your wrangler.toml"
      );
    }

    const { modules, resolvedEntryPointPath, bundleType } = await bundleWorker(
      props.entry,
      destination.path,
      {
        serveAssetsFromWorker: props.experimentalPublic,
        jsxFactory,
        jsxFragment,
        rules: props.rules,
        tsconfig: props.tsconfig ?? config.tsconfig,
      }
    );

    const content = readFileSync(resolvedEntryPointPath, {
      encoding: "utf-8",
    });

    // if config.migrations
    // get current migration tag
    let migrations;
    if (config.migrations.length > 0) {
      const scripts = await fetchResult<
        { id: string; migration_tag: string }[]
      >(`/accounts/${accountId}/workers/scripts`);
      const script = scripts.find(({ id }) => id === scriptName);
      if (script?.migration_tag) {
        // was already published once
        const foundIndex = config.migrations.findIndex(
          (migration) => migration.tag === script.migration_tag
        );
        if (foundIndex === -1) {
          console.warn(
            `The published script ${scriptName} has a migration tag "${script.migration_tag}, which was not found in wrangler.toml. You may have already deleted it. Applying all available migrations to the script...`
          );
          migrations = {
            old_tag: script.migration_tag,
            new_tag: config.migrations[config.migrations.length - 1].tag,
            steps: config.migrations.map(({ tag: _tag, ...rest }) => rest),
          };
        } else {
          migrations = {
            old_tag: script.migration_tag,
            new_tag: config.migrations[config.migrations.length - 1].tag,
            steps: config.migrations
              .slice(foundIndex + 1)
              .map(({ tag: _tag, ...rest }) => rest),
          };
        }
      } else {
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
      false
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

    const start = Date.now();
    const notProd = !props.legacyEnv && props.env;
    const workerName = notProd ? `${scriptName} (${envName})` : scriptName;
    const workerUrl = notProd
      ? `/accounts/${accountId}/workers/services/${scriptName}/environments/${envName}`
      : `/accounts/${accountId}/workers/scripts/${scriptName}`;

    // Upload the script so it has time to propagate.
    const { available_on_subdomain } = await fetchResult(
      workerUrl,
      {
        method: "PUT",
        body: createWorkerUploadForm(worker),
      },
      new URLSearchParams({ available_on_subdomain: "true" })
    );

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
      // Disable the workers.dev deployment
      await fetchResult(`${workerUrl}/subdomain`, {
        method: "POST",
        body: JSON.stringify({ enabled: false }),
        headers: {
          "Content-Type": "application/json",
        },
      });
    }

    console.log("Uploaded", workerName, formatTime(uploadMs));

    // Update routing table for the script.
    if (routes.length > 0) {
      deployments.push(
        fetchResult(`${workerUrl}/routes`, {
          // TODO: PATCH will not delete previous routes on this script,
          // whereas PUT will. We need to decide on the default behaviour
          // and how to configure it.
          method: "PUT",
          body: JSON.stringify(routes.map((pattern) => ({ pattern }))),
          headers: {
            "Content-Type": "application/json",
          },
        }).then(() => {
          if (routes.length > 10) {
            return routes
              .slice(0, 9)
              .map(String)
              .concat([`...and ${routes.length - 10} more routes`]);
          }
          return routes.map(String);
        })
      );
    }

    // Configure any schedules for the script.
    // TODO: rename this to `schedules`?
    if (triggers && triggers.length) {
      deployments.push(
        fetchResult(`${workerUrl}/schedules`, {
          // TODO: Unlike routes, this endpoint does not support PATCH.
          // So technically, this will override any previous schedules.
          // We should change the endpoint to support PATCH.
          method: "PUT",
          body: JSON.stringify(triggers.map((cron) => ({ cron }))),
          headers: {
            "Content-Type": "application/json",
          },
        }).then(() => triggers.map(String))
      );
    }

    const targets = await Promise.all(deployments);
    const deployMs = Date.now() - start - uploadMs;

    if (deployments.length > 0) {
      console.log("Published", workerName, formatTime(deployMs));
      for (const target of targets.flat()) {
        console.log(" ", target);
      }
    } else {
      console.log("No publish targets for", workerName, formatTime(deployMs));
    }
  } finally {
    await destination.cleanup();
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
