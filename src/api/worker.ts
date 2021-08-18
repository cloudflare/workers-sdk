import type { Response, RequestInit } from "node-fetch";
import type { CfPreviewToken } from "./preview";
import { previewToken } from "./preview";
import { DtInspector } from "./inspect";
import type { Fetch } from "../util/fetch";
import { fetchIt } from "../util/fetch";
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
  modules?: CfModule[];
  /**
   * The map of names to variables. (aka. environment variables)
   */
  variables?: { [name: string]: CfVariable };
}

/**
 * A stub to preview a Cloudflare Worker.
 *
 * @example
 * const worker: CfWorker
 * const response = await worker.fetch('/', { method: 'GET' })
 *
 * console.log(response.statusText)
 */
export class CfWorker {
  #init: CfWorkerInit;
  #acct: CfAccount;
  #token?: CfPreviewToken;
  #fetch?: Fetch;
  #inspector?: DtInspector;

  /**
   * Creates a Cloudflare Worker stub.
   */
  constructor(init: CfWorkerInit, account: CfAccount) {
    this.#init = init;
    // TODO(someday): remove account requirement and use unauthenticated preview
    this.#acct = account;
  }

  /**
   * Sends a `fetch()` request to the Worker.
   */
  async fetch(input: string, init?: RequestInit): Promise<Response> {
    if (!this.#fetch) {
      await this.refresh();
    }
    return await this.#fetch(input, init);
  }

  /**
   * Creates a DevTools inspector to listen for logs and debug events.
   */
  async inspect(): Promise<DtInspector> {
    if (this.#inspector) {
      return this.#inspector;
    }
    if (!this.#fetch) {
      await this.refresh();
    }
    const { inspectorUrl } = this.#token;
    return (this.#inspector = new DtInspector(inspectorUrl.href));
  }

  /**
   * Refreshes the stub.
   */
  private async refresh(): Promise<void> {
    this.#token = await previewToken(this.#acct, this.#init);
    const { host, value, prewarmUrl } = this.#token;
    this.#fetch = fetchIt({
      host,
      headers: {
        "cf-workers-preview-token": value,
      },
    });
    await fetch(prewarmUrl.href, { method: "POST" });
  }

  /**
   * Closes the stub.
   */
  close(): void {
    this.#token = undefined;
    this.#fetch = undefined;
    if (this.#inspector) {
      this.#inspector.close();
      this.#inspector = undefined;
    }
  }
}
