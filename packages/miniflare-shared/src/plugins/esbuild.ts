import { BuildContext, BuildOptions, Plugin, context } from 'esbuild'
import path, { join } from 'path';
import fs from 'node:fs/promises'

/**
 * `workerd` `extensions` don't have access to "built-in" modules like
 * `node:buffer`, but do have access to "internal" modules like
 * `node-internal:internal_buffer`, which usually provide the same exports.
 * So that we can use `node:assert` and `node:buffer` in our shared extension,
 * rewrite built-in names to internal.
 * @type {esbuild.Plugin}
 */
export const rewriteNodeToInternalPlugin: Plugin = {
    name: "rewrite-node-to-internal",
    setup(build) {
        build.onResolve({ filter: /^node:(assert|buffer)$/ }, async (args) => {
            const module = args.path.substring("node:".length);
            return { path: `node-internal:internal_${module}`, external: true };
        });
    },
};

type EmbedWorkersOptions = {
    /**
     * workersRootDir is a path to a directory containing external Workers that
     * will be bundled
     */
    workersRootDir: string,
    workerOutputDir: string,
    writeMetafiles: boolean,
}

/**
 * embedWorkerPlugin is an ESBuild plugin that will look for imports to Workers specified by `worker:`
 * and bundle them into the final output.
 */
export const embedWorkersPlugin: (options: EmbedWorkersOptions) => Plugin = ({
    workerOutputDir,
    workersRootDir,
    writeMetafiles = true,
}) => {
    const workersBuilders: Map<string, BuildContext<BuildOptions>> = new Map();
    return {
        name: "embed-workers",
        setup(build) {
            const namespace = "embed-worker";
            // For imports prefixed with `worker:`, attempt to resolve them from a directory containing
            // your Workers
            build.onResolve({ filter: /^worker:/ }, async (args) => {
                let name = args.path.substring("worker:".length);
                // Allow `.worker` to be omitted
                if (!name.endsWith(".worker")) name += ".worker";
                // Use `build.resolve()` API so Workers can be written as `m?[jt]s` files
                const result = await build.resolve("./" + name, {
                    kind: "import-statement",
                    // Resolve relative to the directory containing the Workers
                    resolveDir: workersRootDir,
                });
                if (result.errors.length > 0) return { errors: result.errors };
                return { path: result.path, namespace };
            });
            build.onLoad({ filter: /.*/, namespace }, async (args) => {
                let builder = workersBuilders.get(args.path);
                if (builder === undefined) {
                    builder = await context({
                        platform: "node", // Marks `node:*` imports as external
                        format: "esm",
                        target: "esnext",
                        bundle: true,
                        sourcemap: true,
                        sourcesContent: false,
                        external: ["miniflare:shared", "miniflare:zod", "cloudflare:workers"],
                        metafile: writeMetafiles,
                        entryPoints: [args.path],
                        minifySyntax: true,
                        outdir: workerOutputDir,
                        plugins: [rewriteNodeToInternalPlugin],
                    });
                }

                const metafile = (await builder.rebuild()).metafile;
                workersBuilders.set(args.path, builder);
                if (writeMetafiles) {
                    const metadir = join(workerOutputDir ?? '.', 'worker-metafiles')
                    console.log(metadir)
                    await fs.mkdir(metadir, { recursive: true });
                    await fs.writeFile(
                        path.join(
                            metadir,
                            path.basename(args.path) + ".metafile.json"
                        ),
                        JSON.stringify(metafile)
                    );
                }
                let outPath = args.path.substring(workersRootDir.length + 1);
                outPath = outPath.substring(0, outPath.lastIndexOf(".")) + ".js";
                outPath = JSON.stringify(outPath);
                const contents = `
      import fs from "fs";
      import path from "path";
      import url from "url";
      let contents;
      export default function() {
         if (contents !== undefined) return contents;
         const filePath = path.join(__dirname, "workers", ${outPath});
         contents = fs.readFileSync(filePath, "utf8") + "//# sourceURL=" + url.pathToFileURL(filePath);
         return contents;
      }
      `;
                builder.dispose()
                return { contents, loader: "js" };
            });
        },
    }
}