import path from "path";
import { build } from "esbuild";

type Options = {
  routesModule: string;
  outfile: string;
  minify?: boolean;
  sourcemap?: boolean;
  watch?: boolean;
};

export function buildWorker({
  routesModule,
  outfile = "bundle.js",
  minify = false,
  sourcemap = false,
  watch = false,
}: Options) {
  console.log(`Compiling worker to "${outfile}"`);
  return build({
    entryPoints: [
      path.resolve(__dirname, "../pages/functions/template-worker.ts"),
    ],
    inject: [routesModule],
    bundle: true,
    format: "esm",
    target: "esnext",
    outfile,
    minify,
    sourcemap,
    watch,
    allowOverwrite: true,
  });
}
