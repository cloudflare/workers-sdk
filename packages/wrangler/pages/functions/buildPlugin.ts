import { resolve } from "node:path";
import { build } from "esbuild";

// See scripts/file-loader-transform.ts to understand what is happening here.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const templatePluginPath = require("./plugin.template.ts");

type Options = {
  routesModule: string;
  outfile: string;
  minify?: boolean;
  sourcemap?: boolean;
  watch?: boolean;
  onEnd?: () => void;
};

export function buildPlugin({
  routesModule,
  outfile = "bundle.js",
  minify = false,
  sourcemap = false,
  watch = false,
  onEnd = () => {},
}: Options) {
  return build({
    entryPoints: [resolve(__dirname, templatePluginPath)],
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
