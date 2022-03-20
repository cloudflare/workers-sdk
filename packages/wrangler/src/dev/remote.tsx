import assert from "node:assert";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { useState, useEffect, useRef } from "react";
import { createWorkerPreview } from "../create-worker-preview";
import useInspector from "../inspect";
import { usePreviewServer } from "../proxy";
import { syncAssets } from "../sites";
import type { CfPreviewToken } from "../create-worker-preview";
import type { AssetPaths } from "../sites";
import type { CfModule, CfWorkerInit, CfScriptFormat } from "../worker";
import type { EsbuildBundle } from "./use-esbuild";

export function Remote(props: {
  name: string | undefined;
  bundle: EsbuildBundle | undefined;
  format: CfScriptFormat | undefined;
  public: undefined | string;
  assetPaths: undefined | AssetPaths;
  port: number;
  ip: string;
  localProtocol: "https" | "http";
  inspectorPort: number;
  accountId: undefined | string;
  apiToken: undefined | string;
  bindings: CfWorkerInit["bindings"];
  compatibilityDate: string | undefined;
  compatibilityFlags: undefined | string[];
  usageModel: undefined | "bundled" | "unbound";
  env: string | undefined;
  legacyEnv: boolean | undefined;
  zone: { id: string; host: string } | undefined;
}) {
  assert(props.accountId, "accountId is required");
  assert(props.apiToken, "apiToken is required");
  const previewToken = useWorker({
    name: props.name,
    bundle: props.bundle,
    format: props.format,
    modules: props.bundle ? props.bundle.modules : [],
    accountId: props.accountId,
    apiToken: props.apiToken,
    bindings: props.bindings,
    assetPaths: props.assetPaths,
    port: props.port,
    compatibilityDate: props.compatibilityDate,
    compatibilityFlags: props.compatibilityFlags,
    usageModel: props.usageModel,
    env: props.env,
    legacyEnv: props.legacyEnv,
    zone: props.zone,
  });

  usePreviewServer({
    previewToken,
    publicRoot: props.public,
    localProtocol: props.localProtocol,
    localPort: props.port,
    ip: props.ip,
  });

  useInspector({
    inspectorUrl: previewToken ? previewToken.inspectorUrl.href : undefined,
    port: props.inspectorPort,
    logToTerminal: true,
  });
  return null;
}

export function useWorker(props: {
  name: string | undefined;
  bundle: EsbuildBundle | undefined;
  format: CfScriptFormat | undefined;
  modules: CfModule[];
  accountId: string;
  apiToken: string;
  bindings: CfWorkerInit["bindings"];
  assetPaths: undefined | AssetPaths;
  port: number;
  compatibilityDate: string | undefined;
  compatibilityFlags: string[] | undefined;
  usageModel: undefined | "bundled" | "unbound";
  env: string | undefined;
  legacyEnv: boolean | undefined;
  zone: { id: string; host: string } | undefined;
}): CfPreviewToken | undefined {
  const {
    name,
    bundle,
    format,
    modules,
    accountId,
    apiToken,
    bindings,
    assetPaths,
    compatibilityDate,
    compatibilityFlags,
    usageModel,
    port,
  } = props;
  const [token, setToken] = useState<CfPreviewToken | undefined>();

  // This is the most reliable way to detect whether
  // something's "happened" in our system; We make a ref and
  // mark it once we log our initial message. Refs are vars!
  const startedRef = useRef(false);

  useEffect(() => {
    async function start() {
      setToken(undefined); // reset token in case we're re-running

      if (!bundle || !format) return;

      if (!startedRef.current) {
        startedRef.current = true;
      } else {
        console.log("⎔ Detected changes, restarted server.");
      }

      const assets = await syncAssets(
        accountId,
        // When we're using the newer service environments, we wouldn't
        // have added the env name on to the script name. However, we must
        // include it in the kv namespace name regardless (since there's no
        // concept of service environments for kv namespaces yet).
        name + (!props.legacyEnv && props.env ? `-${props.env}` : ""),
        assetPaths,
        true
      ); // TODO: cancellable?

      const content = await readFile(bundle.path, "utf-8");

      const init: CfWorkerInit = {
        name,
        main: {
          name: path.basename(bundle.path),
          type: format === "modules" ? "esm" : "commonjs",
          content,
        },
        modules: modules.concat(
          assets.manifest
            ? {
                name: "__STATIC_CONTENT_MANIFEST",
                content: JSON.stringify(assets.manifest),
                type: "text",
              }
            : []
        ),
        bindings: {
          ...bindings,
          kv_namespaces: (bindings.kv_namespaces || []).concat(
            assets.namespace
              ? { binding: "__STATIC_CONTENT", id: assets.namespace }
              : []
          ),
          text_blobs: {
            ...bindings.text_blobs,
            ...(assets.manifest &&
              format === "service-worker" && {
                __STATIC_CONTENT_MANIFEST: "__STATIC_CONTENT_MANIFEST",
              }),
          },
        },
        migrations: undefined, // no migrations in dev
        compatibility_date: compatibilityDate,
        compatibility_flags: compatibilityFlags,
        usage_model: usageModel,
      };
      setToken(
        await createWorkerPreview(
          init,
          {
            accountId,
            apiToken,
          },
          { env: props.env, legacyEnv: props.legacyEnv, zone: props.zone }
        )
      );
    }
    start().catch((err) => {
      // we want to log the error, but not end the process
      // since it could recover after the developer fixes whatever's wrong
      console.error("remote worker:", err);
    });
  }, [
    name,
    bundle,
    format,
    accountId,
    apiToken,
    port,
    assetPaths,
    compatibilityDate,
    compatibilityFlags,
    usageModel,
    bindings,
    modules,
    props.env,
    props.legacyEnv,
    props.zone,
  ]);
  return token;
}
