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
  zone?: string;
  routes?: (string | number)[];
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
  const zone = props.zone || config.zone_id;
  const routes = props.routes || config.routes;

  assert(config.account_id, "missing account id");

  let file: string;
  if (props.script) {
    file = props.script;
    assert(props.name, "name is required when using script");
  } else {
    assert(build?.upload?.main, "missing main file");
    assert(config.name, "missing name");
    file = path.join(path.dirname(__path__), build.upload.main);
  }

  let scriptName = props.script ? props.name : config.name;
  scriptName += props.env ? `-${props.env}` : "";

  const destination = await tmp.dir({ unsafeCleanup: true });

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
  destination.cleanup();
  const assets =
    props.public || props.site || props.config.site?.bucket // TODO: allow both
      ? await syncAssets(
          accountId,
          scriptName,
          props.public || props.site || props.config.site?.bucket,
          false
        )
      : { manifest: undefined, namespace: undefined };

  const envRootObj = props.env ? config[`env.${props.env}`] : config;

  const worker: CfWorkerInit = {
    main: {
      name: scriptName,
      content: content,
      type:
        (bundle.type === "esm" ? "modules" : "service-worker") === "modules"
          ? "esm"
          : "commonjs",
    },
    variables: {
      ...(envRootObj?.vars || {}),
      ...(envRootObj?.kv_namespaces || []).reduce(
        (obj, { binding, preview_id, id }) => {
          return { ...obj, [binding]: { namespaceId: id } };
        },
        {}
      ),
      ...(assets.namespace
        ? { __STATIC_CONTENT: { namespaceId: assets.namespace } }
        : {}),
    },
    modules: assets.manifest
      ? [].concat({
          name: "__STATIC_CONTENT_MANIFEST",
          content: JSON.stringify(assets.manifest),
          type: "text",
        })
      : [],
  };

  if (triggers) {
    console.log("publishing to workers.dev subdomain");

    await cfetch(`/accounts/${accountId}/workers/scripts/${scriptName}`, {
      method: "PUT",
      // @ts-expect-error TODO: fix this type error!
      body: toFormData(worker),
    });

    // then mark it as a cron
    await cfetch(
      `/accounts/${accountId}/workers/scripts/${scriptName}/schedules`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          triggers.map((trigger) => ({ cron: `${trigger}` }))
        ),
      }
    );
  } else if (zone) {
    if (!routes) {
      throw new Error("missing routes");
    }
    // if zoneid is a domain, convert to zone id
    let zoneId: string;
    if (zone.indexOf(".") > -1) {
      // TODO: verify this is a domain properly
      const zoneResult = await cfetch<{ id: string }>(
        `/zones?name=${encodeURIComponent(zone)}`
      );
      zoneId = zoneResult.id;
    } else {
      zoneId = zone;
    }

    // get all routes for this zone

    const allRoutes = await cfetch<
      { id: string; pattern: string; script: string }[]
    >(`/zones/${zoneId}/workers/routes`);

    // upload the script

    await cfetch(`/accounts/${accountId}/workers/scripts/${scriptName}`, {
      method: "PUT",
      // @ts-expect-error TODO: fix this type error!
      body: toFormData(worker),
    });

    for (const route of routes) {
      const matchingRoute = allRoutes.find((r) => r.pattern === route);
      if (!matchingRoute) {
        console.log(`publishing ${scriptName} to ${route}`);
        await cfetch(`/zones/${zoneId}/workers/routes`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            pattern: route,
            script: scriptName,
          }),
        });
      } else {
        if (matchingRoute.script !== scriptName) {
          // conflict;
          console.error(
            `A worker with a different name "${matchingRoute.script}" was previously deployed to the specified route ${route}, skipping...`
          );
        } else {
          console.log(
            `${scriptName} already published to ${route}, skipping...`
          );
        }
      }
    }
  } else {
    console.log("checking that subdomain is registered");
    // check if subdomain is registered
    // if not, register it
    const subDomainResponse = await cfetch<{ subdomain: string }>(
      `/accounts/${config.account_id}/workers/subdomain`
    );
    const subdomainName = subDomainResponse.subdomain;

    assert(subdomainName, "subdomain is not registered");

    console.log("publishing to workers.dev subdomain");
    await cfetch(`/accounts/${accountId}/workers/scripts/${scriptName}`, {
      method: "PUT",
      // @ts-expect-error TODO: fix this type error!
      body: toFormData(worker),
    });

    // ok now enable it
    console.log("making public on subdomain...");
    await cfetch(
      `/accounts/${accountId}/workers/scripts/${scriptName}/subdomain`,
      {
        method: "POST",
        headers: {
          "Content-type": "application/json",
        },
        body: JSON.stringify({
          enabled: true,
        }),
      }
    );
    await sleep(3000); // roughly wait for the subdomain to be enabled
    // TODO: we should fix this on the edge cache
    console.log(`published to ${scriptName}.${subdomainName}.workers.dev`);
  }
}
