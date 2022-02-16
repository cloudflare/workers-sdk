import * as fs from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import TOML from "@iarna/toml";
import { findUp } from "find-up";
import { render } from "ink";
import React from "react";
import onExit from "signal-exit";
import makeCLI from "yargs";
import { version as wranglerVersion } from "../package.json";
import { toFormData } from "./api/form_data";
import { fetchResult } from "./cfetch";
import { normaliseAndValidateEnvironmentsConfig } from "./config";
import Dev from "./dev";
import { confirm, prompt } from "./dialogs";
import {
  getNamespaceId,
  listNamespaces,
  listNamespaceKeys,
  putKeyValue,
  putBulkKeyValue,
  deleteBulkKeyValue,
  createNamespace,
  isValidNamespaceBinding,
  getKeyValue,
} from "./kv";
import { getPackageManager } from "./package-manager";
import { pages } from "./pages";
import publish from "./publish";
import { createR2Bucket, deleteR2Bucket, listR2Buckets } from "./r2";
import { getAssetPaths } from "./sites";
import {
  createTail,
  jsonPrintLogs,
  prettyPrintLogs,
  translateCliCommandToApiFilterMessage,
} from "./tail";
import {
  login,
  logout,
  listScopes,
  initialise as initialiseUserConfig,
  loginOrRefreshIfRequired,
  getAccountId,
  validateScopeKeys,
} from "./user";
import { whoami } from "./whoami";

import type { Entry } from "./bundle";
import type { Config } from "./config";
import type { CliFilters as TailCLIFilters } from "./tail";
import type { RawData } from "ws";
import type Yargs from "yargs";

const resetColor = "\x1b[0m";
const fgGreenColor = "\x1b[32m";

// a set of binding types that are known to be supported by wrangler
const knownBindings = [
  "plain_text",
  "json",
  "kv_namespace",
  "durable_object_namespace",
];

type ConfigPath = string | undefined;

async function findWranglerToml(
  referencePath: string = process.cwd()
): Promise<ConfigPath> {
  const configPath = await findUp("wrangler.toml", { cwd: referencePath });
  return configPath;
}

async function readConfig(configPath?: string): Promise<Config> {
  const config: Config = {};
  if (!configPath) {
    configPath = await findWranglerToml();
  }

  if (configPath) {
    const tml: string = await readFile(configPath, "utf-8");
    const parsed = TOML.parse(tml) as Config;
    Object.assign(config, parsed);
  }

  normaliseAndValidateEnvironmentsConfig(config);

  // The field "experimental_services" doesn't exist anymore
  // in the config, but we still want to error about any older usage.
  // TODO: remove this error before GA.
  if ("experimental_services" in config) {
    throw new Error(
      `The "experimental_services" field is no longer supported. Instead, use [[unsafe.bindings]] to enable experimental features. Add this to your wrangler.toml:

${TOML.stringify({
  unsafe: {
    bindings: (config.experimental_services || []).map((serviceDefinition) => {
      return {
        name: serviceDefinition.name,
        type: "service",
        service: serviceDefinition.service,
        environment: serviceDefinition.environment,
      };
    }),
  },
})}`
    );
  }

  if (configPath && "wasm_modules" in config) {
    // rewrite wasm_module paths to be absolute
    const modules: Record<string, string> = {};
    for (const [name, filePath] of Object.entries(config.wasm_modules || {})) {
      modules[name] = path.relative(
        process.cwd(),
        path.join(path.dirname(configPath), filePath)
      );
    }
    config.wasm_modules = modules;
  }

  if ("unsafe" in config) {
    console.warn(
      "'unsafe' fields are experimental and may change or break at any time."
    );
  }

  // todo: validate, add defaults
  // let's just do some basics for now

  for (const binding of config.unsafe?.bindings ?? []) {
    if (knownBindings.includes(binding.type)) {
      console.warn(
        `Raw '${binding.type}' bindings are not directly supported by wrangler. Consider migrating to a ` +
          `format for '${binding.type}' bindings that is supported by wrangler for optimal support: ` +
          "https://developers.cloudflare.com/workers/cli-wrangler/configuration"
      );
    }
  }

  // @ts-expect-error we're being sneaky here
  config.__path__ = configPath;

  return config;
}

function getEntry(
  args: { _: (string | number)[]; script: string | undefined },
  config: Config
): Entry {
  // @ts-expect-error a hidden field
  const wranglerTomlPath = config.__path__;
  let file: string;
  let directory = process.cwd();
  if (args.script) {
    // If the script name comes from the command line it is relative to the current working directory.
    file = path.resolve(args.script);
  } else {
    // If the script name comes from the config, then it is relative to the wrangler.toml file.
    if (config.build?.upload?.main === undefined) {
      throw new Error(
        `Missing entry-point: The entry-point should be specified via the command line (e.g. \`wrangler ${args._[0]} path/to/script\`) or the \`build.upload.main\` config field.`
      );
    }
    directory = path.resolve(
      path.dirname(wranglerTomlPath),
      config.build.upload.dir || ""
    );
    file = path.resolve(directory, config.build.upload.main);
  }

  if (!config.build?.command) {
    let fileExists = false;
    try {
      // Use require.resolve to use node's resolution algorithm,
      // this lets us use paths without explicit .js extension
      // TODO: we should probably remove this, because it doesn't
      // take into consideration other extensions like .tsx, .ts, .jsx, etc
      fileExists = fs.existsSync(require.resolve(file));
    } catch (e) {
      // fail silently, usually means require.resolve threw MODULE_NOT_FOUND
    }
    if (fileExists === false) {
      throw new Error(`Could not resolve "${file}".`);
    }
  }
  return { file, directory };
}

// a helper to demand one of a set of options
// via https://github.com/yargs/yargs/issues/1093#issuecomment-491299261
function demandOneOfOption(...options: string[]) {
  return function (argv: Yargs.Arguments) {
    const count = options.filter((option) => argv[option]).length;
    const lastOption = options.pop();

    if (count === 0) {
      throw new CommandLineArgsError(
        `Exactly one of the arguments ${options.join(
          ", "
        )} and ${lastOption} is required`
      );
    } else if (count > 1) {
      throw new CommandLineArgsError(
        `Arguments ${options.join(
          ", "
        )} and ${lastOption} are mutually exclusive`
      );
    }

    return true;
  };
}

class CommandLineArgsError extends Error {}
class DeprecationError extends Error {}
class NotImplementedError extends Error {}

export async function main(argv: string[]): Promise<void> {
  const wrangler = makeCLI(argv)
    // We handle errors ourselves in a try-catch around `yargs.parse`.
    // If you want the "help info" to be displayed then throw an instance of `CommandLineArgsError`.
    // Otherwise we just log the error that was thrown without any "help info".
    .showHelpOnFail(false)
    .fail((msg, error) => {
      if (!error) {
        // If there is only a `msg` then this came from yargs own validation, so wrap in a `CommandLineArgsError`.
        error = new CommandLineArgsError(msg);
      }
      throw error;
    })
    .scriptName("wrangler")
    .wrap(null);

  // the default is to simply print the help menu
  wrangler.command(
    ["*"],
    false,
    () => {},
    (args) => {
      if (args._.length > 0) {
        throw new CommandLineArgsError(`Unknown command: ${args._}.`);
      } else {
        wrangler.showHelp("log");
      }
    }
  );

  // You will note that we use the form for all commands where we use the builder function
  // to define options and subcommands.
  // Further we return the result of this builder even though it's not completely necessary.
  // The reason is that it's required for type inference of the args in the handle function.
  // I wish we could enforce this pattern, but this comment will have to do for now.
  // (It's also annoying that choices[] doesn't get inferred as an enum. 🤷‍♂.)

  // [DEPRECATED] generate
  wrangler.command(
    // we definitely want to move away from us cloning github templates
    // we can do something better here, let's see
    "generate [name] [template]",
    false,
    (yargs) => {
      return yargs
        .positional("name", {
          describe: "Name of the Workers project",
          default: "worker",
        })
        .positional("template", {
          describe: "a link to a GitHub template",
          default: "https://github.com/cloudflare/worker-template",
        });
    },
    () => {
      // "👯 [DEPRECATED]. Scaffold a Cloudflare Workers project from a public GitHub repository.",
      throw new DeprecationError(
        "`wrangler generate` has been deprecated, please refer to TODO://some/path for alternatives"
      );
    }
  );

  // init
  wrangler.command(
    "init [name]",
    "📥 Create a wrangler.toml configuration file",
    (yargs) => {
      return yargs
        .positional("name", {
          describe: "The name of your worker.",
          type: "string",
        })
        .option("yes", {
          describe: 'Answer "yes" to any prompts for new projects.',
          type: "boolean",
          alias: "y",
        });
    },
    async (args) => {
      if ("type" in args) {
        let message = "The --type option is no longer supported.";
        if (args.type === "webpack") {
          message +=
            "\nIf you wish to use webpack then you will need to create a custom build.";
          // TODO: Add a link to docs
        }
        throw new CommandLineArgsError(message);
      }

      const packageManager = await getPackageManager(process.cwd());

      const destination = "./wrangler.toml";
      if (fs.existsSync(destination)) {
        console.warn(`${destination} file already exists!`);
        const shouldContinue = await confirm(
          "Do you want to continue initializing this project?"
        );
        if (!shouldContinue) {
          return;
        }
      } else {
        const compatibilityDate = new Date().toISOString().substring(0, 10);
        try {
          await writeFile(
            destination,
            TOML.stringify({
              name: args.name || path.basename(path.resolve(process.cwd())),
              compatibility_date: compatibilityDate,
            }) + "\n"
          );
          console.log(`✨ Successfully created wrangler.toml`);
          // TODO: suggest next steps?
        } catch (err) {
          throw new Error(
            `Failed to create wrangler.toml.\n${(err as Error).message ?? err}`
          );
        }
      }

      let pathToPackageJson = await findUp("package.json");
      let shouldCreatePackageJson = false;
      const yesFlag = args.yes ?? false;
      if (!pathToPackageJson) {
        // If no package.json exists, ask to create one
        shouldCreatePackageJson =
          yesFlag ||
          (await confirm(
            "No package.json found. Would you like to create one?"
          ));

        if (shouldCreatePackageJson) {
          await writeFile(
            "./package.json",
            JSON.stringify(
              {
                name: args.name || path.basename(path.resolve(process.cwd())),
                version: "0.0.0",
                devDependencies: {
                  wrangler: wranglerVersion,
                },
                private: true,
              },
              null,
              "  "
            ) + "\n"
          );
          await packageManager.install();
          console.log(`✨ Created package.json`);
          pathToPackageJson = path.join(process.cwd(), "package.json");
        } else {
          return;
        }
      } else {
        // If package.json exists and wrangler isn't installed,
        // then ask to add wrangler to devDependencies
        const packageJson = JSON.parse(
          await readFile(pathToPackageJson, "utf-8")
        );
        if (
          !(
            packageJson.devDependencies?.wrangler ||
            packageJson.dependencies?.wrangler
          )
        ) {
          const shouldInstall =
            yesFlag ||
            (await confirm(
              "Would you like to install wrangler into your package.json?"
            ));
          if (shouldInstall) {
            await packageManager.addDevDeps(`wrangler@${wranglerVersion}`);
            console.log(`✨ Installed wrangler`);
          }
        }
      }

      let isTypescriptProject = false;
      let pathToTSConfig = await findUp("tsconfig.json");
      if (!pathToTSConfig) {
        // If there's no tsconfig, offer to create one
        // and install @cloudflare/workers-types
        if (yesFlag || (await confirm("Would you like to use TypeScript?"))) {
          isTypescriptProject = true;
          await writeFile(
            "./tsconfig.json",
            JSON.stringify(
              {
                compilerOptions: {
                  target: "es2021",
                  module: "es2022",
                  moduleResolution: "node",
                  allowJs: true,
                  allowSyntheticDefaultImports: true,
                  isolatedModules: true,
                  noEmit: true,
                  lib: ["es2021"],
                  resolveJsonModule: true,
                  types: ["@cloudflare/workers-types"],
                },
              },
              null,
              "  "
            ) + "\n"
          );
          await packageManager.addDevDeps(
            "@cloudflare/workers-types",
            "typescript"
          );

          console.log(
            `✨ Created tsconfig.json, installed @cloudflare/workers-types into devDependencies`
          );
          pathToTSConfig = path.join(process.cwd(), "tsconfig.json");
        }
      } else {
        isTypescriptProject = true;
        // If there's a tsconfig, check if @cloudflare/workers-types
        // is already installed, and offer to install it if not
        const packageJson = JSON.parse(
          await readFile(pathToPackageJson, "utf-8")
        );
        if (
          !(
            packageJson.devDependencies?.["@cloudflare/workers-types"] ||
            packageJson.dependencies?.["@cloudflare/workers-types"]
          )
        ) {
          const shouldInstall = await confirm(
            "Would you like to install the type definitions for Workers into your package.json?"
          );
          if (shouldInstall) {
            await packageManager.addDevDeps("@cloudflare/workers-types");
            // We don't update the tsconfig.json because
            // it could be complicated in existing projects
            // and we don't want to break them. Instead, we simply
            // tell the user that they need to update their tsconfig.json
            console.log(
              `✨ Installed @cloudflare/workers-types.\nPlease add "@cloudflare/workers-types" to compilerOptions.types in your tsconfig.json`
            );
          }
        }
      }

      const packageJsonContent = JSON.parse(
        await readFile(pathToPackageJson, "utf-8")
      );
      const shouldWritePackageJsonScripts =
        !packageJsonContent.scripts?.start &&
        !packageJsonContent.scripts?.deploy &&
        shouldCreatePackageJson;
      async function writePackageJsonScripts(
        isWritingScripts: boolean,
        packagePath: string,
        scriptPath: string
      ) {
        if (isWritingScripts) {
          await writeFile(
            packagePath,
            JSON.stringify(
              {
                ...packageJsonContent,
                scripts: {
                  ...packageJsonContent.scripts,
                  start: `wrangler dev ${scriptPath}`,
                  deploy: `wrangler publish ${scriptPath}`,
                },
              },
              null,
              "  "
            ) + "\n"
          );
          console.log(`To start developing on your worker, run npm start.`);
          console.log(
            `To publish your worker on to the internet, run npm run deploy.`
          );
        } else {
          console.log(
            `To start developing on your worker, npx wrangler dev ${scriptPath}`
          );
          console.log(
            `To publish your worker on to the internet, npx wrangler publish ${scriptPath}`
          );
        }
      }
      if (isTypescriptProject) {
        if (!fs.existsSync("./src/index.ts")) {
          let shouldCreateSource = false;

          shouldCreateSource =
            yesFlag ||
            (await confirm(
              `Would you like to create a Worker at src/index.ts?`
            ));

          if (shouldCreateSource) {
            await mkdir("./src", { recursive: true });
            await writeFile(
              "./src/index.ts",
              await readFile(
                path.join(__dirname, "../templates/new-worker.ts"),
                "utf-8"
              )
            );

            await writePackageJsonScripts(
              shouldWritePackageJsonScripts,
              pathToPackageJson,
              "src/index.ts"
            );

            console.log(`✨ Created src/index.ts`);
          }
        }
      } else {
        if (!fs.existsSync("./src/index.js")) {
          const shouldCreateSource = await confirm(
            `Would you like to create a Worker at src/index.js?`
          );
          if (shouldCreateSource) {
            await mkdir("./src", { recursive: true });
            await writeFile(
              path.join("./src/index.js"),
              await readFile(
                path.join(__dirname, "../templates/new-worker.js"),
                "utf-8"
              )
            );

            await writePackageJsonScripts(
              shouldWritePackageJsonScripts,
              pathToPackageJson,
              "src/index.js"
            );

            console.log(`✨ Created src/index.js`);
          }
        }
      }
    }
  );

  // build
  wrangler.command(
    "build",
    false,
    (yargs) => {
      return yargs.option("env", {
        describe: "Perform on a specific environment",
      });
    },
    () => {
      // "[DEPRECATED] 🦀 Build your project (if applicable)",
      throw new DeprecationError(
        "`wrangler build` has been deprecated, please refer to TODO://some/path for alternatives"
      );
    }
  );

  // login
  wrangler.command(
    // this needs scopes as an option?
    "login",
    false, // we don't need to show this in the menu
    // "🔓 Login to Cloudflare",
    (yargs) => {
      // TODO: This needs some copy editing
      // I mean, this entire app does, but this too.
      return yargs
        .option("scopes-list", {
          describe: "list all the available OAuth scopes with descriptions.",
        })
        .option("scopes", {
          describe: "allows to choose your set of OAuth scopes.",
          array: true,
          type: "string",
        });

      // TODO: scopes
    },
    async (args) => {
      if (args["scopes-list"]) {
        listScopes();
        return;
      }
      if (args.scopes) {
        if (args.scopes.length === 0) {
          // don't allow no scopes to be passed, that would be weird
          listScopes();
          return;
        }
        if (!validateScopeKeys(args.scopes)) {
          throw new CommandLineArgsError(
            `One of ${args.scopes} is not a valid authentication scope. Run "wrangler login --list-scopes" to see the valid scopes.`
          );
        }
        await login({ scopes: args.scopes });
        return;
      }
      await login();

      // TODO: would be nice if it optionally saved login
      // credentials inside node_modules/.cache or something
      // this way you could have multiple users on a single machine
    }
  );

  // logout
  wrangler.command(
    // this needs scopes as an option?
    "logout",
    false, // we don't need to show this in the menu
    // "🚪 Logout from Cloudflare",
    () => {},
    async () => {
      await logout();
    }
  );

  // whoami
  wrangler.command(
    "whoami",
    "🕵️  Retrieve your user info and test your auth config",
    () => {},
    async () => {
      await whoami();
    }
  );

  // config
  wrangler.command(
    "config",
    false,
    () => {},
    () => {
      // "🕵️  Authenticate Wrangler with a Cloudflare API Token",
      throw new DeprecationError(
        "`wrangler config` has been deprecated, please refer to TODO://some/path for alternatives"
      );
    }
  );

  // dev
  wrangler.command(
    "dev [script]",
    "👂 Start a local server for developing your worker",
    (yargs) => {
      return yargs
        .positional("script", {
          describe: "entry point",
          type: "string",
        })
        .option("name", {
          describe: "name of the script",
          type: "string",
        })
        .option("format", {
          choices: ["modules", "service-worker"] as const,
          describe: "Choose an entry type",
        })
        .option("env", {
          describe: "Perform on a specific environment",
          type: "string",
          // TODO: get choices for the toml file?
        })
        .option("compatibility-date", {
          describe: "Date to use for compatibility checks",
          type: "string",
        })
        .option("compatibility-flags", {
          describe: "Flags to use for compatibility checks",
          type: "array",
          alias: "compatibility-flag",
        })
        .option("latest", {
          describe: "Use the latest version of the worker runtime",
          type: "boolean",
          default: true,
        })
        .option("ip", {
          describe: "IP address to listen on",
          type: "string",
          default: "127.0.0.1",
        })
        .option("port", {
          describe: "Port to listen on, defaults to 8787",
          type: "number",
          default: 8787,
        })
        .option("host", {
          type: "string",
          describe:
            "Host to forward requests to, defaults to the zone of project",
        })
        .option("local-protocol", {
          default: "http",
          describe: "Protocol to listen to requests on, defaults to http.",
          choices: ["http", "https"],
        })
        .option("experimental-public", {
          describe: "Static assets to be served",
          type: "string",
        })
        .option("site", {
          describe: "Root folder of static assets for Workers Sites",
          type: "string",
        })
        .option("site-include", {
          describe:
            "Array of .gitignore-style patterns that match file or directory names from the sites directory. Only matched items will be uploaded.",
          type: "string",
          array: true,
        })
        .option("site-exclude", {
          describe:
            "Array of .gitignore-style patterns that match file or directory names from the sites directory. Matched items will not be uploaded.",
          type: "string",
          array: true,
        })
        .option("upstream-protocol", {
          default: "https",
          describe:
            "Protocol to forward requests to host on, defaults to https.",
          choices: ["http", "https"],
        })
        .option("jsx-factory", {
          describe: "The function that is called for each JSX element",
          type: "string",
        })
        .option("jsx-fragment", {
          describe: "The function that is called for each JSX fragment",
          type: "string",
        })
        .option("experimental-enable-local-persistence", {
          describe: "Enable persistence for this session (only for local mode)",
          type: "boolean",
        });
    },
    async (args) => {
      const config = await readConfig(
        (args.config as ConfigPath) ||
          (args.script && (await findWranglerToml(path.dirname(args.script))))
      );
      const entry = getEntry(args, config);

      if (args["experimental-public"]) {
        console.warn(
          "🚨  The --experimental-public field is experimental and will change in the future."
        );
      }

      if (args.public) {
        throw new Error(
          "🚨  The --public field has been renamed to --experimental-public, and will change behaviour in the future."
        );
      }

      if (config.site?.["entry-point"]) {
        console.warn(
          "Deprecation notice: The `site.entry-point` config field is no longer used.\n" +
            "The entry-point is specified via the command line (e.g. `wrangler dev path/to/script`).\n" +
            "Please remove the `site.entry-point` field from the `wrangler.toml` file."
        );
      }

      if (!args.local) {
        // -- snip, extract --
        const loggedIn = await loginOrRefreshIfRequired();
        if (!loggedIn) {
          // didn't login, let's just quit
          console.log("Did not login, quitting...");
          return;
        }

        if (!config.account_id) {
          config.account_id = await getAccountId();
          if (!config.account_id) {
            throw new Error("No account id found, quitting...");
          }
        }
        // -- snip, end --
      }

      const environments = config.env ?? {};
      const envRootObj = args.env ? environments[args.env] || {} : config;

      // TODO: this error shouldn't actually happen,
      // but we haven't fixed it internally yet
      if ("durable_objects" in envRootObj) {
        if (!(args.name || config.name)) {
          console.warn(
            'A worker with durable objects needs to be named, or it may not work as expected. Add a "name" into wrangler.toml, or pass it in the command line with --name.'
          );
        }
        // TODO: if not already published, publish a draft worker
      }

      const { waitUntilExit } = render(
        <Dev
          name={args.name || config.name}
          entry={entry}
          env={args.env}
          buildCommand={config.build || {}}
          format={args.format || config.build?.upload?.format}
          initialMode={args.local ? "local" : "remote"}
          jsxFactory={args["jsx-factory"] || envRootObj?.jsx_factory}
          jsxFragment={args["jsx-fragment"] || envRootObj?.jsx_fragment}
          enableLocalPersistence={
            args["experimental-enable-local-persistence"] || false
          }
          accountId={config.account_id}
          assetPaths={getAssetPaths(
            config,
            args.site,
            args.siteInclude,
            args.siteExclude
          )}
          port={args.port || config.dev?.port}
          public={args["experimental-public"]}
          compatibilityDate={
            args["compatibility-date"] ||
            config.compatibility_date ||
            new Date().toISOString().substring(0, 10)
          }
          compatibilityFlags={
            (args["compatibility-flags"] as string[]) ||
            config.compatibility_flags
          }
          usageModel={config.usage_model}
          bindings={{
            kv_namespaces: envRootObj.kv_namespaces?.map(
              ({ binding, preview_id, id: _id }) => {
                // In `dev`, we make folks use a separate kv namespace called
                // `preview_id` instead of `id` so that they don't
                // break production data. So here we check that a `preview_id`
                // has actually been configured.
                // This whole block of code will be obsoleted in the future
                // when we have copy-on-write for previews on edge workers.
                if (!preview_id) {
                  // TODO: This error has to be a _lot_ better, ideally just asking
                  // to create a preview namespace for the user automatically
                  throw new Error(
                    `In development, you should use a separate kv namespace than the one you'd use in production. Please create a new kv namespace with "wrangler kv:namespace create <name> --preview" and add its id as preview_id to the kv_namespace "${binding}" in your wrangler.toml`
                  ); // Ugh, I really don't like this message very much
                }
                return {
                  binding,
                  id: preview_id,
                };
              }
            ),
            vars: envRootObj.vars,
            wasm_modules: config.wasm_modules,
            durable_objects: envRootObj.durable_objects,
            r2_buckets: envRootObj.r2_buckets,
            unsafe: envRootObj.unsafe?.bindings,
          }}
        />
      );
      await waitUntilExit();
    }
  );

  // publish
  wrangler.command(
    "publish [script]",
    "🆙 Publish your Worker to Cloudflare.",
    (yargs) => {
      return yargs
        .option("env", {
          type: "string",
          describe: "Perform on a specific environment",
        })
        .positional("script", {
          describe: "script to upload",
          type: "string",
        })
        .option("name", {
          describe: "name to use when uploading",
          type: "string",
        })
        .option("format", {
          choices: ["modules", "service-worker"] as const,
          describe: "Choose an entry type",
        })
        .option("compatibility-date", {
          describe: "Date to use for compatibility checks",
          type: "string",
        })
        .option("compatibility-flags", {
          describe: "Flags to use for compatibility checks",
          type: "array",
          alias: "compatibility-flag",
        })
        .option("latest", {
          describe: "Use the latest version of the worker runtime",
          type: "boolean",
          default: false,
        })
        .option("experimental-public", {
          describe: "Static assets to be served",
          type: "string",
        })
        .option("site", {
          describe: "Root folder of static assets for Workers Sites",
          type: "string",
        })
        .option("site-include", {
          describe:
            "Array of .gitignore-style patterns that match file or directory names from the sites directory. Only matched items will be uploaded.",
          type: "string",
          array: true,
        })
        .option("site-exclude", {
          describe:
            "Array of .gitignore-style patterns that match file or directory names from the sites directory. Matched items will not be uploaded.",
          type: "string",
          array: true,
        })
        .option("triggers", {
          describe: "cron schedules to attach",
          alias: ["schedule", "schedules"],
          type: "array",
        })
        .option("routes", {
          describe: "routes to upload",
          alias: "route",
          type: "array",
        })
        .option("jsx-factory", {
          describe: "The function that is called for each JSX element",
          type: "string",
        })
        .option("jsx-fragment", {
          describe: "The function that is called for each JSX fragment",
          type: "string",
        });
    },
    async (args) => {
      if (args.local) {
        throw new NotImplementedError(
          "🚫  Local publishing is not yet supported"
        );
      }

      if (args["experimental-public"]) {
        console.warn(
          "🚨  The --experimental-public field is experimental and will change in the future."
        );
      }
      if (args.public) {
        throw new Error(
          "🚨  The --public field has been renamed to --experimental-public, and will change behaviour in the future."
        );
      }

      const config = await readConfig(
        (args.config as ConfigPath) ||
          (args.script && (await findWranglerToml(path.dirname(args.script))))
      );
      const entry = getEntry(args, config);

      if (args.latest) {
        console.warn(
          "⚠️  Using the latest version of the Workers runtime. To silence this warning, please choose a specific version of the runtime with --compatibility-date, or add a compatibility_date to your wrangler.toml.\n"
        );
      }

      if (!args.local) {
        // -- snip, extract --
        const loggedIn = await loginOrRefreshIfRequired();
        if (!loggedIn) {
          // didn't login, let's just quit
          console.log("Did not login, quitting...");
          return;
        }

        if (!config.account_id) {
          config.account_id = await getAccountId();
          if (!config.account_id) {
            throw new Error("No account id found, quitting...");
          }
        }
        // -- snip, end --
      }

      const assetPaths = getAssetPaths(
        config,
        args["experimental-public"] || args.site,
        args.siteInclude,
        args.siteExclude
      );
      await publish({
        config,
        name: args.name,
        format: args.format || config.build?.upload?.format,
        entry,
        env: args.env,
        compatibilityDate: args.latest
          ? new Date().toISOString().substring(0, 10)
          : args["compatibility-date"],
        compatibilityFlags: args["compatibility-flags"] as string[],
        triggers: args.triggers,
        jsxFactory: args["jsx-factory"],
        jsxFragment: args["jsx-fragment"],
        routes: args.routes,
        assetPaths,
        legacyEnv: undefined, // TODO: get this from somewhere... config?
        experimentalPublic: args["experimental-public"] !== undefined,
      });
    }
  );

  // tail
  wrangler.command(
    "tail [name]",
    "🦚 Starts a log tailing session for a deployed Worker.",
    (yargs) => {
      return (
        yargs
          .positional("name", {
            describe: "name of the worker",
            type: "string",
          })
          // TODO: auto-detect if this should be json or pretty based on atty
          .option("format", {
            default: "json",
            choices: ["json", "pretty"],
            describe: "The format of log entries",
          })
          .option("status", {
            choices: ["ok", "error", "canceled"],
            describe: "Filter by invocation status",
            array: true,
          })
          .option("header", {
            type: "string",
            describe: "Filter by HTTP header",
          })
          .option("method", {
            type: "string",
            describe: "Filter by HTTP method",
            array: true,
          })
          .option("sampling-rate", {
            type: "number",
            describe: "Adds a percentage of requests to log sampling rate",
          })
          .option("search", {
            type: "string",
            describe: "Filter by a text match in console.log messages",
          })
          .option("ip", {
            type: "string",
            describe:
              'Filter by the IP address the request originates from. Use "self" to filter for your own IP',
            array: true,
          })
          // TODO: is this deprecated now with services / environments / etc?
          .option("env", {
            type: "string",
            describe: "Perform on a specific environment",
          })
          .option("debug", {
            type: "boolean",
            hidden: true,
            default: false,
            describe:
              "If a log would have been filtered out, send it through anyway alongside the filter which would have blocked it.",
          })
      );
    },
    async (args) => {
      if (args.local) {
        throw new NotImplementedError(
          `local mode is not yet supported for this command`
        );
      }

      const config = await readConfig(args.config as ConfigPath);

      const shortScriptName = args.name || config.name;
      if (!shortScriptName) {
        throw new Error("Missing script name");
      }
      const scriptName = `${shortScriptName}${args.env ? `-${args.env}` : ""}`;

      // -- snip, extract --
      const loggedIn = await loginOrRefreshIfRequired();
      if (!loggedIn) {
        // didn't login, let's just quit
        console.log("Did not login, quitting...");
        return;
      }

      if (!config.account_id) {
        config.account_id = await getAccountId();
        if (!config.account_id) {
          throw new Error("No account id found, quitting...");
        }
      }
      // -- snip, end --

      const accountId = config.account_id;

      const cliFilters: TailCLIFilters = {
        status: args.status as Array<"ok" | "error" | "canceled">,
        header: args.header,
        method: args.method,
        samplingRate: args["sampling-rate"],
        search: args.search,
        clientIp: args.ip,
      };

      const filters = translateCliCommandToApiFilterMessage(
        cliFilters,
        args.debug
      );

      const { tail, expiration, deleteTail } = await createTail(
        accountId,
        scriptName,
        filters
      );

      console.log(
        `successfully created tail, expires at ${expiration.toLocaleString()}`
      );

      onExit(async () => {
        tail.terminate();
        await deleteTail();
      });

      const printLog: (data: RawData) => void =
        args.format === "pretty" ? prettyPrintLogs : jsonPrintLogs;

      tail.on("message", printLog);

      while (tail.readyState !== tail.OPEN) {
        switch (tail.readyState) {
          case tail.CONNECTING:
            await setTimeout(1000);
            break;
          case tail.CLOSING:
            await setTimeout(1000);
            break;
          case tail.CLOSED:
            throw new Error("Websocket closed unexpectedly!");
        }
      }

      console.log(`Connected to ${scriptName}, waiting for logs...`);

      tail.on("close", async () => {
        tail.terminate();
        await deleteTail();
      });
    }
  );

  // preview
  wrangler.command(
    "preview [method] [body]",
    false,
    (yargs) => {
      return yargs
        .positional("method", {
          describe: "Type of request to preview your worker",
          choices: ["GET", "POST"],
          default: ["GET"],
        })
        .positional("body", {
          type: "string",
          describe: "Body string to post to your preview worker request.",
          default: "Null",
        })
        .option("env", {
          type: "string",
          describe: "Perform on a specific environment",
        })
        .option("watch", {
          default: true,
          describe: "Enable live preview",
          type: "boolean",
        });
    },
    () => {
      // "🔬 [DEPRECATED] Preview your code temporarily on https://cloudflareworkers.com"
      throw new DeprecationError(
        "`wrangler preview` has been deprecated, please refer to TODO://some/path for alternatives"
      );
    }
  );

  // route
  wrangler.command(
    "route",
    false, // I think we want to hide this command
    // "➡️  List or delete worker routes",
    (routeYargs) => {
      return routeYargs
        .command(
          "list",
          "List a route associated with a zone",
          (yargs) => {
            return yargs
              .option("env", {
                type: "string",
                describe: "Perform on a specific environment",
              })
              .option("zone", {
                type: "string",
                describe: "zone id",
              })
              .positional("zone", {
                describe: "zone id",
                type: "string",
              });
          },
          async (args) => {
            console.log(":route list", args);
            // TODO: use environment (current wrangler doesn't do so?)
            const config = await readConfig(args.config as ConfigPath);
            const zone = args.zone || config.zone_id;
            if (!zone) {
              throw new Error("missing zone id");
            }

            console.log(await fetchResult(`/zones/${zone}/workers/routes`));
          }
        )
        .command(
          "delete <id>",
          "Delete a route associated with a zone",
          (yargs) => {
            return yargs
              .positional("id", {
                describe: "The hash of the route ID to delete.",
                type: "string",
              })
              .option("zone", {
                type: "string",
                describe: "zone id",
              })
              .option("env", {
                type: "string",
                describe: "Perform on a specific environment",
              });
          },
          async (args) => {
            console.log(":route delete", args);
            // TODO: use environment (current wrangler doesn't do so?)
            const config = await readConfig(args.config as ConfigPath);
            const zone = args.zone || config.zone_id;
            if (!zone) {
              throw new Error("missing zone id");
            }

            console.log(
              await fetchResult(`/zones/${zone}/workers/routes/${args.id}`, {
                method: "DELETE",
              })
            );
          }
        );
    }
  );

  // subdomain
  wrangler.command(
    "subdomain [name]",
    false,
    // "👷 Create or change your workers.dev subdomain.",
    (yargs) => {
      return yargs.positional("name", { type: "string" });
    },
    () => {
      throw new DeprecationError(
        "`wrangler subdomain` has been deprecated, please refer to TODO://some/path for alternatives"
      );
    }
  );

  // secret
  wrangler.command(
    "secret",
    "🤫 Generate a secret that can be referenced in the worker script",
    (secretYargs) => {
      return secretYargs
        .command(
          "put <key>",
          "Create or update a secret variable for a script",
          (yargs) => {
            return yargs
              .positional("key", {
                describe: "The variable name to be accessible in the script.",
                type: "string",
              })
              .option("name", {
                describe: "name of the script",
                type: "string",
              })
              .option("env", {
                type: "string",
                describe:
                  "Binds the secret to the script of the specific environment.",
              });
          },
          async (args) => {
            const config = await readConfig(args.config as ConfigPath);

            // TODO: use environment (how does current wrangler do it?)
            const scriptName = args.name || config.name;
            if (!scriptName) {
              throw new Error("Missing script name");
            }

            if (args.local) {
              console.warn("`wrangler secret put` is a no-op in --local mode");
            }

            if (!args.local) {
              // -- snip, extract --
              const loggedIn = await loginOrRefreshIfRequired();
              if (!loggedIn) {
                // didn't login, let's just quit
                console.log("Did not login, quitting...");
                return;
              }

              if (!config.account_id) {
                config.account_id = await getAccountId();
                if (!config.account_id) {
                  throw new Error("No account id found, quitting...");
                }
              }
              // -- snip, end --
            }

            const secretValue = await prompt(
              "Enter a secret value:",
              "password"
            );

            if (args.local) {
              return;
            }

            console.log(`🌀 Creating the secret for script ${scriptName}`);

            async function submitSecret() {
              return await fetchResult(
                `/accounts/${config.account_id}/workers/scripts/${scriptName}/secrets/`,
                {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    name: args.key,
                    text: secretValue,
                    type: "secret_text",
                  }),
                }
              );
            }

            try {
              await submitSecret();
            } catch (e) {
              // @ts-expect-error non-standard property on Error
              if (e.code === 10007) {
                // upload a draft worker
                await fetchResult(
                  `/accounts/${config.account_id}/workers/scripts/${scriptName}`,
                  {
                    method: "PUT",
                    body: toFormData({
                      name: scriptName,
                      main: {
                        name: scriptName,
                        content: `export default { fetch() {} }`,
                        type: "esm",
                      },
                      bindings: {
                        kv_namespaces: [],
                        vars: {},
                        durable_objects: { bindings: [] },
                        r2_buckets: [],
                        wasm_modules: {},
                        unsafe: [],
                      },
                      modules: [],
                      migrations: undefined,
                      compatibility_date: undefined,
                      compatibility_flags: undefined,
                      usage_model: undefined,
                    }),
                  }
                );

                // and then try again
                await submitSecret();
                // TODO: delete the draft worker if this failed too?
              }
            }
            console.log(`✨ Success! Uploaded secret ${args.key}`);
          }
        )
        .command(
          "delete <key>",
          "Delete a secret variable from a script",
          (yargs) => {
            return yargs
              .positional("key", {
                describe: "The variable name to be accessible in the script.",
                type: "string",
              })
              .option("name", {
                describe: "name of the script",
                type: "string",
              })
              .option("env", {
                type: "string",
                describe:
                  "Binds the secret to the script of the specific environment.",
              });
          },
          async (args) => {
            const config = await readConfig(args.config as ConfigPath);

            // TODO: use environment (how does current wrangler do it?)
            const scriptName = args.name || config.name;
            if (!scriptName) {
              throw new Error("Missing script name");
            }

            if (args.local) {
              console.warn(
                "`wrangler secret delete` is a no-op in --local mode"
              );
            }

            if (!args.local) {
              // -- snip, extract --
              const loggedIn = await loginOrRefreshIfRequired();
              if (!loggedIn) {
                // didn't login, let's just quit
                console.log("Did not login, quitting...");
                return;
              }

              if (!config.account_id) {
                config.account_id = await getAccountId();
                if (!config.account_id) {
                  throw new Error("No account id found, quitting...");
                }
              }
              // -- snip, end --
            }

            if (
              await confirm(
                `Are you sure you want to permanently delete the variable ${args.key} on the script ${scriptName}?`
              )
            ) {
              console.log(
                `🌀 Deleting the secret ${args.key} on script ${scriptName}.`
              );

              if (args.local) {
                return;
              }

              await fetchResult(
                `/accounts/${config.account_id}/workers/scripts/${scriptName}/secrets/${args.key}`,
                { method: "DELETE" }
              );
              console.log(`✨ Success! Deleted secret ${args.key}`);
            }
          }
        )
        .command(
          "list",
          "List all secrets for a script",
          (yargs) => {
            return yargs
              .option("name", {
                describe: "name of the script",
                type: "string",
              })
              .option("env", {
                type: "string",
                describe:
                  "Binds the secret to the script of the specific environment.",
              });
          },
          async (args) => {
            const config = await readConfig(args.config as ConfigPath);

            // TODO: use environment (how does current wrangler do it?)
            const scriptName = args.name || config.name;
            if (!scriptName) {
              throw new Error("Missing script name");
            }

            if (args.local) {
              console.warn("`wrangler secret list` is a no-op in --local mode");
            }

            if (!args.local) {
              // -- snip, extract --
              const loggedIn = await loginOrRefreshIfRequired();
              if (!loggedIn) {
                // didn't login, let's just quit
                console.log("Did not login, quitting...");
                return;
              }

              if (!config.account_id) {
                config.account_id = await getAccountId();
                if (!config.account_id) {
                  throw new Error("No account id found, quitting...");
                }
              }
              // -- snip, end --
            }

            if (args.local) {
              return;
            }

            console.log(
              JSON.stringify(
                await fetchResult(
                  `/accounts/${config.account_id}/workers/scripts/${scriptName}/secrets`
                ),
                null,
                "  "
              )
            );
          }
        );
    }
  );

  // kv
  // :namespace
  wrangler.command(
    "kv:namespace",
    "🗂️  Interact with your Workers KV Namespaces",
    (namespaceYargs) => {
      return namespaceYargs
        .command(
          "create <namespace>",
          "Create a new namespace",
          (yargs) => {
            return yargs
              .positional("namespace", {
                describe: "The name of the new namespace",
                type: "string",
                demandOption: true,
              })
              .option("env", {
                type: "string",
                describe: "Perform on a specific environment",
              })
              .option("preview", {
                type: "boolean",
                describe: "Interact with a preview namespace",
              });
          },
          async (args) => {
            if (args._.length > 2) {
              const extraArgs = args._.slice(2).join(" ");
              throw new CommandLineArgsError(
                `Unexpected additional positional arguments "${extraArgs}".`
              );
            }

            if (!isValidNamespaceBinding(args.namespace)) {
              throw new CommandLineArgsError(
                `The namespace binding name "${args.namespace}" is invalid. It can only have alphanumeric and _ characters, and cannot begin with a number.`
              );
            }

            const config = await readConfig(args.config as ConfigPath);
            if (!config.name) {
              console.warn(
                "No configured name present, using `worker` as a prefix for the title"
              );
            }

            const name = config.name || "worker";
            const environment = args.env ? `-${args.env}` : "";
            const preview = args.preview ? "_preview" : "";
            const title = `${name}${environment}-${args.namespace}${preview}`;

            if (args.local) {
              const { Miniflare } = await import("miniflare");
              const mf = new Miniflare({
                kvPersist: (args.kvPersist as string) || true,
                // TODO: these options shouldn't be required
                script: ` `, // has to be a string with at least one char
              });
              await mf.getKVNamespace(title); // this should "create" the namespace
              console.log(`✨ Success! Created KV namespace ${title}`);
            } else {
              // -- snip, extract --
              const loggedIn = await loginOrRefreshIfRequired();
              if (!loggedIn) {
                // didn't login, let's just quit
                console.log("Did not login, quitting...");
                return;
              }

              if (!config.account_id) {
                config.account_id = await getAccountId();
                if (!config.account_id) {
                  throw new Error("No account id found, quitting...");
                }
              }
              // -- snip, end --

              // TODO: generate a binding name stripping non alphanumeric chars

              console.log(`🌀 Creating namespace with title "${title}"`);
              const namespaceId = await createNamespace(
                config.account_id,
                title
              );

              console.log("✨ Success!");
              const envString = args.env ? ` under [env.${args.env}]` : "";
              const previewString = args.preview ? "preview_" : "";
              console.log(
                `Add the following to your configuration file in your kv_namespaces array${envString}:`
              );
              console.log(
                `{ binding = "${args.namespace}", ${previewString}id = "${namespaceId}" }`
              );

              // TODO: automatically write this block to the wrangler.toml config file??
            }
          }
        )
        .command(
          "list",
          "Outputs a list of all KV namespaces associated with your account id.",
          {},
          async (args) => {
            const config = await readConfig(args.config as ConfigPath);

            if (args.local) {
              throw new NotImplementedError(
                `local mode is not yet supported for this command`
              );
            } else {
              // -- snip, extract --
              const loggedIn = await loginOrRefreshIfRequired();
              if (!loggedIn) {
                // didn't login, let's just quit
                console.log("Did not login, quitting...");
                return;
              }

              if (!config.account_id) {
                config.account_id = await getAccountId();
                if (!config.account_id) {
                  throw new Error("No account id found, quitting...");
                }
              }
              // -- snip, end --

              // TODO: we should show bindings if they exist for given ids

              console.log(
                JSON.stringify(
                  await listNamespaces(config.account_id),
                  null,
                  "  "
                )
              );
            }
          }
        )
        .command(
          "delete",
          "Deletes a given namespace.",
          (yargs) => {
            return yargs
              .option("binding", {
                type: "string",
                describe: "The name of the namespace to delete",
              })
              .option("namespace-id", {
                type: "string",
                describe: "The id of the namespace to delete",
              })
              .check(demandOneOfOption("binding", "namespace-id"))
              .option("env", {
                type: "string",
                describe: "Perform on a specific environment",
              })
              .option("preview", {
                type: "boolean",
                describe: "Interact with a preview namespace",
              });
          },
          async (args) => {
            const config = await readConfig(args.config as ConfigPath);

            if (args.local) {
              throw new NotImplementedError(
                `local mode is not yet supported for this command`
              );
            } else {
              let id;
              try {
                id = getNamespaceId(args, config);
              } catch (e) {
                throw new CommandLineArgsError(
                  "Not able to delete namespace.\n" +
                    ((e as Error).message ?? e)
                );
              }

              // -- snip, extract --
              const loggedIn = await loginOrRefreshIfRequired();
              if (!loggedIn) {
                // didn't login, let's just quit
                console.log("Did not login, quitting...");
                return;
              }

              if (!config.account_id) {
                config.account_id = await getAccountId();
                if (!config.account_id) {
                  throw new Error("No account id found, quitting...");
                }
              }
              // -- snip, end --

              await fetchResult<{ id: string }>(
                `/accounts/${config.account_id}/storage/kv/namespaces/${id}`,
                { method: "DELETE" }
              );

              // TODO: recommend they remove it from wrangler.toml

              // test-mf wrangler kv:namespace delete --namespace-id 2a7d3d8b23fc4159b5afa489d6cfd388
              // Are you sure you want to delete namespace 2a7d3d8b23fc4159b5afa489d6cfd388? [y/n]
              // n
              // 💁  Not deleting namespace 2a7d3d8b23fc4159b5afa489d6cfd388
              // ➜  test-mf wrangler kv:namespace delete --namespace-id 2a7d3d8b23fc4159b5afa489d6cfd388
              // Are you sure you want to delete namespace 2a7d3d8b23fc4159b5afa489d6cfd388? [y/n]
              // y
              // 🌀  Deleting namespace 2a7d3d8b23fc4159b5afa489d6cfd388
              // ✨  Success
              // ⚠️  Make sure to remove this "kv-namespace" entry from your configuration file!
              // ➜  test-mf

              // TODO: do it automatically

              // TODO: delete the preview namespace as well?
            }
          }
        );
    }
  );

  // :key
  wrangler.command(
    "kv:key",
    "🔑 Individually manage Workers KV key-value pairs",
    (kvKeyYargs) => {
      return kvKeyYargs
        .command(
          "put <key> [value]",
          "Writes a single key/value pair to the given namespace.",
          (yargs) => {
            return yargs
              .positional("key", {
                type: "string",
                describe: "The key to write to.",
                demandOption: true,
              })
              .positional("value", {
                type: "string",
                describe: "The value to write.",
              })
              .option("binding", {
                type: "string",
                describe: "The binding of the namespace to write to.",
              })
              .option("namespace-id", {
                type: "string",
                describe: "The id of the namespace to write to.",
              })
              .check(demandOneOfOption("binding", "namespace-id"))
              .option("env", {
                type: "string",
                describe: "Perform on a specific environment",
              })
              .option("preview", {
                type: "boolean",
                describe: "Interact with a preview namespace",
              })
              .option("ttl", {
                type: "number",
                describe: "Time for which the entries should be visible.",
              })
              .option("expiration", {
                type: "number",
                describe:
                  "Time since the UNIX epoch after which the entry expires",
              })
              .option("path", {
                type: "string",
                describe: "Read value from the file at a given path.",
              })
              .check(demandOneOfOption("value", "path"));
          },
          async ({ key, ttl, expiration, ...args }) => {
            const config = await readConfig(args.config as ConfigPath);
            const namespaceId = getNamespaceId(args, config);
            // One of `args.path` and `args.value` must be defined
            const value = args.path
              ? await readFile(args.path, "utf-8")
              : // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                args.value!;

            if (args.path) {
              console.log(
                `writing the contents of ${args.path} to the key "${key}" on namespace ${namespaceId}`
              );
            } else {
              console.log(
                `writing the value "${value}" to key "${key}" on namespace ${namespaceId}`
              );
            }

            if (args.local) {
              const { Miniflare } = await import("miniflare");
              const mf = new Miniflare({
                kvPersist: (args.kvPersist as string) || true,
                // TODO: these options shouldn't be required
                script: ` `, // has to be a string with at least one char
              });
              const ns = await mf.getKVNamespace(namespaceId);
              await ns.put(key, value, { expiration, expirationTtl: ttl });
            } else {
              // -- snip, extract --
              const loggedIn = await loginOrRefreshIfRequired();
              if (!loggedIn) {
                // didn't login, let's just quit
                console.log("Did not login, quitting...");
                return;
              }

              if (!config.account_id) {
                config.account_id = await getAccountId();
                if (!config.account_id) {
                  throw new Error("No account id found, quitting...");
                }
              }
              // -- snip, end --

              await putKeyValue(config.account_id, namespaceId, key, value, {
                expiration,
                expiration_ttl: ttl,
              });
            }
          }
        )
        .command(
          "list",
          "Outputs a list of all keys in a given namespace.",
          (yargs) => {
            return yargs
              .option("binding", {
                type: "string",
                describe: "The name of the namespace to list",
              })
              .option("namespace-id", {
                type: "string",
                describe: "The id of the namespace to list",
              })
              .check(demandOneOfOption("binding", "namespace-id"))
              .option("env", {
                type: "string",
                describe: "Perform on a specific environment",
              })
              .option("preview", {
                type: "boolean",
                // In the case of listing keys we will default to non-preview mode
                default: false,
                describe: "Interact with a preview namespace",
              })
              .option("prefix", {
                type: "string",
                describe: "A prefix to filter listed keys",
              });
          },
          async ({ prefix, ...args }) => {
            // TODO: support for limit+cursor (pagination)
            const config = await readConfig(args.config as ConfigPath);
            const namespaceId = getNamespaceId(args, config);

            if (args.local) {
              const { Miniflare } = await import("miniflare");
              const mf = new Miniflare({
                kvPersist: (args.kvPersist as string) || true,
                // TODO: these options shouldn't be required
                script: ` `, // has to be a string with at least one char
              });
              const ns = await mf.getKVNamespace(namespaceId);
              const listResponse = await ns.list({ prefix });
              console.log(JSON.stringify(listResponse.keys, null, "  ")); // TODO: paginate, collate
            } else {
              // -- snip, extract --
              const loggedIn = await loginOrRefreshIfRequired();
              if (!loggedIn) {
                // didn't login, let's just quit
                console.log("Did not login, quitting...");
                return;
              }

              if (!config.account_id) {
                config.account_id = await getAccountId();
                if (!config.account_id) {
                  throw new Error("No account id found, quitting...");
                }
              }
              // -- snip, end --

              const results = await listNamespaceKeys(
                config.account_id,
                namespaceId,
                prefix
              );
              console.log(JSON.stringify(results, undefined, 2));
            }
          }
        )
        .command(
          "get <key>",
          "Reads a single value by key from the given namespace.",
          (yargs) => {
            return yargs
              .positional("key", {
                describe: "The key value to get.",
                type: "string",
                demandOption: true,
              })
              .option("binding", {
                type: "string",
                describe: "The name of the namespace to get from",
              })
              .option("namespace-id", {
                type: "string",
                describe: "The id of the namespace to get from",
              })
              .check(demandOneOfOption("binding", "namespace-id"))
              .option("env", {
                type: "string",
                describe: "Perform on a specific environment",
              })
              .option("preview", {
                type: "boolean",
                describe: "Interact with a preview namespace",
              })
              .option("preview", {
                type: "boolean",
                // In the case of getting key values we will default to non-preview mode
                default: false,
                describe: "Interact with a preview namespace",
              });
          },
          async ({ key, ...args }) => {
            const config = await readConfig(args.config as ConfigPath);
            const namespaceId = getNamespaceId(args, config);

            if (args.local) {
              const { Miniflare } = await import("miniflare");
              const mf = new Miniflare({
                kvPersist: (args.kvPersist as string) || true,
                // TODO: these options shouldn't be required
                script: ` `, // has to be a string with at least one char
              });
              const ns = await mf.getKVNamespace(namespaceId);
              console.log(await ns.get(key));
              return;
            }

            if (!args.local) {
              // -- snip, extract --
              const loggedIn = await loginOrRefreshIfRequired();
              if (!loggedIn) {
                // didn't login, let's just quit
                console.log("Did not login, quitting...");
                return;
              }

              if (!config.account_id) {
                config.account_id = await getAccountId();
                if (!config.account_id) {
                  throw new Error("No account id found, quitting...");
                }
              }
              // -- snip, end --

              console.log(
                await getKeyValue(config.account_id, namespaceId, key)
              );
            }
          }
        )
        .command(
          "delete <key>",
          "Removes a single key value pair from the given namespace.",
          (yargs) => {
            return yargs
              .positional("key", {
                describe: "The key value to delete",
                type: "string",
                demandOption: true,
              })
              .option("binding", {
                type: "string",
                describe: "The name of the namespace to delete from",
              })
              .option("namespace-id", {
                type: "string",
                describe: "The id of the namespace to delete from",
              })
              .check(demandOneOfOption("binding", "namespace-id"))
              .option("env", {
                type: "string",
                describe: "Perform on a specific environment",
              })
              .option("preview", {
                type: "boolean",
                describe: "Interact with a preview namespace",
              });
          },
          async ({ key, ...args }) => {
            const config = await readConfig(args.config as ConfigPath);
            const namespaceId = getNamespaceId(args, config);

            console.log(
              `deleting the key "${key}" on namespace ${namespaceId}`
            );

            if (args.local) {
              const { Miniflare } = await import("miniflare");
              const mf = new Miniflare({
                kvPersist: (args.kvPersist as string) || true,
                // TODO: these options shouldn't be required
                script: ` `, // has to be a string with at least one char
              });
              const ns = await mf.getKVNamespace(namespaceId);
              console.log(await ns.delete(key));
              return;
            }

            if (!args.local) {
              // -- snip, extract --
              const loggedIn = await loginOrRefreshIfRequired();
              if (!loggedIn) {
                // didn't login, let's just quit
                console.log("Did not login, quitting...");
                return;
              }

              if (!config.account_id) {
                config.account_id = await getAccountId();
                if (!config.account_id) {
                  throw new Error("No account id found, quitting...");
                }
              }
              // -- snip, end --
            }

            await fetchResult(
              `/accounts/${config.account_id}/storage/kv/namespaces/${namespaceId}/values/${key}`,
              { method: "DELETE" }
            );
          }
        );
    }
  );

  // :bulk
  wrangler.command(
    "kv:bulk",
    "💪 Interact with multiple Workers KV key-value pairs at once",
    (kvBulkYargs) => {
      return kvBulkYargs
        .command(
          "put <filename>",
          "Upload multiple key-value pairs to a namespace",
          (yargs) => {
            return yargs
              .positional("filename", {
                describe: `The JSON file of key-value pairs to upload, in form [{"key":..., "value":...}"...]`,
                type: "string",
                demandOption: true,
              })
              .option("binding", {
                type: "string",
                describe: "The name of the namespace to put to",
              })
              .option("namespace-id", {
                type: "string",
                describe: "The id of the namespace to put to",
              })
              .check(demandOneOfOption("binding", "namespace-id"))
              .option("env", {
                type: "string",
                describe: "Perform on a specific environment",
              })
              .option("preview", {
                type: "boolean",
                describe: "Interact with a preview namespace",
              });
          },
          async ({ filename, ...args }) => {
            // The simplest implementation I could think of.
            // This could be made more efficient with a streaming parser/uploader
            // but we'll do that in the future if needed.
            const config = await readConfig(args.config as ConfigPath);
            const namespaceId = getNamespaceId(args, config);
            const content = await readFile(filename, "utf-8");
            let parsedContent;
            try {
              parsedContent = JSON.parse(content);
            } catch (err) {
              throw new Error(
                `Could not parse json from ${filename}.\n${
                  (err as Error).message ?? err
                }`
              );
            }

            if (args.local) {
              const { Miniflare } = await import("miniflare");
              const mf = new Miniflare({
                kvPersist: (args.kvPersist as string) || true,
                // TODO: these options shouldn't be required
                script: ` `, // has to be a string with at least one char
              });
              const ns = await mf.getKVNamespace(namespaceId);
              for (const {
                key,
                value,
                expiration,
                expiration_ttl,
              } of parsedContent) {
                await ns.put(key, value, {
                  expiration,
                  expirationTtl: expiration_ttl,
                });
              }
            } else {
              // -- snip, extract --
              const loggedIn = await loginOrRefreshIfRequired();
              if (!loggedIn) {
                // didn't login, let's just quit
                console.log("Did not login, quitting...");
                return;
              }

              if (!config.account_id) {
                config.account_id = await getAccountId();
                if (!config.account_id) {
                  throw new Error("No account id found, quitting...");
                }
              }
              // -- snip, end --

              console.log(
                await putBulkKeyValue(config.account_id, namespaceId, content)
              );
            }
          }
        )
        .command(
          "delete <filename>",
          "Delete multiple key-value pairs from a namespace",
          (yargs) => {
            return yargs
              .positional("filename", {
                describe: `The JSON file of keys to delete, in the form ["key1", "key2", ...]`,
                type: "string",
                demandOption: true,
              })
              .option("binding", {
                type: "string",
                describe: "The name of the namespace to delete from",
              })
              .option("namespace-id", {
                type: "string",
                describe: "The id of the namespace to delete from",
              })
              .check(demandOneOfOption("binding", "namespace-id"))
              .option("env", {
                type: "string",
                describe: "Perform on a specific environment",
              })
              .option("preview", {
                type: "boolean",
                describe: "Interact with a preview namespace",
              });
          },
          async ({ filename, ...args }) => {
            const config = await readConfig(args.config as ConfigPath);
            const namespaceId = getNamespaceId(args, config);

            const content = await readFile(filename, "utf-8");
            let parsedContent;
            try {
              parsedContent = JSON.parse(content);
            } catch (err) {
              throw new Error(
                `Could not parse json from ${filename}.\n${
                  (err as Error).message ?? err
                }`
              );
            }

            if (args.local) {
              const { Miniflare } = await import("miniflare");
              const mf = new Miniflare({
                kvPersist: (args.kvPersist as string) || true,
                // TODO: these options shouldn't be required
                script: ` `, // has to be a string with at least one char
              });
              const ns = await mf.getKVNamespace(namespaceId);
              for (const key of parsedContent) {
                await ns.delete(key);
              }
            } else {
              // -- snip, extract --
              const loggedIn = await loginOrRefreshIfRequired();
              if (!loggedIn) {
                // didn't login, let's just quit
                console.log("Did not login, quitting...");
                return;
              }

              if (!config.account_id) {
                config.account_id = await getAccountId();
                if (!config.account_id) {
                  throw new Error("No account id found, quitting...");
                }
              }
              // -- snip, end --

              console.log(
                await deleteBulkKeyValue(
                  config.account_id,
                  namespaceId,
                  content
                )
              );
            }
          }
        );
    }
  );

  wrangler.command("pages", "⚡️ Configure Cloudflare Pages", pages);

  wrangler.command("r2", "📦 Interact with an R2 store", (r2Yargs) => {
    return r2Yargs.command("bucket", "Manage R2 buckets", (r2BucketYargs) => {
      r2BucketYargs.command(
        "create <name>",
        "Create a new R2 bucket",
        (yargs) => {
          return yargs.positional("name", {
            describe: "The name of the new bucket",
            type: "string",
            demandOption: true,
          });
        },
        async (args) => {
          // We expect three values in `_`: `r2`, `bucket`, `create`.
          if (args._.length > 3) {
            const extraArgs = args._.slice(3).join(" ");
            throw new CommandLineArgsError(
              `Unexpected additional positional arguments "${extraArgs}".`
            );
          }

          const config = await readConfig(args.config as ConfigPath);

          if (args.local) {
            throw new NotImplementedError(
              `local mode is not yet supported for this command`
            );
          } else {
            // -- snip, extract --
            const loggedIn = await loginOrRefreshIfRequired();
            if (!loggedIn) {
              // didn't login, let's just quit
              console.log("Did not login, quitting...");
              return;
            }

            if (!config.account_id) {
              config.account_id = await getAccountId();
              if (!config.account_id) {
                throw new Error("No account id found, quitting...");
              }
            }
            // -- snip, end --

            console.log(`Creating bucket ${args.name}.`);
            await createR2Bucket(config.account_id, args.name);
            console.log(`Created bucket ${args.name}.`);
          }
        }
      );

      r2BucketYargs.command("list", "List R2 buckets", {}, async (args) => {
        const config = await readConfig(args.config as ConfigPath);

        if (args.local) {
          throw new NotImplementedError(
            `local mode is not yet supported for this command`
          );
        } else {
          // -- snip, extract --
          const loggedIn = await loginOrRefreshIfRequired();
          if (!loggedIn) {
            // didn't login, let's just quit
            console.log("Did not login, quitting...");
            return;
          }

          if (!config.account_id) {
            config.account_id = await getAccountId();
            if (!config.account_id) {
              throw new Error("No account id found, quitting...");
            }
          }
          // -- snip, end --

          console.log(
            JSON.stringify(await listR2Buckets(config.account_id), null, 2)
          );
        }
      });

      r2BucketYargs.command(
        "delete <name>",
        "Delete an R2 bucket",
        (yargs) => {
          return yargs.positional("name", {
            describe: "The name of the bucket to delete",
            type: "string",
            demandOption: true,
          });
        },
        async (args) => {
          // We expect three values in `_`: `r2`, `bucket`, `delete`.
          if (args._.length > 3) {
            const extraArgs = args._.slice(3).join(" ");
            throw new CommandLineArgsError(
              `Unexpected additional positional arguments "${extraArgs}".`
            );
          }

          const config = await readConfig(args.config as ConfigPath);

          if (args.local) {
            throw new NotImplementedError(
              `local mode is not yet supported for this command`
            );
          } else {
            // -- snip, extract --
            const loggedIn = await loginOrRefreshIfRequired();
            if (!loggedIn) {
              // didn't login, let's just quit
              console.log("Did not login, quitting...");
              return;
            }

            if (!config.account_id) {
              config.account_id = await getAccountId();
              if (!config.account_id) {
                throw new Error("No account id found, quitting...");
              }
            }
            // -- snip, end --

            console.log(`Deleting bucket ${args.name}.`);
            await deleteR2Bucket(config.account_id, args.name);
            console.log(`Deleted bucket ${args.name}.`);
          }
        }
      );
      return r2BucketYargs;
    });
  });

  wrangler
    .option("config", {
      alias: "c",
      describe: "Path to .toml configuration file",
      type: "string",
    })
    .option("local", {
      alias: "l",
      describe: "Run on my machine",
      type: "boolean",
      default: false, // I bet this will a point of contention. We'll revisit it.
    });

  wrangler.group(["config", "help", "version"], "Flags:");
  wrangler.help().alias("h", "help");
  wrangler.version(wranglerVersion).alias("v", "version");
  wrangler.exitProcess(false);

  try {
    await initialiseUserConfig();
    await wrangler.parse();
  } catch (e) {
    if (e instanceof CommandLineArgsError) {
      wrangler.showHelp("error");
      console.error(""); // Just adds a bit of space
      console.error(e.message);
    } else {
      console.error(e instanceof Error ? e.message : e);
      console.error(""); // Just adds a bit of space
      console.error(
        `${fgGreenColor}%s${resetColor}`,
        "If you think this is a bug then please create an issue at https://github.com/cloudflare/wrangler2/issues/new."
      );
    }
    throw e;
  }
}
