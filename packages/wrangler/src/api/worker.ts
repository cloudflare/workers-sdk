import type { CfPreviewToken } from "./preview";
import { previewToken } from "./preview";
import fetch from "node-fetch";

/**
 * A Cloudflare account.
 */
export interface CfAccount {
  /**
   * An API token.
   *
   * @link https://api.cloudflare.com/#user-api-tokens-properties
   */
  apiToken: string;
  /**
   * An account ID.
   */
  accountId: string;
  /**
   * A zone ID, only required if not using `workers.dev`.
   */
  zoneId?: string;
}

/**
 * A module type.
 */
export type CfModuleType =
  | "esm"
  | "commonjs"
  | "compiled-wasm"
  | "text"
  | "buffer";

/**
 * An imported module.
 */
export interface CfModule {
  /**
   * The module name.
   *
   * @example
   * './src/index.js'
   */
  name: string;
  /**
   * The module content, usually JavaScript or WASM code.
   *
   * @example
   * export default {
   *   async fetch(request) {
   *     return new Response('Ok')
   *   }
   * }
   */
  content: string | BufferSource;
  /**
   * The module type.
   *
   * If absent, will default to the main module's type.
   */
  type?: CfModuleType;
}

/**
 * A map of variable names to values.
 */
interface CfVars {
  [key: string]: string;
}

/**
 * A KV namespace.
 */
interface CfKvNamespace {
  binding: string;
  id: string;
}

/**
 * A Durable Object.
 */
interface CfDurableObject {
  name: string;
  class_name: string;
  script_name?: string;
}

/**
 * A Service.
 */
interface CfService {
  name: string;
  service: string;
  environment: string;
}

export interface CfDurableObjectMigrations {
  old_tag?: string;
  new_tag: string;
  steps: {
    new_classes?: string[];
    renamed_classes?: string[];
    deleted_classes?: string[];
  }[];
}

/**
 * Options for creating a `CfWorker`.
 */
export interface CfWorkerInit {
  /**
   * The name of the worker.
   */
  name: string | void;
  /**
   * The entrypoint module.
   */
  main: CfModule;
  /**
   * The list of additional modules.
   */
  modules: void | CfModule[];
  /**
   * All the bindings
   */
  bindings: {
    kv_namespaces?: CfKvNamespace[];
    durable_objects?: { bindings: CfDurableObject[] };
    vars?: CfVars;
    services?: CfService[];
  };
  migrations: void | CfDurableObjectMigrations;
  compatibility_date: string | void;
  compatibility_flags: void | string[];
  usage_model: void | "bundled" | "unbound";
}

/**
 * A stub to create a Cloudflare Worker preview.
 *
 * @example
 * const {value, host} = await createWorker(init, acct);
 */
export async function createWorker(
  init: CfWorkerInit,
  account: CfAccount
): Promise<CfPreviewToken> {
  const token = await previewToken(account, init);
  const response = await fetch(token.prewarmUrl.href, { method: "POST" });
  if (!response.ok) {
    // console.error("worker failed to prewarm: ", response.statusText);
  }
  return token;
}
