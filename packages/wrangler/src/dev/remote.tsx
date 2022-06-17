import { readFile } from "node:fs/promises";
import path from "node:path";
import { useState, useEffect, useRef } from "react";
import { createWorkerPreview } from "../create-worker-preview";
import useInspector from "../inspect";
import { logger } from "../logger";
import { usePreviewServer } from "../proxy";
import { syncAssets } from "../sites";
import { requireApiToken, requireAuth } from "../user";
import type { CfPreviewToken } from "../create-worker-preview";
import type { AssetPaths } from "../sites";
import type { CfModule, CfWorkerInit, CfScriptFormat } from "../worker";
import type { EsbuildBundle } from "./use-esbuild";

export function Remote(props: {
  name: string | undefined;
  bundle: EsbuildBundle | undefined;
  format: CfScriptFormat | undefined;
  isWorkersSite: boolean;
  assetPaths: AssetPaths | undefined;
  port: number;
  ip: string;
  localProtocol: "https" | "http";
  inspectorPort: number;
  accountId: string | undefined;
  bindings: CfWorkerInit["bindings"];
  compatibilityDate: string;
  compatibilityFlags: string[] | undefined;
  usageModel: "bundled" | "unbound" | undefined;
  env: string | undefined;
  legacyEnv: boolean | undefined;
  zone: string | undefined;
  host: string | undefined;
}) {
  const previewToken = useWorker({
    name: props.name,
    bundle: props.bundle,
    format: props.format,
    modules: props.bundle ? props.bundle.modules : [],
    accountId: props.accountId,
    bindings: props.bindings,
    assetPaths: props.assetPaths,
    isWorkersSite: props.isWorkersSite,
    port: props.port,
    compatibilityDate: props.compatibilityDate,
    compatibilityFlags: props.compatibilityFlags,
    usageModel: props.usageModel,
    env: props.env,
    legacyEnv: props.legacyEnv,
    zone: props.zone,
    host: props.host,
  });

  usePreviewServer({
    previewToken,
    assetDirectory: props.isWorkersSite
      ? undefined
      : props.assetPaths?.assetDirectory,
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
  accountId: string | undefined;
  bindings: CfWorkerInit["bindings"];
  assetPaths: AssetPaths | undefined;
  isWorkersSite: boolean;
  port: number;
  compatibilityDate: string | undefined;
  compatibilityFlags: string[] | undefined;
  usageModel: "bundled" | "unbound" | undefined;
  env: string | undefined;
  legacyEnv: boolean | undefined;
  zone: string | undefined;
  host: string | undefined;
}): CfPreviewToken | undefined {
  const {
    name,
    bundle,
    format,
    modules,
    accountId,
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
  // This ref holds the actual accountId being used, the `accountId` prop could be undefined
  // as it is only what is retrieved from the wrangler.toml config.
  const accountIdRef = useRef(accountId);

  useEffect(() => {
    const abortController = new AbortController();
    async function start() {
      setToken(undefined); // reset token in case we're re-running

      if (!bundle || !format) return;

      if (!startedRef.current) {
        startedRef.current = true;
      } else {
        logger.log("⎔ Detected changes, restarted server.");
      }

      // Ensure we have an account id, even if it means logging in here.
      accountIdRef.current = await requireAuth({
        account_id: accountIdRef.current,
      });

      const assets = await syncAssets(
        accountIdRef.current,
        // When we're using the newer service environments, we wouldn't
        // have added the env name on to the script name. However, we must
        // include it in the kv namespace name regardless (since there's no
        // concept of service environments for kv namespaces yet).
        name + (!props.legacyEnv && props.env ? `-${props.env}` : ""),
        props.isWorkersSite ? assetPaths : undefined,
        true,
        false
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
            accountId: accountIdRef.current,
            apiToken: requireApiToken(),
          },
          {
            env: props.env,
            legacyEnv: props.legacyEnv,
            zone: props.zone,
            host: props.host,
          },
          abortController.signal
        )
      );
    }
    start().catch((err) => {
      // we want to log the error, but not end the process
      // since it could recover after the developer fixes whatever's wrong
      if ((err as { code: string }).code !== "ABORT_ERR") {
        // instead of logging the raw API error to the user,
        // give them friendly instructions
        // for error 10063 (workers.dev subdomain required)
        if (err.code === 10063) {
          const errorMessage =
            "Error: You need to register a workers.dev subdomain before running the dev command in remote mode";
          const solutionMessage =
            "You can either enable local mode by pressing l, or register a workers.dev subdomain here:";
          const onboardingLink = `https://dash.cloudflare.com/${accountIdRef.current}/workers/onboarding`;
          logger.error(
            `${errorMessage}\n${solutionMessage}\n${onboardingLink}`
          );
        } else {
          logger.error("Error on remote worker:", err);
        }
      }
    });

    return () => {
      abortController.abort();
    };
  }, [
    name,
    bundle,
    format,
    accountId,
    port,
    assetPaths,
    props.isWorkersSite,
    compatibilityDate,
    compatibilityFlags,
    usageModel,
    bindings,
    modules,
    props.env,
    props.legacyEnv,
    props.zone,
    props.host,
  ]);
  return token;
}
