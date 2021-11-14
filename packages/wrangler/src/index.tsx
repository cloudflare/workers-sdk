import React from "react";
import { render } from "ink";
import { Dev } from "./dev";
import { readFile } from "node:fs/promises";
import makeCLI from "yargs";
import { hideBin } from "yargs/helpers";
import type yargs from "yargs";
import { findUp } from "find-up";
import TOML from "@iarna/toml";
import type { Config } from "./config";
import {
  login,
  logout,
  listScopes,
  initialise as initialiseUserConfig,
  loginOrRefreshIfRequired,
  getAccountId,
} from "./user";
import {
  getNamespaceId,
  listNamespaces,
  listNamespaceKeys,
  putKeyValue,
  putBulkKeyValue,
  deleteBulkKeyValue,
} from "./kv";

import { pages } from "./pages";

import cfetch from "./cfetch";

import publish from "./publish";
import path from "path/posix";
import { writeFile } from "node:fs/promises";
import { DeleteConfirmation, GetSecretValue } from "./secret";
import { toFormData } from "./api/form_data";

import { createTail } from "./tail";
import onExit from "signal-exit";
import { setTimeout } from "node:timers/promises";
import * as fs from "node:fs";

async function readConfig(path?: string): Promise<Config> {
  const config: Config = {};
  if (!path) {
    path = await findUp("wrangler.toml");
    // TODO - terminate this early instead of going all the way to the root
  }

  if (path) {
    const tml: string = await readFile(path, "utf-8");
    const parsed = TOML.parse(tml) as Config;
    Object.assign(config, parsed);
  }

  // todo: validate, add defaults
  // let's just do some basics for now

  // env var overrides
  if (process.env.CF_ACCOUNT_ID) {
    config.account_id = process.env.CF_ACCOUNT_ID;
  }

  // @ts-expect-error we're being sneaky here for now
  config.__path__ = path;

  return config;
}

// a helper to demand one of a set of options
// via https://github.com/yargs/yargs/issues/1093#issuecomment-491299261
function demandOneOfOption(...options: string[]) {
  return function (argv: yargs.Arguments) {
    const count = options.filter((option) => argv[option]).length;
    const lastOption = options.pop();

    if (count === 0) {
      throw new Error(
        `Exactly one of the arguments ${options.join(
          ", "
        )} and ${lastOption} is required`
      );
    } else if (count > 1) {
      throw new Error(
        `Arguments ${options.join(
          ", "
        )} and ${lastOption} are mutually exclusive`
      );
    }

    return true;
  };
}

export async function main(): Promise<void> {
  const yargs = makeCLI(hideBin(process.argv))
    .command(
      // the default is to simply print the help menu
      ["*"],
      false,
      () => {},
      () => {
        yargs.showHelp("log");
      }
    )
    .scriptName("wrangler")
    .wrap(null);

  // you will note that we use the form for all commands where we use the builder function
  // to define options and subcommands. Further we return the result of this builder even
  // tho it's not completely necessary. The reason is that it's required for type inference
  // of the args in the handle function.I wish we could enforce this pattern, but this
  // comment will have to do for now.

  // also annoying that choices[] doesn't get inferred as an enum. bleh.

  // [DEPRECATED] generate
  yargs.command(
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
      console.error(
        "`wrangler generate` has been deprecated, please refer to TODO://some/path for alternatives"
      );
    }
  );

  // init
  yargs.command(
    "init [name]",
    "📥 Create a wrangler.toml configuration file",
    (yargs) => {
      return yargs.positional("name", {
        describe: "The name of your worker.",
        type: "string",
      });
    },
    async (args) => {
      const destination = path.join(process.cwd(), "wrangler.toml");
      if (fs.existsSync(destination)) {
        console.error(`${destination} already exists.`);
        return;
      }
      const name = args.name || path.basename(process.cwd());
      const compatibilityDate = new Date()
        .toISOString()
        .substring(0, 10)
        .replace(/-/g, "/");
      try {
        await writeFile(
          destination,
          `name = "${name}"
compatibility_date = "${compatibilityDate}"
`
        );
        console.log(`✨ Succesfully created wrangler.toml`);
        // TODO: suggest next steps?
      } catch (err) {
        console.error(`Failed to create wrangler.toml`);
        console.error(err);
        throw err;
      }
    }
  );

  // build
  yargs.command(
    "build",
    false,
    (yargs) => {
      return yargs.option("env", {
        describe: "Perform on a specific environment",
      });
    },
    () => {
      // "[DEPRECATED] 🦀 Build your project (if applicable)",
      console.error(
        "`wrangler build` has been deprecated, please refer to TODO://some/path for alternatives"
      );
    }
  );

  // login
  yargs.command(
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
        await login({ scopes: args.scopes });
        return;
      }
      await login();

      // TODO: would be nice if it optionally saved login
      // creds inside node_modules/.cache or something
      // this way you could have multiple users on a single machine
    }
  );

  // logout
  yargs.command(
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
  yargs.command(
    "whoami",
    false, // we don't need to show this the menu
    // "🕵️  Retrieve your user info and test your auth config",
    () => {},
    (args) => {
      console.log(":whoami", args);
    }
  );

  // config
  yargs.command(
    "config",
    false,
    () => {},
    () => {
      // "🕵️  Authenticate Wrangler with a Cloudflare API Token",
      console.error(
        "`wrangler config` has been deprecated, please refer to TODO://some/path for alternatives"
      );
    }
  );

  // dev
  yargs.command(
    "dev <filename>",
    "👂 Start a local server for developing your worker",
    (yargs) => {
      return yargs
        .positional("filename", { describe: "entry point", type: "string" })
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
            "Host to forward requests to, defaults to the zone of project or to tutorial.cloudflareworkers.com if unauthenticated",
        })
        .option("local-protocol", {
          default: "http",
          describe: "Protocol to listen to requests on, defaults to http.",
          choices: ["http", "https"],
        })
        .option("public", {
          describe: "Static assets to be served",
          type: "string",
        })
        .option("site", {
          describe: "Root folder of static assets for Workers Sites",
          type: "string",
        })
        .option("upstream-protocol", {
          default: "https",
          describe:
            "Protocol to forward requests to host on, defaults to https.",
          choices: ["http", "https"],
        });
    },
    async (args) => {
      const { filename, format } = args;
      const config = args.config as Config;

      // -- snip, extract --

      if (!args.local) {
        const loggedIn = await loginOrRefreshIfRequired();
        if (!loggedIn) {
          // didn't login, let's just quit
          console.log("Did not login, quitting...");
          return;
        }
        if (!config.account_id) {
          config.account_id = await getAccountId();
          if (!config.account_id) {
            console.error("No account id found, quitting...");
            return;
          }
        }
      }

      // -- snip, end --

      const envRootObj = args.env ? config[`env.${args.env}`] : config;

      render(
        <Dev
          name={args.name || config.name}
          entry={filename}
          format={format}
          initialMode={args.local ? "local" : "remote"}
          accountId={config.account_id}
          site={args.site || config.site?.bucket}
          port={args.port || config.dev?.port}
          public={args.public}
          variables={{
            ...(envRootObj?.vars || {}),
            ...(envRootObj?.kv_namespaces || []).reduce(
              (obj, { binding, preview_id }) => {
                if (!preview_id) {
                  // TODO: This error has to be a _lot_ better, ideally just asking
                  // to create a preview namespace for the user automatically
                  throw new Error(
                    "kv namespaces need a preview id during dev mode"
                  );
                }
                return { ...obj, [binding]: { namespaceId: preview_id } };
              },
              {}
            ),
          }}
        />
      );
    }
  );

  // publish
  yargs.command(
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
        .option("public", {
          describe: "Static assets to be served",
          type: "string",
        })
        .option("site", {
          describe: "Root folder of static assets for Workers Sites",
          type: "string",
        })
        .option("triggers", {
          describe: "an array of crons",
          type: "array",
        })
        .option("zone", {
          describe: "a domain or a zone id",
          alias: "zone_id",
          type: "string",
        })
        .option("routes", {
          describe: "routes to upload",
          alias: "route",
          type: "array",
        });
    },
    async (args) => {
      if (args.local) {
        console.error("🚫  Local publishing is not yet supported");
        return;
      }
      const config = args.config as Config;

      // -- snip, extract --
      if (!args.local) {
        const loggedIn = await loginOrRefreshIfRequired();
        if (!loggedIn) {
          // didn't login, let's just quit
          console.log("Did not login, quitting...");
          return;
        }
        if (!config.account_id) {
          config.account_id = await getAccountId();
          if (!config.account_id) {
            console.error("No account id found, quitting...");
            return;
          }
        }
      }

      // -- snip, end --

      await publish({
        config: args.config as Config,
        name: args.name,
        script: args.script,
        env: args.env,
        zone: args.zone,
        triggers: args.triggers,
        routes: args.routes,
        public: args.public,
        site: args.site,
      });
    }
  );

  // tail
  yargs.command(
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
          })
          .option("header", {
            type: "string",
            describe: "Filter by HTTP header",
          })
          .option("method", {
            type: "string",
            describe: "Filter by HTTP method",
          })
          .option("sampling-rate", {
            type: "number",
            describe: "Adds a percentage of requests to log sampling rate",
          })
          .option("search", {
            type: "string",
            describe: "Filter by a text match in console.log messages",
          })
          .option("env", {
            type: "string",
            describe: "Perform on a specific environment",
          })
      );
      // TODO: filter by client ip, which can be 'self' or an ip address
    },
    async (args) => {
      const config = args.config as Config;

      if (!(args.name || config.name)) {
        console.error("Missing script name");
        return;
      }
      const scriptName = `${args.name || config.name}${
        args.env ? `-${args.env}` : ""
      }`;

      // -- snip, extract --

      if (!args.local) {
        const loggedIn = await loginOrRefreshIfRequired();
        if (!loggedIn) {
          // didn't login, let's just quit
          console.log("Did not login, quitting...");
          return;
        }
        if (!config.account_id) {
          config.account_id = await getAccountId();
          if (!config.account_id) {
            console.error("No account id found, quitting...");
            return;
          }
        }
      }

      // -- snip, end --

      const accountId = config.account_id;

      const filters = {
        status: args.status as "ok" | "error" | "canceled",
        header: args.header,
        method: args.method,
        "sampling-rate": args["sampling-rate"],
        search: args.search,
      };

      const { tail, expiration, /* sendHeartbeat, */ deleteTail } =
        await createTail(accountId, scriptName, filters);

      console.log(
        `successfully created tail, expires at ${expiration.toLocaleString()}`
      );

      onExit(() => {
        tail.terminate();
        deleteTail();
      });

      tail.on("message", (data) => {
        console.log(JSON.stringify(JSON.parse(data.toString()), null, "  "));
      });

      while (tail.readyState !== tail.OPEN) {
        switch (tail.readyState) {
          case tail.CONNECTING:
            await setTimeout(1000);
            break;
          case tail.CLOSING:
            await setTimeout(1000);
            break;
          case tail.CLOSED:
            process.exit(1);
        }
      }

      console.log(`Connected to ${scriptName}, waiting for logs...`);
    }
  );

  // preview
  yargs.command(
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
      // "🔬 [DEPRECATED] Preview your code temporarily on cloudflareworkers.com"
      console.error(
        "`wrangler preview` has been deprecated, please refer to TODO://some/path for alternatives"
      );
    }
  );

  // route
  yargs.command(
    "route",
    false, // I think we want to hide this command
    // "➡️  List or delete worker routes",
    (yargs) => {
      return yargs
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
            const zone = args.zone || (args.config as Config).zone_id;
            if (!zone) {
              console.error("missing zone id");
              return;
            }

            console.log(await cfetch(`/zones/${zone}/workers/routes`));
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
            const zone = args.zone || (args.config as Config).zone_id;
            if (!zone) {
              throw new Error("missing zone id");
            }

            console.log(
              await cfetch(`/zones/${zone}/workers/routes/${args.id}`, {
                method: "DELETE",
              })
            );
          }
        );
    }
  );

  // subdomain
  yargs.command(
    "subdomain [name]",
    false,
    // "👷 Create or change your workers.dev subdomain.",
    (yargs) => {
      return yargs.positional("name", { type: "string" });
    },
    () => {
      console.error(
        "`wrangler subdomain` has been deprecated, please refer to TODO://some/path for alternatives"
      );
    }
  );

  // secret
  yargs.command(
    "secret",
    "🤫 Generate a secret that can be referenced in the worker script",
    (yargs) => {
      return yargs
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
            if (args.local) {
              console.error("--local not implemented for this command yet");
              return;
            }
            const config = args.config as Config;

            // TODO: use environment (how does current wrangler do it?)
            const scriptName = args.name || config.name;
            if (!scriptName) {
              console.error("Missing script name");
              return;
            }

            // -- snip, extract --

            if (!args.local) {
              const loggedIn = await loginOrRefreshIfRequired();
              if (!loggedIn) {
                // didn't login, let's just quit
                console.log("Did not login, quitting...");
                return;
              }
              if (!config.account_id) {
                config.account_id = await getAccountId();
                if (!config.account_id) {
                  console.error("No account id found, quitting...");
                  return;
                }
              }
            }

            // -- snip, end --

            const { unmount } = render(
              <GetSecretValue
                onSubmit={async (value) => {
                  unmount();
                  async function submitSecret() {
                    return await cfetch(
                      `/accounts/${config.account_id}/workers/scripts/${scriptName}/secrets/`,
                      {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          name: args.key,
                          text: value,
                          type: "secret_text",
                        }),
                      }
                    );
                  }

                  try {
                    console.log(await submitSecret());
                  } catch (e) {
                    if (e.code === 10007) {
                      // upload a draft worker
                      await cfetch(
                        `/accounts/${config.account_id}/workers/scripts/${scriptName}`,
                        {
                          method: "PUT",
                          // @ts-expect-error TODO: fix this error!
                          body: toFormData({
                            main: {
                              name: scriptName,
                              content: `export default { fetch() {} }`,
                              type: "esm",
                            },
                            variables: {},
                            modules: [],
                          }),
                        }
                      );

                      // and then try again
                      console.log(await submitSecret());
                      // TODO: delete the draft worker if this failed too?
                    }
                  }
                }}
              />
            );
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
            if (args.local) {
              console.error("--local not implemented for this command yet");
              return;
            }
            const config = args.config as Config;

            // TODO: use environment (how does current wrangler do it?)
            const scriptName = args.name || config.name;
            if (!scriptName) {
              throw new Error("Missing script name");
            }

            // -- snip, extract --

            if (!args.local) {
              const loggedIn = await loginOrRefreshIfRequired();
              if (!loggedIn) {
                // didn't login, let's just quit
                console.log("Did not login, quitting...");
                return;
              }
              if (!config.account_id) {
                config.account_id = await getAccountId();
                if (!config.account_id) {
                  console.error("No account id found, quitting...");
                  return;
                }
              }
            }

            // -- snip, end --

            const { unmount } = render(
              <DeleteConfirmation
                onConfirm={async (confirmation: boolean) => {
                  unmount();
                  if (confirmation) {
                    console.log(
                      `Deleting the secret ${args.key} on script ${scriptName}.`
                    );

                    console.log(
                      await cfetch(
                        `/accounts/${config.account_id}/workers/scripts/${scriptName}/secrets/${args.key}`,
                        { method: "DELETE" }
                      )
                    );
                  }
                }}
              />
            );
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
            if (args.local) {
              console.error("--local not implemented for this command yet");
              return;
            }
            const config = args.config as Config;

            // TODO: use environment (how does current wrangler do it?)
            const scriptName = args.name || config.name;
            if (!scriptName) {
              console.error("Missing script name");
              return;
            }

            // -- snip, extract --

            if (!args.local) {
              const loggedIn = await loginOrRefreshIfRequired();
              if (!loggedIn) {
                // didn't login, let's just quit
                console.log("Did not login, quitting...");
                return;
              }
              if (!config.account_id) {
                config.account_id = await getAccountId();
                if (!config.account_id) {
                  console.error("No account id found, quitting...");
                  return;
                }
              }
            }

            // -- snip, end --

            console.log(
              await cfetch(
                `/accounts/${config.account_id}/workers/scripts/${scriptName}/secrets`
              )
            );
          }
        );
    }
  );

  // kv
  // :namespace
  yargs.command(
    "kv:namespace",
    "🗂️  Interact with your Workers KV Namespaces",
    (yargs) => {
      return yargs
        .command(
          "create <namespace>",
          "Create a new namespace",
          (yargs) => {
            return yargs
              .positional("namespace", {
                describe: "The name of the new namespace",
                type: "string",
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
            if (args._.length !== 2) {
              throw new Error(
                `Did you forget to add quotes around "${
                  args.namespace
                } ${args._.slice(2).join(" ")}"?`
              );
            }
            const config = args.config as Config;
            if (!config.name) {
              console.warn(
                "No configured name present, using `worker` as a prefix for the title"
              );
            }

            const title = `${config.name || "worker"}${
              args.env ? `-${args.env}` : ""
            }-${args.namespace}${args.preview ? "_preview" : ""}`;

            if (/[\W]+/.test(args.namespace)) {
              throw new Error("invalid binding name, needs to be js friendly");
            }

            if (args.local) {
              const { Miniflare } = await import("miniflare");
              const mf = new Miniflare({
                kvPersist: (args.kvPersist as string) || true,
                // TODO: these options shouldn't be required
                script: ` `, // has to be a string with at least one char
              });
              mf.getKVNamespace(title); // this should "create" the namespace
              console.log(`✨ Success! Created KV namespace ${title}`);
              return;
            }

            // -- snip, extract --

            if (!args.local) {
              const loggedIn = await loginOrRefreshIfRequired();
              if (!loggedIn) {
                // didn't login, let's just quit
                console.log("Did not login, quitting...");
                return;
              }
              if (!config.account_id) {
                config.account_id = await getAccountId();
                if (!config.account_id) {
                  console.error("No account id found, quitting...");
                  return;
                }
              }
            }

            // -- snip, end --

            // TODO: generate a binding name stripping non alphanumeric chars

            console.log(`🌀 Creating namespace with title "${title}"`);

            const response = await cfetch<{ id: string }>(
              `/accounts/${config.account_id}/storage/kv/namespaces`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  title,
                }),
              }
            );

            console.log("✨ Success!");
            console.log(
              `Add the following to your configuration file in your kv_namespaces array${
                args.env ? ` under [env.${args.env}]` : ""
              }:`
            );
            console.log(
              `{ binding = "${args.namespace}", ${
                args.preview ? "preview_" : ""
              }id = ${response.id} }`
            );
          }
        )
        .command(
          "list",
          "Outputs a list of all KV namespaces associated with your account id.",
          {},
          async (args) => {
            if (args.local) {
              console.error(`local mode is not yet supported for this command`);
              return;
            }

            const config = args.config as Config;

            // -- snip, extract --

            if (!args.local) {
              const loggedIn = await loginOrRefreshIfRequired();
              if (!loggedIn) {
                // didn't login, let's just quit
                console.log("Did not login, quitting...");
                return;
              }
              if (!config.account_id) {
                config.account_id = await getAccountId();
                if (!config.account_id) {
                  console.error("No account id found, quitting...");
                  return;
                }
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
            if (args.local) {
              console.error(`local mode is not yet supported for this command`);
              return;
            }
            const config = args.config as Config;

            const id =
              args["namespace-id"] ||
              (args.env
                ? config[`env.${args.env}`]
                : config
              ).kv_namespaces.find(
                (namespace) => namespace.binding === args.binding
              )[args.preview ? "preview_id" : "id"];
            if (!id) {
              throw new Error("Are you sure? id not found");
            }

            // -- snip, extract --

            if (!args.local) {
              const loggedIn = await loginOrRefreshIfRequired();
              if (!loggedIn) {
                // didn't login, let's just quit
                console.log("Did not login, quitting...");
                return;
              }

              if (!config.account_id) {
                config.account_id = await getAccountId();
                if (!config.account_id) {
                  console.error("No account id found, quitting...");
                  return;
                }
              }
            }

            // -- snip, end --

            await cfetch<{ id: string }>(
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
        );
    }
  );

  // :key
  yargs.command(
    "kv:key",
    "🔑 Individually manage Workers KV key-value pairs",
    (yargs) => {
      return yargs
        .command(
          "put <key> <value>",
          "Writes a single key/value pair to the given namespace.",
          (yargs) => {
            return yargs
              .positional("key", {
                type: "string",
                describe: "The key to write to.",
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
              });
          },
          async ({ key, ttl, expiration, ...args }) => {
            const namespaceId = getNamespaceId(args);
            const value = args.path
              ? await readFile(args.path, "utf-8")
              : args.value;
            const config = args.config as Config;

            console.log(`writing ${key}=${value} to namespace ${namespaceId}`);
            if (args.local) {
              const { Miniflare } = await import("miniflare");
              const mf = new Miniflare({
                kvPersist: (args.kvPersist as string) || true,
                // TODO: these options shouldn't be required
                script: ` `, // has to be a string with at least one char
              });
              const ns = await mf.getKVNamespace(namespaceId);
              await ns.put(key, value, { expiration, expirationTtl: ttl });
              return;
            }
            // -- snip, extract --

            if (!args.local) {
              const loggedIn = await loginOrRefreshIfRequired();
              if (!loggedIn) {
                // didn't login, let's just quit
                console.log("Did not login, quitting...");
                return;
              }

              if (!config.account_id) {
                config.account_id = await getAccountId();
                if (!config.account_id) {
                  console.error("No account id found, quitting...");
                  return;
                }
              }
            }

            // -- snip, end --

            await putKeyValue(config.account_id, namespaceId, key, value, {
              expiration,
              expiration_ttl: ttl,
            });
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
              .option("prefix", {
                type: "string",
                describe: "A prefix to filter listed keys",
              });
          },
          async ({ prefix, ...args }) => {
            // TODO: support for limit+cursor (pagination)

            const namespaceId = getNamespaceId(args);
            const config = args.config as Config;

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
              return;
            }

            // -- snip, extract --

            if (!args.local) {
              const loggedIn = await loginOrRefreshIfRequired();
              if (!loggedIn) {
                // didn't login, let's just quit
                console.log("Did not login, quitting...");
                return;
              }

              if (!config.account_id) {
                config.account_id = await getAccountId();
                if (!config.account_id) {
                  console.error("No account id found, quitting...");
                  return;
                }
              }
            }

            // -- snip, end --

            console.log(
              await listNamespaceKeys(config.account_id, namespaceId, prefix)
            );
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
              });
          },
          async ({ key, ...args }) => {
            const namespaceId = getNamespaceId(args);
            const config = args.config as Config;

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

            // -- snip, extract --

            if (!args.local) {
              const loggedIn = await loginOrRefreshIfRequired();
              if (!loggedIn) {
                // didn't login, let's just quit
                console.log("Did not login, quitting...");
                return;
              }

              if (!config.account_id) {
                config.account_id = await getAccountId();
                if (!config.account_id) {
                  console.error("No account id found, quitting...");
                  return;
                }
              }
            }

            // -- snip, end --

            // annoyingly, the API for this one doesn't return the
            // data in the 'standard' format. goddamit.
            // That's why we have the fallthrough response in cfetch.
            // Oh well.
            console.log(
              await cfetch(
                `/accounts/${config.account_id}/storage/kv/namespaces/${namespaceId}/values/${key}`
              )
            );
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
            const namespaceId = getNamespaceId(args);

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

            const config = args.config as Config;

            // -- snip, extract --

            if (!args.local) {
              const loggedIn = await loginOrRefreshIfRequired();
              if (!loggedIn) {
                // didn't login, let's just quit
                console.log("Did not login, quitting...");
                return;
              }

              if (!config.account_id) {
                config.account_id = await getAccountId();
                if (!config.account_id) {
                  console.error("No account id found, quitting...");
                  return;
                }
              }
            }

            // -- snip, end --

            await cfetch(
              `/accounts/${config.account_id}/storage/kv/namespaces/${namespaceId}/values/${key}`,
              { method: "DELETE" }
            );
          }
        );
    }
  );

  // :bulk
  yargs.command(
    "kv:bulk",
    "💪 Interact with multiple Workers KV key-value pairs at once",
    (yargs) => {
      return yargs
        .command(
          "put <filename>",
          "Upload multiple key-value pairs to a namespace",
          (yargs) => {
            return yargs
              .positional("filename", {
                describe: `The JSON file of key-value pairs to upload, in form [{"key":..., "value":...}"...]`,
                type: "string",
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

            const namespaceId = getNamespaceId(args);
            const config = args.config as Config;
            const content = await readFile(filename, "utf-8");
            let parsedContent;
            try {
              parsedContent = JSON.parse(content);
            } catch (err) {
              console.error(`could not parse json from ${filename}`);
              throw err;
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

              return;
            }

            // -- snip, extract --

            if (!args.local) {
              const loggedIn = await loginOrRefreshIfRequired();
              if (!loggedIn) {
                // didn't login, let's just quit
                console.log("Did not login, quitting...");
                return;
              }

              if (!config.account_id) {
                config.account_id = await getAccountId();
                if (!config.account_id) {
                  console.error("No account id found, quitting...");
                  return;
                }
              }
            }

            // -- snip, end --

            console.log(
              await putBulkKeyValue(config.account_id, namespaceId, content)
            );
          }
        )
        .command(
          "delete <filename>",
          "Upload multiple key-value pairs to a namespace",
          (yargs) => {
            return yargs
              .positional("filename", {
                describe: `The JSON file of key-value pairs to upload, in form ["key1", "key2", ...]`,
                type: "string",
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
            const namespaceId = getNamespaceId(args);
            const config = args.config as Config;
            const content = await readFile(filename, "utf-8");
            let parsedContent;
            try {
              parsedContent = JSON.parse(content);
            } catch (err) {
              console.error(`could not parse json from ${filename}`);
              throw err;
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

              return;
            }

            // -- snip, extract --

            if (!args.local) {
              const loggedIn = await loginOrRefreshIfRequired();
              if (!loggedIn) {
                // didn't login, let's just quit
                console.log("Did not login, quitting...");
                return;
              }

              if (!config.account_id) {
                config.account_id = await getAccountId();
                if (!config.account_id) {
                  console.error("No account id found, quitting...");
                  return;
                }
              }
            }

            // -- snip, end --

            console.log(
              await deleteBulkKeyValue(config.account_id, namespaceId, content)
            );
          }
        );
    }
  );

  yargs.command("pages", "⚡️ Configure Cloudflare Pages", pages);

  yargs
    .option("config", {
      describe: "Path to .toml configuration file",
      type: "string",
      async coerce(arg) {
        return await readConfig(arg);
      },
    })
    .option("local", {
      describe: "Run on my machine",
      type: "boolean",
      default: false, // I bet this will a point of contention. We'll revisit it.
    });

  yargs.group(["config", "help", "version"], "Flags:");

  await initialiseUserConfig();

  yargs.parse();

  // yargs.version("0.0.0");
}
