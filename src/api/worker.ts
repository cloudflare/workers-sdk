import type { CfPreviewToken } from "./preview";
import { previewToken } from "./preview";
import { DtInspector } from "./inspect";
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
 * const worker = new CfWorker(init, acct);
 * const {value, host} = await worker.initialise();
 */
export class CfWorker {
  #init: CfWorkerInit;
  #acct: CfAccount;
  #token?: CfPreviewToken;
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
   * Creates a DevTools inspector to listen for logs and debug events.
   */
  async inspect(): Promise<DtInspector> {
    if (this.#inspector) {
      return this.#inspector;
    }
    if (!this.#token) {
      throw new Error(
        "This worker hasn't been initialised yet, please call .initialise()"
      );
    }
    const { inspectorUrl } = this.#token;
    this.#inspector = new DtInspector(inspectorUrl.href);
    return this.#inspector;
  }

  /**
   * Initialises the stub.
   */
  private initialising: Promise<CfPreviewToken> | null = null;
  async initialise(): Promise<CfPreviewToken> {
    if (!this.initialising) {
      this.#token = undefined;
      let resolve: (CfPreviewToken) => void, reject: (Error) => void;
      this.initialising = new Promise<CfPreviewToken>((_resolve, _reject) => {
        resolve = _resolve;
        reject = _reject;
      });
      try {
        this.#token = await previewToken(this.#acct, this.#init);
        await fetch(this.#token.prewarmUrl.href, { method: "POST" });
        resolve(this.#token);
        this.initialising = undefined;
        return this.#token;
      } catch (err) {
        reject(err);
        throw err;
      }
    } else {
      return this.initialising;
    }
  }

  /**
   * Closes the stub.
   */
  close(): void {
    this.#token = undefined;
    if (this.#inspector) {
      this.#inspector.close();
      this.#inspector = undefined;
    }
  }
}
