import path from "path";
import { build } from "esbuild";
import { replace } from "esbuild-plugin-replace";

type Options = {
  routesModule: string;
  outfile: string;
  minify?: boolean;
  sourcemap?: boolean;
  fallbackService?: string;
  watch?: boolean;
  onEnd?: () => void;
};

export function buildWorker({
  routesModule,
  outfile = "bundle.js",
  minify = false,
  sourcemap = false,
  fallbackService = "ASSETS",
  watch = false,
  onEnd = () => {},
}: Options) {
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
    plugins: [
      replace({
        __FALLBACK_SERVICE_FETCH__: fallbackService
          ? `env.${fallbackService}.fetch`
          : "fetch",
      }),
      {
        name: "wrangler notifier and monitor",
        setup(pluginBuild) {
          pluginBuild.onEnd((result) => {
            if (result.errors.length > 0) {
              console.error(
                `${result.errors.length} error(s) and ${result.warnings.length} warning(s) when compiling Worker.`
              );
            } else if (result.warnings.length > 0) {
              console.warn(
                `${result.warnings.length} warning(s) when compiling Worker.`
              );
              onEnd();
            } else {
              console.log("Compiled Worker successfully.");
              onEnd();
            }
          });
        },
      },
    ],
  });
}
