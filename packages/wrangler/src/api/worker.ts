import { fetch } from "undici";
import { previewToken } from "./preview";
import type { CfPreviewToken } from "./preview";

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
 * The type of Worker
 */
export type CfScriptFormat = "modules" | "service-worker";

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
  content: string | Buffer;
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
 * A binding to a wasm module (in service worker format)
 */

interface CfWasmModuleBindings {
  [key: string]: string;
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

interface CfUnsafeBinding {
  name: string;
  type: string;
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
  name: string | undefined;
  /**
   * The entrypoint module.
   */
  main: CfModule;
  /**
   * The list of additional modules.
   */
  modules: undefined | CfModule[];
  /**
   * All the bindings
   */
  bindings: {
    vars?: CfVars;
    kv_namespaces?: CfKvNamespace[];
    wasm_modules?: CfWasmModuleBindings;
    durable_objects?: { bindings: CfDurableObject[] };
    services?: CfService[];
    unsafe?: CfUnsafeBinding[];
  };
  migrations: undefined | CfDurableObjectMigrations;
  compatibility_date: string | undefined;
  compatibility_flags: undefined | string[];
  usage_model: undefined | "bundled" | "unbound";
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
