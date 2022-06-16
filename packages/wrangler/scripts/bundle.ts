import path from "node:path";
import { build } from "esbuild";
import type { WatchMode } from "esbuild";

// the expectation is that this is being run from the project root
type BuildFlags = {
  watch?: boolean;
};

function watchLogger(project: string): WatchMode {
  return {
    onRebuild(error, _) {
      if (error) console.error(`${project} build failed.\n`, error);
    },
  };
}

async function buildMain(flags: BuildFlags = {}) {
  await build({
    entryPoints: ["./src/cli.ts"],
    bundle: true,
    outdir: "./wrangler-dist",
    platform: "node",
    format: "cjs",
    external: [
      "fsevents",
      "esbuild",
      "blake3-wasm",
      "miniflare",
      "@miniflare/core",
      // todo - bundle miniflare too
      "selfsigned",
      "@esbuild-plugins/node-globals-polyfill",
      "@esbuild-plugins/node-modules-polyfill",
    ],
    sourcemap: process.env.SOURCEMAPS !== "false",
    inject: [path.join(__dirname, "../import_meta_url.js")],
    define: {
      "import.meta.url": "import_meta_url",
      "process.env.NODE_ENV": '"production"',
    },
    watch: flags.watch ? watchLogger("Wrangler") : false,
  });
}

async function buildMiniflareCLI(flags: BuildFlags = {}) {
  await build({
    entryPoints: ["./src/miniflare-cli/index.ts"],
    bundle: true,
    outfile: "./miniflare-dist/index.mjs",
    platform: "node",
    format: "esm",
    external: ["miniflare", "@miniflare/core"],
    sourcemap: process.env.SOURCEMAPS !== "false",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    watch: flags.watch ? watchLogger("Miniflare") : false,
  });
}

async function run() {
  // main cli
  await buildMain();

  // custom miniflare cli
  await buildMiniflareCLI();

  console.log("Built wrangler & Miniflare CLI.");

  // After built once completely, rerun them both in watch mode
  if (process.argv.includes("--watch")) {
    console.log("Watching for changes...");
    await Promise.all([
      buildMain({ watch: true }),
      buildMiniflareCLI({ watch: true }),
    ]);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
