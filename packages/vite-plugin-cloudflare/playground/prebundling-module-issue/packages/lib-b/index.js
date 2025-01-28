import * as libA from "@packages/lib-a";

if (libA.context !== globalThis.context) {
    throw new Error('context mismatch');
}

export const msg = 'Hello from lib-b';
