import type { CfModule } from "./api/worker";
import type esbuild from "esbuild";
import path from "node:path";
import { readFile } from "node:fs/promises";
import crypto from "node:crypto";

// This is a combination of an esbuild plugin and a mutable array
// that we use to collect module references from source code.
// There will be modules that _shouldn't_ be inlined directly into
// the bundle. (eg. wasm modules, some text files, etc). We can include
// those files as modules in the multi part forker form upload. This
// plugin+array is used to collect references to these modules, reference
// them correctly in the bundle, and add them to the form upload.

export default function makeModuleCollector(): {
  modules: CfModule[];
  plugin: esbuild.Plugin;
} {
  const modules: CfModule[] = [];
  return {
    modules,
    plugin: {
      name: "wrangler-module-collector",
      setup(build) {
        build.onStart(() => {
          // reset the moduels collection
          modules.splice(0);
        });

        build.onResolve(
          // filter on "known" file types,
          // we can expand this list later
          { filter: /.*\.(pem|txt|html|wasm)$/ },
          async (args: esbuild.OnResolveArgs) => {
            // take the file and massage it to a
            // transportable/manageable format
            const fileExt = path.extname(args.path);
            const filePath = path.join(args.resolveDir, args.path);
            const fileContent = await readFile(filePath);
            const fileHash = crypto
              .createHash("sha1")
              .update(fileContent)
              .digest("hex");
            const fileName = `${fileHash}-${path.basename(args.path)}`;

            // add the module to the array
            modules.push({
              name: fileName,
              content: fileContent,
              type: fileExt === ".wasm" ? "compiled-wasm" : "text",
            });

            return {
              path: fileName, // change the reference to the changed module
              external: true, // mark it as external in the bundle
              namespace: "wrangler-module-collector-ns", // just a tag, this isn't strictly necessary
              watchFiles: [filePath], // we also add the file to esbuild's watch list
            };
          }
        );
      },
    },
  };
}
