import esbuild from "esbuild";

// the expectation is that this is being run from the project root

async function run() {
  const result = await esbuild.build({
    entryPoints: ["./src/index_node.ts"],
    bundle: true,
    outdir: "./wrangler-dist",
    platform: "node",
    format: "cjs",
    // minify: true, // TODO: enable this again
    external: [
      "fsevents",
      "yargs", // we should fix this one
      "esbuild",
      "miniflare", // only because it imports all of typescript, which is weird
    ],
    sourcemap: true,
  });
}

run();
