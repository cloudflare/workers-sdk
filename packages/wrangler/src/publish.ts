import type { CfWorkerInit } from "./api/worker";
import { toFormData } from "./api/form_data";
import esbuild from "esbuild";
import tmp from "tmp-promise";
import type { Config } from "./config";
import path from "path";
import { readFile } from "fs/promises";
import cfetch from "./cfetch";
import assert from "node:assert";
import { syncAssets } from "./sites";
import makeModuleCollector from "./module-collection";
import { execa } from "execa";

type CfScriptFormat = void | "modules" | "service-worker";

type Props = {
  config: Config;
  format?: CfScriptFormat;
  script?: string;
  name?: string;
  env?: string;
  public?: string;
  site?: string;
  triggers?: (string | number)[];
  routes?: (string | number)[];
  legacyEnv?: boolean;
  jsxFactory: void | string;
  jsxFragment: void | string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default async function publish(props: Props): Promise<void> {
  if (props.public && props.format === "service-worker") {
    // TODO: check config too
    throw new Error(
      "You cannot use the service worker format with a public directory."
    );
  }
  // TODO: warn if git/hg has uncommitted changes
  const { config } = props;
  const {
    account_id: accountId,
    build,
    // @ts-expect-error hidden
    __path__,
  } = config;

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

  let file: string;
  if (props.script) {
    file = props.script;
  } else {
    assert(build?.upload?.main, "missing main file");
    file = path.join(path.dirname(__path__), build.upload.main);
  }

  if (props.legacyEnv) {
    scriptName += props.env ? `-${props.env}` : "";
  }
  const envName = props.env ?? "production";

  const destination = await tmp.dir({ unsafeCleanup: true });

  if (props.config.build?.command) {
    // TODO: add a deprecation message here?
    console.log("running:", props.config.build.command);
    const buildCommandPieces = props.config.build.command.split(" ");
    await execa(buildCommandPieces[0], buildCommandPieces.slice(1), {
      stdout: "inherit",
      stderr: "inherit",
      ...(props.config.build?.cwd && { cwd: props.config.build.cwd }),
    });
  }

  const moduleCollector = makeModuleCollector();
  const result = await esbuild.build({
    ...(props.public
      ? {
          stdin: {
            contents: (
              await readFile(
                path.join(__dirname, "../static-asset-facade.js"),
                "utf8"
              )
            ).replace("__ENTRY_POINT__", path.join(process.cwd(), file)),
            sourcefile: "static-asset-facade.js",
            resolveDir: path.dirname(file),
          },
        }
      : { entryPoints: [file] }),
    bundle: true,
    nodePaths: props.public ? [path.join(__dirname, "../vendor")] : undefined,
    outdir: destination.path,
    external: ["__STATIC_CONTENT_MANIFEST"],
    format: "esm",
    sourcemap: true,
    metafile: true,
    conditions: ["worker", "browser"],
    loader: {
      ".js": "jsx",
    },
    plugins: [moduleCollector.plugin],
    ...(jsxFactory && { jsxFactory }),
    ...(jsxFragment && { jsxFragment }),
  });

  const chunks = Object.entries(result.metafile.outputs).find(
    ([_path, { entryPoint }]) =>
      entryPoint ===
      (props.public
        ? path.join(path.dirname(file), "static-asset-facade.js")
        : file)
  );

  const { format } = props;
  const bundle = {
    type: chunks[1].exports.length > 0 ? "esm" : "commonjs",
    exports: chunks[1].exports,
  };

  // TODO: instead of bundling the facade with the worker, we should just bundle the worker and expose it as a module.
  // That way we'll be able to accurately tell if this is a service worker or not.

  if (format === "modules" && bundle.type === "commonjs") {
    console.error("⎔ Cannot use modules with a commonjs bundle.");
    // TODO: a much better error message here, with what to do next
    return;
  }
  if (format === "service-worker" && bundle.type !== "esm") {
    console.error("⎔ Cannot use service-worker with a esm bundle.");
    // TODO: a much better error message here, with what to do next
    return;
  }

  const content = await readFile(chunks[0], { encoding: "utf-8" });
  await destination.cleanup();

  // if config.migrations
  // get current migration tag
  let migrations;
  if ("migrations" in config) {
    const scripts = await cfetch<{ id: string; migration_tag: string }[]>(
      `/accounts/${accountId}/workers/scripts`
    );
    const script = scripts.find((script) => script.id === scriptName);
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

  const assets =
    props.public || props.site || props.config.site?.bucket // TODO: allow both
      ? await syncAssets(
          accountId,
          scriptName,
          props.public || props.site || props.config.site?.bucket,
          false
        )
      : { manifest: undefined, namespace: undefined };

  const envRootObj = props.env ? config.env[props.env] || {} : config;
  const bindings: CfWorkerInit["bindings"] = {
    kv_namespaces: envRootObj.kv_namespaces?.concat(
      assets.namespace
        ? { binding: "__STATIC_CONTENT", id: assets.namespace }
        : []
    ),
    vars: envRootObj.vars,
    durable_objects: envRootObj.durable_objects,
    services: envRootObj.experimental_services,
  };

  const worker: CfWorkerInit = {
    name: scriptName,
    main: {
      name: path.basename(chunks[0]),
      content: content,
      type: bundle.type === "esm" ? "esm" : "commonjs",
    },
    bindings,
    ...(migrations && { migrations }),
    modules: moduleCollector.modules.concat(
      assets.manifest
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
  function formatTime(duration: number) {
    return `(${(duration / 1000).toFixed(2)} sec)`;
  }

  const notProd = !props.legacyEnv && props.env;
  const workerName = notProd ? `${scriptName} (${envName})` : scriptName;
  const workerUrl = notProd
    ? `/accounts/${accountId}/workers/services/${scriptName}/environments/${envName}`
    : `/accounts/${accountId}/workers/scripts/${scriptName}`;

  // Upload the script so it has time to propogate.
  const { available_on_subdomain } = await cfetch(
    `${workerUrl}?available_on_subdomain=true`,
    {
      method: "PUT",
      // @ts-expect-error: TODO: fix this type error!
      body: toFormData(worker),
    }
  );

  const uploadMs = Date.now() - start;
  console.log("Uploaded", workerName, formatTime(uploadMs));
  const deployments: Promise<string[]>[] = [];

  const userSubdomain = (
    await cfetch<{ subdomain: string }>(
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
      cfetch(`${workerUrl}/subdomain`, {
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
      cfetch(`${workerUrl}/routes`, {
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
      cfetch(`${workerUrl}/schedules`, {
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
}
