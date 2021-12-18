import path from "path";
import { build } from "esbuild";
import { fileURLToPath } from "url";
const __dirname = fileURLToPath(path.dirname(import.meta.url));

type Options = {
  routesModule: string;
  outfile: string;
  minify?: boolean;
  watch?: boolean;
};

export function buildWorker({
  routesModule,
  outfile = "bundle.js",
  minify = false,
  watch = false,
}: Options) {
  console.log(`Compiling worker to "${outfile}"`);
  return build({
    entryPoints: [
      path.resolve(
        __dirname,
        "../templates/pages-functions-compiler.worker.ts"
      ),
    ],
    inject: [routesModule],
    bundle: true,
    format: "esm",
    target: "esnext",
    outfile,
    minify,
    watch,
    allowOverwrite: true,
  });
}
