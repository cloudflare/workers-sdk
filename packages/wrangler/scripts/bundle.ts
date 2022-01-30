import { build } from "esbuild";
import path from "path";

// the expectation is that this is being run from the project root

async function run() {
  // miniflare cli for `wrangler dev --local`
  await build({
    entryPoints: ["miniflare/cli"],
    bundle: true,
    platform: "node",
    outdir: "./miniflare-dist",
    minify: true,
    format: "cjs",
    target: "esnext",
    // html-rewriter-wasm has a wasm dependency and expects to have the .wasm file in the same output folder. Further, it also expects an asyncify.js file in the same folder, which esbuild doesn't bundle because it's required using require(String.raw`./asyncify.js`). So we mark it as an external right now, and we'll revisit it later.
    external: ["@miniflare/storage-redis", "html-rewriter-wasm"],
  });

  // main cli
  await build({
    entryPoints: ["./src/cli.ts"],
    bundle: true,
    outdir: "./wrangler-dist",
    platform: "node",
    format: "cjs",
    external: [
      "fsevents",
      "esbuild",
      "xxhash-addon",
      "@miniflare/storage-redis",
      // html-rewriter-wasm has a wasm dependency and expects to have the .wasm file in the same output folder. Further, it also expects an asyncify.js file in the same folder, which esbuild doesn't bundle because it's required using require(String.raw`./asyncify.js`). So we mark it as an external right now, and we'll revisit it later.
      "html-rewriter-wasm",
    ],
    sourcemap: true,
    inject: [path.join(__dirname, "../import_meta_url.js")],
    define: {
      "import.meta.url": "import_meta_url",
    },
  });
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
