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
 * A KV namespace.
 */
export interface CfKvNamespace {
  /**
   * The namespace ID.
   */
  namespaceId: string;
}

/**
 * A `WebCrypto` key.
 *
 * @link https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/importKey
 */
export interface CfCryptoKey {
  /**
   * The format.
   */
  format: string;
  /**
   * The algorithm.
   */
  algorithm: string;
  /**
   * The usages.
   */
  usages: string[];
  /**
   * The data.
   */
  data: BufferSource | JsonWebKey;
}

/**
 * A variable (aka. environment variable).
 */
export type CfVariable = string | CfKvNamespace | CfCryptoKey;

/**
 * Options for creating a `CfWorker`.
 */
export interface CfWorkerInit {
  /**
   * The entrypoint module.
   */
  main: CfModule;
  /**
   * The list of additional modules.
   */
  modules: void | CfModule[];
  /**
   * The map of names to variables. (aka. environment variables)
   */
  variables?: { [name: string]: CfVariable };
  compatibility_date?: string;
  usage_model?: void | "bundled" | "unbound";
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
