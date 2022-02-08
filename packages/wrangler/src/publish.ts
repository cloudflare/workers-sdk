import assert from "node:assert";
import { readFileSync } from "node:fs";
import path from "node:path";
import { URLSearchParams } from "node:url";
import * as esbuild from "esbuild";
import { execaCommand } from "execa";
import tmp from "tmp-promise";
import { toFormData } from "./api/form_data";
import { fetchResult } from "./cfetch";
import guessWorkerFormat from "./guess-worker-format";
import makeModuleCollector from "./module-collection";
import { syncAssets } from "./sites";
import type { CfScriptFormat, CfWorkerInit } from "./api/worker";
import type { Config } from "./config";
import type { AssetPaths } from "./sites";
import type { Metafile } from "esbuild";

type Props = {
  config: Config;
  format: CfScriptFormat | undefined;
  script: string | undefined;
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
  experimentalPublic: boolean;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default async function publish(props: Props): Promise<void> {
  // TODO: warn if git/hg has uncommitted changes
  const { config } = props;
  const {
    account_id: accountId,
    build,
    // @ts-expect-error hidden
    __path__: wranglerTomlPath,
  } = config;

  const envRootObj =
    props.env && config.env ? config.env[props.env] || {} : config;

  assert(
    envRootObj.compatibility_date || props.compatibilityDate,
    "A compatibility_date is required when publishing. Add one to your wrangler.toml file, or pass it in your terminal as --compatibility_date. See https://developers.cloudflare.com/workers/platform/compatibility-dates for more information."
  );

  if (accountId === undefined) {
    throw new Error("No account_id provided.");
  }

  const triggers = props.triggers || config.triggers?.crons;
  const routes = props.routes || config.routes;

  const jsxFactory = props.jsxFactory || config.jsx_factory;
  const jsxFragment = props.jsxFragment || config.jsx_fragment;

  assert(config.account_id, "missing account id");

  let scriptName = props.name || config.name;
  assert(
    scriptName,
    'You need to provide a name when publishing a worker. Either pass it as a cli arg with `--name <name>` or in your config file as `name = "<name>"`'
  );

  if (config.site?.["entry-point"]) {
    console.warn(
      "Deprecation notice: The `site.entry-point` config field is no longer used.\n" +
        "The entry-point should be specified via the command line (e.g. `wrangler publish path/to/script`) or the `build.upload.main` config field.\n" +
        "Please remove the `site.entry-point` field from the `wrangler.toml` file."
    );
  }

  assert(
    !config.site || config.site.bucket,
    "A [site] definition requires a `bucket` field with a path to the site's public directory."
  );

  const destination = await tmp.dir({ unsafeCleanup: true });
  try {
    let file: string;
    let dir = process.cwd();
    if (props.script) {
      // If the script name comes from the command line it is relative to the current working directory.
      file = path.resolve(props.script);
    } else {
      // If the script name comes from the config, then it is relative to the wrangler.toml file.
      if (build?.upload?.main === undefined) {
        throw new Error(
          "Missing entry-point: The entry-point should be specified via the command line (e.g. `wrangler publish path/to/script`) or the `build.upload.main` config field."
        );
      }
      dir = path.resolve(
        path.dirname(wranglerTomlPath),
        (build.upload.format === "modules" && build.upload.dir) || ""
      );
      file = path.resolve(dir, build.upload.main);
    }

    if (props.legacyEnv) {
      scriptName += props.env ? `-${props.env}` : "";
    }
    const envName = props.env ?? "production";

    if (props.config.build?.command) {
      // TODO: add a deprecation message here?
      console.log("running:", props.config.build.command);
      await execaCommand(props.config.build.command, {
        shell: true,
        stdout: "inherit",
        stderr: "inherit",
        ...(props.config.build?.cwd && { cwd: props.config.build.cwd }),
      });
    }

    const format = await guessWorkerFormat(file, props.format);

    if (props.experimentalPublic && format === "service-worker") {
      // TODO: check config too
      throw new Error(
        "You cannot publish in the service worker format with a public directory."
      );
    }

    const moduleCollector = makeModuleCollector();
    const result = await esbuild.build({
      ...(props.experimentalPublic
        ? {
            stdin: {
              contents: readFileSync(
                path.join(__dirname, "../templates/static-asset-facade.js"),
                "utf8"
              ).replace("__ENTRY_POINT__", file),
              sourcefile: "static-asset-facade.js",
              resolveDir: path.dirname(file),
            },
            nodePaths: [path.join(__dirname, "../vendor")],
          }
        : { entryPoints: [file] }),
      bundle: true,
      absWorkingDir: dir,
      outdir: destination.path,
      external: ["__STATIC_CONTENT_MANIFEST"],
      format: "esm",
      sourcemap: true,
      metafile: true,
      conditions: ["worker", "browser"],
      loader: {
        ".js": "jsx",
        ".html": "text",
        ".pem": "text",
        ".txt": "text",
      },
      plugins: [moduleCollector.plugin],
      ...(jsxFactory && { jsxFactory }),
      ...(jsxFragment && { jsxFragment }),
    });

    // result.metafile is defined because of the `metafile: true` option above.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const metafile = result.metafile!;
    const entryPoints = Object.entries(metafile.outputs).filter(
      ([_path, output]) => output.entryPoint !== undefined
    );
    assert(
      entryPoints.length > 0,
      `Cannot find entry-point "${file}" in generated bundle.` +
        listEntryPoints(entryPoints)
    );
    assert(
      entryPoints.length < 2,
      "More than one entry-point found for generated bundle." +
        listEntryPoints(entryPoints)
    );
    const entryPointExports = entryPoints[0][1].exports;
    const resolvedEntryPointPath = path.resolve(dir, entryPoints[0][0]);
    const bundle = {
      type: entryPointExports.length > 0 ? "esm" : "commonjs",
      exports: entryPointExports,
    };

    let content = readFileSync(resolvedEntryPointPath, {
      encoding: "utf-8",
    });

    // if config.migrations
    // get current migration tag
    let migrations;
    if (config.migrations !== undefined) {
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
      scriptName,
      props.assetPaths,
      false,
      props.env
    );

    const bindings: CfWorkerInit["bindings"] = {
      kv_namespaces: (envRootObj.kv_namespaces || []).concat(
        assets.namespace
          ? { binding: "__STATIC_CONTENT", id: assets.namespace }
          : []
      ),
      vars: envRootObj.vars,
      durable_objects: envRootObj.durable_objects,
      services: envRootObj.experimental_services,
    };

    const workerType = bundle.type === "esm" ? "esm" : "commonjs";
    if (workerType !== "esm" && assets.manifest) {
      content = `const __STATIC_CONTENT_MANIFEST = ${JSON.stringify(
        assets.manifest
      )};\n${content}`;
    }

    const worker: CfWorkerInit = {
      name: scriptName,
      main: {
        name: path.basename(resolvedEntryPointPath),
        content: content,
        type: workerType,
      },
      bindings,
      ...(migrations && { migrations }),
      modules: moduleCollector.modules.concat(
        assets.manifest && workerType === "esm"
          ? {
              name: "__STATIC_CONTENT_MANIFEST",
              content: JSON.stringify(assets.manifest),
              type: "text",
            }
          : []
      ),
      compatibility_date: config.compatibility_date,
      compatibility_flags: config.compatibility_flags,
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
        body: toFormData(worker),
      },
      new URLSearchParams({ available_on_subdomains: "true" })
    );

    const uploadMs = Date.now() - start;
    console.log("Uploaded", workerName, formatTime(uploadMs));
    const deployments: Promise<string[]>[] = [];

    const userSubdomain = (
      await fetchResult<{ subdomain: string }>(
        `/accounts/${accountId}/workers/subdomain`
      )
    ).subdomain;

    const scriptURL =
      props.legacyEnv || !props.env
        ? `${scriptName}.${userSubdomain}.workers.dev`
        : `${envName}.${scriptName}.${userSubdomain}.workers.dev`;

    // Enable the `workers.dev` subdomain.
    // TODO: Make this configurable.
    if (!available_on_subdomain) {
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

    // Update routing table for the script.
    if (routes && routes.length) {
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

    if (!deployments.length) {
      return;
    }

    const targets = await Promise.all(deployments);
    const deployMs = Date.now() - start - uploadMs;
    console.log("Deployed", workerName, formatTime(deployMs));
    for (const target of targets.flat()) {
      console.log(" ", target);
    }
  } finally {
    await destination.cleanup();
  }
}

function listEntryPoints(
  outputs: [string, ValueOf<Metafile["outputs"]>][]
): string {
  return outputs.map(([_input, output]) => output.entryPoint).join("\n");
}

type ValueOf<T> = T[keyof T];

function formatTime(duration: number) {
  return `(${(duration / 1000).toFixed(2)} sec)`;
}
