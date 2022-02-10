import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { CfModule, CfScriptFormat } from "./api/worker";
import type esbuild from "esbuild";

// This is a combination of an esbuild plugin and a mutable array
// that we use to collect module references from source code.
// There will be modules that _shouldn't_ be inlined directly into
// the bundle. (eg. wasm modules, some text files, etc). We can include
// those files as modules in the multi part forker form upload. This
// plugin+array is used to collect references to these modules, reference
// them correctly in the bundle, and add them to the form upload.

export default function makeModuleCollector(props: {
  format: CfScriptFormat;
}): {
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
          // reset the module collection array
          modules.splice(0);
        });

        build.onResolve(
          // filter on "known" file types,
          // we can expand this list later
          { filter: /.*\.(wasm)$/ },
          async (args: esbuild.OnResolveArgs) => {
            // take the file and massage it to a
            // transportable/manageable format
            const filePath = path.join(args.resolveDir, args.path);
            const fileContent = await readFile(filePath);
            const fileHash = crypto
              .createHash("sha1")
              .update(fileContent)
              .digest("hex");
            const fileName = `${fileHash}-${path.basename(args.path)}`;

            // add the module to the array
            modules.push({
              name: "./" + fileName,
              content: fileContent,
              type: "compiled-wasm",
            });

            return {
              path: "./" + fileName, // change the reference to the changed module
              external: props.format === "modules", // mark it as external in the bundle
              namespace: "wrangler-module-collector-ns", // just a tag, this isn't strictly necessary
              watchFiles: [filePath], // we also add the file to esbuild's watch list
            };
          }
        );

        if (props.format !== "modules") {
          build.onLoad(
            { filter: /.*\.(wasm)$/ },
            async (args: esbuild.OnLoadArgs) => {
              return {
                // We replace the the wasm module with an identifier
                // that we'll separately add to the form upload
                // as part of [wasm_modules]. This identifier has to be a valid
                // JS identifier, so we replace all non alphanumeric characters
                // with an underscore.
                contents: `export default ${args.path.replace(
                  /[^a-zA-Z0-9_$]/g,
                  "_"
                )};`,
              };
            }
          );
        }
      },
    },
  };
}
