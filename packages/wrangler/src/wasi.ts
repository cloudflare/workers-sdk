import { realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import tmp from "tmp-promise";

function makeEntrypoint(wasmPath: string, modulePath: string): string {
  const name = path.basename(wasmPath);

  // Allow setting cli arguments by putting WRANGLER_EXPERIMENTAL_WASM_ARGS=foo=bar,baz in wrangler
  // environment, e.g., WRANGLER_EXPERIMENTAL_WASM_ARGS=foo=bar,baz -> hello.wasm foo=bar baz
  const argsPrefix = "WRANGLER_EXPERIMENTAL_WASM_ARGS";
  const args = process.env[argsPrefix]?.split(",") ?? [];

  // Allow setting env variables by putting WRANGLER_EXPERIMENTAL_WASM_ENV_xyz in wrangler
  // environment, e.g., WRANGLER_EXPERIMENTAL_WASM_ENV_FOO=baz -> FOO=baz
  const envPrefix = "WRANGLER_EXPERIMENTAL_WASM_ENV_";
  const env = Object.fromEntries(
    Object.entries(process.env)
      .filter(([k, _v]) => {
        return k.startsWith(envPrefix);
      })
      .map(([k, v]) => {
        return [k.substring(envPrefix.length), v];
      })
  );

  // Allow setting the response content type variables by putting WRANGLER_WASM_RESPONSE_CONTENT_TYPE
  // in wrangler environment, eg. WRANGLER_EXPERIMENTAL_WASM_RESPONSE_CONTENT_TYPE=application/zstd
  const responseContentTypeKey =
    "WRANGLER_EXPERIMENTAL_WASM_RESPONSE_CONTENT_TYPE";
  const contentType = process.env[responseContentTypeKey]
    ? { "content-type": process.env[responseContentTypeKey] }
    : {};

  return `
import { WASI } from '${modulePath}';
import wasm from '${wasmPath}';
export default {
  async fetch(request, environment, context) {
    const stdout = new TransformStream()
    const wasi = new WASI({
       args: ${JSON.stringify([name, ...args])},
       env: ${JSON.stringify(env)},
       stdout: stdout.writable,
       stdin: request.body,
       streamStdio: false
    });
    const instance = new WebAssembly.Instance(wasm, {
       wasi_snapshot_preview1: wasi.wasiImport,
    });
    const promise = wasi.start(instance);
    const response = new Response(stdout.readable, {
      headers: {
        ...${JSON.stringify(contentType)}
      }
    })
    context.waitUntil(promise)
    return response
  }
}
`;
}

export async function wrapIfWasmEntrypoint(
  entrypoint: string
): Promise<string> {
  if (path.extname(entrypoint) !== ".wasm") {
    return entrypoint;
  }
  const scratch = await realpath((await tmp.dir({ unsafeCleanup: true })).path);

  // We want to ship '@cloudflare/workers-wasi' with wrangler and include from the generated
  // bundle, so we mark as external in the wrangler build process and ask node for the path
  const absModulePath = require.resolve("@cloudflare/workers-wasi");
  const importPath = path.relative(scratch, entrypoint);
  const modulePath = path.relative(scratch, absModulePath);
  const generated = path.join(scratch, "index.mjs");
  await writeFile(generated, makeEntrypoint(importPath, modulePath));
  return path.relative(process.cwd(), generated);
}
