import path from "path";
import { build } from "esbuild";
import { fileURLToPath } from "url";

let sanitizedDirname;
try {
  sanitizedDirname = path.dirname(fileURLToPath(import.meta.url));
} catch {
  sanitizedDirname = __dirname;
}

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
      path.resolve(sanitizedDirname, "../pages/functions/template-worker.ts"),
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
