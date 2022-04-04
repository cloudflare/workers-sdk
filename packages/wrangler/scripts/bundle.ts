import path from "node:path";
import { build } from "esbuild";

// the expectation is that this is being run from the project root

async function run() {
  // main cli
  await build({
    entryPoints: ["./src/cli.ts"],
    bundle: true,
    outdir: "./wrangler-dist",
    platform: "node",
    format: "cjs",
    // minify: true, // TODO: enable this again
    external: [
      "fsevents",
      "esbuild",
      "miniflare",
      "@miniflare/core",
      "selfsigned",
    ], // todo - bundle miniflare too
    sourcemap: true,
    inject: [path.join(__dirname, "../import_meta_url.js")],
    define: {
      "import.meta.url": "import_meta_url",
    },
  });

  // custom miniflare cli
  await build({
    entryPoints: ["./src/miniflare-cli/index.ts"],
    bundle: true,
    outfile: "./miniflare-dist/index.mjs",
    platform: "node",
    format: "esm",
    minify: true,
    external: ["miniflare", "@miniflare/core"],
    sourcemap: true,
  });
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
