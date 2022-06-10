import { access, lstat } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import NodeGlobalsPolyfills from "@esbuild-plugins/node-globals-polyfill";
import NodeModulesPolyfills from "@esbuild-plugins/node-modules-polyfill";
import { build } from "esbuild";

type Options = {
  routesModule: string;
  outfile: string;
  minify?: boolean;
  sourcemap?: boolean;
  watch?: boolean;
  nodeCompat?: boolean;
  onEnd?: () => void;
};

export function buildPlugin({
  routesModule,
  outfile = "bundle.js",
  minify = false,
  sourcemap = false,
  watch = false,
  nodeCompat,
  onEnd = () => {},
}: Options) {
  return build({
    entryPoints: [resolve(__dirname, "../pages/functions/template-plugin.ts")],
    inject: [routesModule],
    bundle: true,
    format: "esm",
    target: "esnext",
    outfile,
    minify,
    sourcemap,
    watch,
    allowOverwrite: true,
    define: { ...(nodeCompat ? { global: "globalThis" } : {}) },
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
      {
        name: "Assets",
        setup(pluginBuild) {
          if (pluginBuild.initialOptions.outfile) {
            const outdir = dirname(pluginBuild.initialOptions.outfile);

            pluginBuild.onResolve({ filter: /^assets:/ }, async (args) => {
              const directory = resolve(
                args.resolveDir,
                args.path.slice("assets:".length)
              );

              const exists = await access(directory)
                .then(() => true)
                .catch(() => false);

              const isDirectory =
                exists && (await lstat(directory)).isDirectory();

              if (!isDirectory) {
                return {
                  errors: [
                    {
                      text: `'${directory}' does not exist or is not a directory.`,
                    },
                  ],
                };
              }

              const path = `assets:./${relative(outdir, directory)}`;

              return { path, external: true, namespace: "assets" };
            });
          }
        },
      },
      ...(nodeCompat
        ? [
            NodeGlobalsPolyfills({
              buffer: true,
            }),
            NodeModulesPolyfills(),
          ]
        : []),
    ],
  });
}
