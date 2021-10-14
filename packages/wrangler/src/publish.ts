import type { CfWorkerInit } from "./api/worker";
import { toFormData } from "./api/form_data";
import esbuild from "esbuild";
import tmp from "tmp-promise";
import type { Config } from "./config";
import path from "path";
import { readFile } from "fs/promises";
import cfetch from "./fetchwithauthandloginifrequired";
import assert from "node:assert";

type Props = {
  config: Config;
  script?: string;
  name?: string;
};

export default async function publish(props: Props): Promise<void> {
  const { config } = props;
  const {
    account_id: accountId,
    zone_id: zoneId,
    //name,
    build,
    // @ts-expect-error hidden
    __path__,
    triggers,
  } = config;

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

  const destination = await tmp.dir({ unsafeCleanup: true });
  const result = await esbuild.build({
    entryPoints: [file],
    bundle: true,
    outdir: destination.path,
    format: "esm", // TODO: verify what changes are needed here
    sourcemap: true,
  });

  const content = await readFile(
    path.join(
      destination.path,
      props.script ? path.basename(props.script) : build.upload?.main
    ),
    {
      encoding: "utf-8",
    }
  );
  destination.cleanup();

  const worker: CfWorkerInit = {
    main: {
      name: props.script ? props.name : config.name,
      content: content,
      type: "esm", // TODO: this should read from build.upload format
    },
  };
  if (triggers) {
    // TODO: scheduled workers
  } else if (zoneId) {
    // TODO: zoned
  } else {
    console.log("checking that subdomain is registered");
    // check if subdomain is registered
    // if not, register it
    const subDomainResponse = await (
      await cfetch(
        `https://api.cloudflare.com/client/v4/accounts/${config.account_id}/workers/subdomain`,
        { method: "GET" }
      )
    ).json();

    assert(subDomainResponse.result.subdomain, "subdomain is not registered");

    const mode = { workers_dev: true };
    const init = {
      method: "PUT",
      body: toFormData(worker, mode),
    };
    console.log("publishing to workers.dev subdomain");
    const response = await cfetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${
        props.script ? props.name : config.name
      }`,
      // @ts-expect-error TODO: fix this type error!
      init
    );

    console.log(await response.json());

    // ok now enable it
    console.log("Making public on subdomain...");
    const json = await (
      await cfetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${
          props.script ? props.name : config.name
        }/subdomain`,
        {
          method: "POST",
          headers: {
            "Content-type": "application/json",
          },
          body: JSON.stringify({
            enabled: true,
          }),
        }
      )
    ).json();

    console.log(json);
  }
}
