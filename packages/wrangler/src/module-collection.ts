import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import globToRegExp from "glob-to-regexp";
import type { Config, ConfigModuleRuleType } from "./config";
import type { CfModule, CfModuleType, CfScriptFormat } from "./worker";
import type esbuild from "esbuild";

const RuleTypeToModuleType: Record<ConfigModuleRuleType, CfModuleType> = {
  ESModule: "esm",
  CommonJS: "commonjs",
  CompiledWasm: "compiled-wasm",
  Data: "buffer",
  Text: "text",
};

// This is a combination of an esbuild plugin and a mutable array
// that we use to collect module references from source code.
// There will be modules that _shouldn't_ be inlined directly into
// the bundle. (eg. wasm modules, some text files, etc). We can include
// those files as modules in the multi part worker form upload. This
// plugin+array is used to collect references to these modules, reference
// them correctly in the bundle, and add them to the form upload.

export const DEFAULT_MODULE_RULES: Config["rules"] = [
  { type: "Text", globs: ["**/*.txt", "**/*.html"] },
  { type: "Data", globs: ["**/*.bin"] },
  { type: "CompiledWasm", globs: ["**/*.wasm"] },
];

export default function makeModuleCollector(props: {
  format: CfScriptFormat;
  rules?: Config["rules"];
}): {
  modules: CfModule[];
  plugin: esbuild.Plugin;
} {
  const rules: Config["rules"] = [
    ...(props.rules || []),
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    ...DEFAULT_MODULE_RULES!,
  ];

  const completedRuleLocations: Record<string, number> = {};
  let index = 0;
  const rulesToRemove: Config["rules"] = [];
  for (const rule of rules) {
    if (rule.type in completedRuleLocations) {
      if (rules[completedRuleLocations[rule.type]].fallthrough !== false) {
        if (index < (props.rules || []).length) {
          console.warn(
            `The module rule at position ${index} (${JSON.stringify(
              rule
            )}) has the same type as a previous rule (at position ${
              completedRuleLocations[rule.type]
            }, ${JSON.stringify(
              rules[completedRuleLocations[rule.type]]
            )}). This rule will be ignored. To the previous rule, add \`fallthrough = true\` to allow this one to also be used, or \`fallthrough = false\` to silence this warning.`
          );
        } else {
          console.warn(
            `The default module rule ${JSON.stringify(
              rule
            )} has the same type as a previous rule (at position ${
              completedRuleLocations[rule.type]
            }, ${JSON.stringify(
              rules[completedRuleLocations[rule.type]]
            )}). This rule will be ignored. To the previous rule, add \`fallthrough = true\` to allow the default one to also be used, or \`fallthrough = false\` to silence this warning.`
          );
        }
      }

      rulesToRemove.push(rule);
    }
    if (!(rule.type in completedRuleLocations) && rule.fallthrough !== true) {
      completedRuleLocations[rule.type] = index;
    }
    index++;
  }

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  rulesToRemove.forEach((rule) => rules!.splice(rules!.indexOf(rule), 1));

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

        rules?.forEach((rule) => {
          if (rule.type === "ESModule" || rule.type === "CommonJS") return; // TODO: we should treat these as js files, and use the jsx loader

          rule.globs.forEach((glob) => {
            build.onResolve(
              { filter: globToRegExp(glob) },
              async (args: esbuild.OnResolveArgs) => {
                // take the file and massage it to a
                // transportable/manageable format

                const filePath = path.join(args.resolveDir, args.path);
                const fileContent = await readFile(filePath);
                const fileHash = crypto
                  .createHash("sha1")
                  .update(fileContent)
                  .digest("hex");
                const fileName = `./${fileHash}-${path.basename(args.path)}`;

                // add the module to the array
                modules.push({
                  name: fileName,
                  content: fileContent,
                  type: RuleTypeToModuleType[rule.type],
                });

                return {
                  path: fileName, // change the reference to the changed module
                  external: props.format === "modules", // mark it as external in the bundle
                  namespace: `wrangler-module-${rule.type}`, // just a tag, this isn't strictly necessary
                  watchFiles: [filePath], // we also add the file to esbuild's watch list
                };
              }
            );

            if (props.format === "service-worker") {
              build.onLoad(
                { filter: globToRegExp(glob) },
                async (args: esbuild.OnLoadArgs) => {
                  return {
                    // We replace the the module with an identifier
                    // that we'll separately add to the form upload
                    // as part of [wasm_modules]/[text_blobs]. This identifier has to be a valid
                    // JS identifier, so we replace all non alphanumeric characters
                    // with an underscore.
                    // TODO: what of "Data"?
                    contents: `export default ${args.path.replace(
                      /[^a-zA-Z0-9_$]/g,
                      "_"
                    )};`,
                  };
                }
              );
            }
          });
        });

        rulesToRemove.forEach((rule) => {
          rule.globs.forEach((glob) => {
            build.onResolve(
              { filter: globToRegExp(glob) },
              async (args: esbuild.OnResolveArgs) => {
                throw new Error(
                  `The file ${
                    args.path
                  } matched a module rule in your configuration (${JSON.stringify(
                    rule
                  )}), but was ignored because a previous rule with the same type was not marked as \`fallthrough = true\`.`
                );
              }
            );
          });
        });
      },
    },
  };
}
