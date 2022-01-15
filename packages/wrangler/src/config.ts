import assert from "node:assert";

/**
 * This is the static type definition for the configuration object.
 * It reflects the configuration that you can write in wrangler.toml,
 * and optionally augment with arguments passed directly to wrangler.
 * The type definition doesn't fully reflect the constraints applied
 * to the configuration, but it is a good starting point. Later, we
 * also defined a validator function that will validate the configuration
 * with the same rules as the type definition, as well as the extra
 * constraints. The type definition is good for asserting correctness
 * in the wrangler codebase, whereas the validator function is useful
 * for signalling errors in the configuration to a user of wrangler.
 *
 * For more information about the configuration object, see the
 * documentation at https://developers.cloudflare.com/workers/cli-wrangler/configuration
 *
 * Legend for the annotations:
 *
 * *:optional means providing a value isn't mandatory
 * *:deprecated means the field itself isn't necessary anymore in wrangler.toml
 * *:breaking means the deprecation/optionality is a breaking change from wrangler 1
 * *:todo means there's more work to be done (with details attached)
 * *:inherited means the field is copied to all environments
 */
export type Config = {
  /**
   * The name of your worker. Alphanumeric + dashes only.
   *
   * @optional
   * @inherited
   */
  name?: string;

  /**
   * The entrypoint/path to the JavaScript file that will be executed.
   *
   * @optional
   * @inherited
   * @todo this needs to be implemented!
   */
  entry?: string;

  /**
   * This is the ID of the account associated with your zone.
   * You might have more than one account, so make sure to use
   * the ID of the account associated with the zone/route you
   * provide, if you provide one. It can also be specified through
   * the CF_ACCOUNT_ID environment variable.
   *
   * @optional
   * @inherited
   */
  account_id?: string;

  /**
   * The project "type". A holdover from wrangler 1.x.
   * Valid values were "webpack", "javascript", and "rust".
   *
   * @deprecated DO NOT USE THIS. Most common features now work out of the box with wrangler, including modules, jsx, typescript, etc. If you need anything more, use a custom build.
   * @optional
   * @inherited
   * @breaking
   */
  type?: "webpack" | "javascript" | "rust";

  /**
   * A date in the form yyyy-mm-dd, which will be used to determine
   * which version of the Workers runtime is used. More details at
   * https://developers.cloudflare.com/workers/platform/compatibility-dates
   * @optional true for `dev`, false for `publish`
   * @inherited
   */
  compatibility_date?: string;

  /**
   * A list of flags that enable features from upcoming features of
   * the Workers runtime, usually used together with compatibility_flags.
   * More details at
   * https://developers.cloudflare.com/workers/platform/compatibility-dates
   *
   * @optional
   * @inherited
   * @todo This could be an enum!
   */
  compatibility_flags?: string[];

  /**
   * Whether we use <name>.<subdomain>.workers.dev to
   * test and deploy your worker.
   *
   * @default `true` (This is a breaking change from wrangler 1)
   * @optional
   * @inherited
   * @breaking
   */
  workers_dev?: boolean;

  /**
   * The zone ID of the zone you want to deploy to. You can find this
   * in your domain page on the dashboard.
   *
   * @deprecated This is unnecessary since we can deduce this from routes directly.
   * @optional
   * @inherited
   */
  zone_id?: string;

  /**
   * A list of routes that your worker should be deployed to.
   * Only one of `routes` or `route` is required.
   *
   * @optional false only when workers_dev is false, and there's no scheduled worker
   * @inherited
   */
  routes?: string[];

  /**
   * A route that your worker should be deployed to. Literally
   * the same as routes, but only one.
   * Only one of `routes` or `route` is required.
   *
   * @optional false only when workers_dev is false, and there's no scheduled worker
   * @inherited
   */
  route?: string;

  /**
   * Path to the webpack config to use when building your worker.
   * A holdover from wrangler 1.x, used with `type: "webpack"`.
   *
   * @deprecated DO NOT USE THIS. Most common features now work out of the box with wrangler, including modules, jsx, typescript, etc. If you need anything more, use a custom build.
   * @inherited
   * @breaking
   */
  webpack_config?: string;

  /**
   * The function to use to replace jsx syntax.
   *
   * @default `"React.createElement"`
   * @optional
   * @inherited
   */
  jsx_factory?: string;

  /**
   * The function to use to replace jsx fragment syntax.
   *
   * @default `"React.Fragment"`
   * @optional
   * @inherited
   */
  jsx_fragment?: string;

  /**
   * A map of environment variables to set when deploying your worker.
   * Of note, they can only be strings. Which is unfortunate, really.
   * (TODO: verify that they can only be strings?)
   * NB: these are not inherited, and HAVE to  be duplicated across all environments.
   *
   * @default `{}`
   * @optional
   * @inherited false
   */
  vars?: { [key: string]: string };

  /**
   * A list of durable objects that your worker should be bound to.
   * For more information about Durable Objects, see the documentation at
   * https://developers.cloudflare.com/workers/learning/using-durable-objects
   * NB: these are not inherited, and HAVE to be duplicated across all environments.
   *
   * @default `{ bindings: [] }`
   * @optional
   * @inherited false
   */
  durable_objects?: {
    bindings: {
      /** The name of the binding used to refer to the Durable Object */
      name: string;
      /** The exported class name of the Durable Object */
      class_name: string;
      /** The script where the Durable Object is defined (if it's external to this worker) */
      script_name?: string;
    }[];
  };

  /**
   * These specify any Workers KV Namespaces you want to
   * access from inside your Worker. To learn more about KV Namespaces,
   * see the documentation at https://developers.cloudflare.com/workers/learning/how-kv-works
   * NB: these are not inherited, and HAVE to be duplicated across all environments.
   *
   * @default `[]`
   * @optional
   * @inherited false
   */
  kv_namespaces?: {
    /** The binding name used to refer to the KV Namespace */
    binding: string;
    /** The ID of the KV namespace */
    id: string;
    /** The ID of the KV namespace used during `wrangler dev` */
    preview_id?: string;
  }[];

  /**
   * A list of services that your worker should be bound to.
   * NB: these are not inherited, and HAVE to be duplicated across all environments.
   *
   * @default `[]`
   * @optional
   * @inherited false
   */
  experimental_services?: {
    /** The binding name used to refer to the Service */
    name: string;
    /** The name of the Service being bound */
    service: string;
    /** The Service's environment */
    environment: string;
  }[];

  /**
   * A list of migrations that should be uploaded with your Worker.
   * These define changes in your Durable Object declarations.
   * More details at https://developers.cloudflare.com/workers/learning/using-durable-objects#configuring-durable-object-classes-with-migrations
   * NB: these ARE inherited, and SHOULD NOT be duplicated across all environments.
   *
   * @default `[]`
   * @optional
   * @inherited true
   */
  migrations?: {
    /** A unique identifier for this migration. */
    tag: string;
    /** The new Durable Objects being defined. */
    new_classes?: string[];
    /** The Durable Objects being renamed. */
    renamed_classes?: {
      from: string;
      to: string;
    }[];
    /** The Durable Objects being removed. */
    deleted_classes?: string[];
  }[];

  /**
   * The definition of a Worker Site, a feature that lets you upload
   * static assets with your Worker.
   * More details at https://developers.cloudflare.com/workers/platform/sites
   * NB: This IS inherited, and SHOULD NOT be duplicated across all environments.
   *
   * @default `undefined`
   * @optional
   * @inherited true
   */
  site?: {
    /**
     * The directory containing your static assets. It must be
     * a path relative to your wrangler.toml file.
     * Example: bucket = "./public"
     *
     * optional false
     */
    bucket: string;

    /**
     * The location of your Worker script.
     *
     * @deprecated DO NOT use this (it's a holdover from wrangler 1.x). Either use the top level `entry` field, or pass the path to your entry file as a command line argument.
     * @todo we should use a top level "entry" property instead
     * @breaking
     */
    "entry-point": string;

    /**
     * An exclusive list of .gitignore-style patterns that match file
     * or directory names from your bucket location. Only matched
     * items will be uploaded. Example: include = ["upload_dir"]
     *
     * @optional
     * @default `[]`
     * @todo this needs to be implemented!
     */
    include?: string[];

    /**
     * A list of .gitignore-style patterns that match files or
     * directories in your bucket that should be excluded from
     * uploads. Example: exclude = ["ignore_dir"]
     *
     * @optional
     * @default `[]`
     * @todo this needs to be implemented!
     */
    exclude?: string[];
  };

  /**
   * "Cron" definitions to trigger a worker's "scheduled" function.
   * Lets you call workers periodically, much like a cron job.
   * More details here https://developers.cloudflare.com/workers/platform/cron-triggers
   *
   * @inherited
   * @default `{ crons: [] }`
   * @optional
   * @todo can we use typescript for cron patterns?
   */
  triggers?: { crons: string[] };

  /**
   * Options to configure the development server that your worker will use.
   * NB: This is NOT inherited, and SHOULD NOT be duplicated across all environments.
   *
   * @default `{}`
   * @optional
   * @inherited false
   */
  dev?: {
    /**
     * IP address for the local dev server to listen on,
     *
     * @default `127.0.0.1`
     * @todo this needs to be implemented
     */
    ip?: string;

    /**
     * Port for the local dev server to listen on
     *
     * @default `8787`
     */
    port?: number;

    /**
     * Protocol that local wrangler dev server listens to requests on.
     *
     * @default `http`
     * @todo this needs to be implemented
     */
    local_protocol?: string;

    /**
     * Protocol that wrangler dev forwards requests on
     *
     * @default `https`
     * @todo this needs to be implemented
     */
    upstream_protocol?: string;
  };

  /**
   * Specifies the Usage Model for your Worker. There are two options -
   * [bundled](https://developers.cloudflare.com/workers/platform/limits#bundled-usage-model) and
   * [unbound](https://developers.cloudflare.com/workers/platform/limits#unbound-usage-model).
   * For newly created Workers, if the Usage Model is omitted
   * it will be set to the [default Usage Model set on the account](https://dash.cloudflare.com/?account=workers/default-usage-model).
   * For existing Workers, if the Usage Model is omitted, it will be
   * set to the Usage Model configured in the dashboard for that Worker.
   */
  usage_model?: undefined | "bundled" | "unbound";

  /**
   * Configures a custom build step to be run by Wrangler when
   * building your Worker. Refer to the [custom builds documentation](https://developers.cloudflare.com/workers/cli-wrangler/configuration#build)
   * for more details.
   *
   * @default `undefined`
   * @optional
   * @inherited false
   */
  build?: {
    /** The command used to build your Worker. On Linux and macOS, the command is executed in the `sh` shell and the `cmd` shell for Windows. The `&&` and `||` shell operators may be used. */
    command?: string;
    /** The directory in which the command is executed. */
    cwd?: string;
    /** The directory to watch for changes while using wrangler dev, defaults to the current working directory */
    watch_dir?: string;
  } & /**
   * Much of the rest of this configuration isn't necessary anymore
   * in wrangler2. We infer the format automatically, and we can pass
   * the path to the script either in the CLI (or, @todo, as the top level
   * `entry` property).
   */ (
    | {
        upload?: {
          /**
           * The format of the Worker script, must be "service-worker".
           *
           * @deprecated We infer the format automatically now.
           */
          format: "service-worker";

          /**
           * The path to the Worker script. This should be replaced
           * by the top level `entry' property.
           *
           * @deprecated This will be replaced by the top level `entry' property.
           */
          main: string;
        };
      }
    | {
        /**
         * When we use the module format, we only really
         * need to specify the entry point. The format is deduced
         * automatically in wrangler2.
         */
        upload?: {
          /**
           * The format of the Worker script, must be "modules".
           *
           * @deprecated We infer the format automatically now.
           */
          format: "modules";

          /**
           * The directory you wish to upload your modules from,
           * defaults to the dist relative to the project root directory.
           *
           * @deprecated
           * @breaking
           */
          dir?: string;

          /**
           * The path to the Worker script. This should be replaced
           * by the top level `entry' property.
           *
           * @deprecated This will be replaced by the top level `entry' property.
           */
          main?: string;

          /**
           * An ordered list of rules that define which modules to import,
           * and what type to import them as. You will need to specify rules
           * to use Text, Data, and CompiledWasm modules, or when you wish to
           * have a .js file be treated as an ESModule instead of CommonJS.
           *
           * @deprecated These are now inferred automatically for major file types, but you can still specify them manually.
           * @todo this needs to be implemented!
           * @breaking
           */
          rules?: {
            type: "ESModule" | "CommonJS" | "Text" | "Data" | "CompiledWasm";
            globs: string[];
            fallthrough?: boolean;
          };
        };
      }
  );

  /**
   * The `env` section defines overrides for the configuration for
   * different environments. Most fields can be overridden, while
   * some have to be specifically duplicated in every environment.
   * For more information, see the documentation at https://developers.cloudflare.com/workers/cli-wrangler/configuration#environments
   */
  env?: {
    [envName: string]:
      | undefined
      | Omit<Config, "env" | "migrations" | "site" | "dev">;
  };
};

type ValidationResults = (
  | { key: string; info: string }
  | { key: string; error: string }
  | { key: string; warning: string }
)[];

/**
 * We also define a validation function that manually validates
 * every field in the configuration as per the type definitions,
 * as well as extra constraints we apply to some fields, as well
 * as some constraints on combinations of fields. This is useful for
 * presenting errors and messages to the user. Eventually, we will
 * combine this with some automatic config rewriting tools.
 *
 */
export async function validateConfig(
  _config: Partial<Config>
): Promise<ValidationResults> {
  const results: ValidationResults = [];

  return results;
}

/**
 * Process the environments (`env`) specified in the `config`.
 *
 * The environments configuration is complicated since each environment is a customized version of the main config.
 * Some of the configuration can be inherited from the main config, while other configuration must replace what is in the main config.
 *
 * This function ensures that each environment is set up correctly with inherited configuration, as necessary.
 * It will log a warning if an environment is missing required configuration.
 */
export function normaliseAndValidateEnvironmentsConfig(config: Config) {
  if (config.env == undefined) {
    // There are no environments specified so there is nothing to do here.
    return;
  }

  const environments = config.env;

  for (const envKey of Object.keys(environments)) {
    const environment = environments[envKey];

    // Given how TOML works, there should never be an environment containing nothing.
    // I.e. if there is a section in a TOML file, then the parser will create an object for it.
    // But it may be possible in the future if we change how the configuration is stored.
    assert(
      environment,
      `Environment ${envKey} is specified in the config but not defined.`
    );

    // Fall back on "inherited fields" from the config, if not specified in the environment.
    const inheritedFields = [
      "name",
      "account_id",
      "workers_dev",
      "compatibility_date",
      "compatibility_flags",
      "zone_id",
      "routes",
      "route",
      "jsx_factory",
      "jsx_fragment",
      "site",
      "triggers",
      "usage_model",
    ];
    for (const inheritedField of inheritedFields) {
      if (config[inheritedField] !== undefined) {
        if (environment[inheritedField] === undefined) {
          environment[inheritedField] = config[inheritedField]; // TODO: - shallow or deep copy?
        }
      }
    }

    // Warn if there is a "required" field in the top level config that has not been specified specified in the environment.
    // These required fields are `vars`, `durable_objects`, `kv_namespaces` and `experimental_services`.
    // Each of them has different characteristics that need to be checked.

    // `vars` is just an object
    if (config.vars !== undefined) {
      if (environment.vars === undefined) {
        console.warn(
          `In your configuration, "vars" exists at the top level, but not on "env.${envKey}".\n` +
            `This is not what you probably want, since "vars" is not inherited by environments.\n` +
            `Please add "vars" to "env.${envKey}".`
        );
      } else {
        for (const varField of Object.keys(config.vars)) {
          if (!(varField in environment.vars)) {
            console.warn(
              `In your configuration, "vars.${varField}" exists at the top level, but not on "env.${envKey}".\n` +
                `This is not what you probably want, since "vars" is not inherited by environments.\n` +
                `Please add "vars.${varField}" to "env.${envKey}".`
            );
          }
        }
      }
    }

    // `durable_objects` is an object containing a `bindings` array
    if (config.durable_objects !== undefined) {
      if (environment.durable_objects === undefined) {
        console.warn(
          `In your configuration, "durable_objects.bindings" exists at the top level, but not on "env.${envKey}".\n` +
            `This is not what you probably want, since "durable_objects" is not inherited by environments.\n` +
            `Please add "durable_objects.bindings" to "env.${envKey}".`
        );
      } else {
        const envBindingNames = new Set(
          environment.durable_objects.bindings.map((b) => b.name)
        );
        for (const bindingName of config.durable_objects.bindings.map(
          (b) => b.name
        )) {
          if (!envBindingNames.has(bindingName)) {
            console.warn(
              `In your configuration, there is a durable_objects binding with name "${bindingName}" at the top level, but not on "env.${envKey}".\n` +
                `This is not what you probably want, since "durable_objects" is not inherited by environments.\n` +
                `Please add a binding for "${bindingName}" to "env.${envKey}.durable_objects.bindings".`
            );
          }
        }
      }
    }

    // `kv_namespaces` contains an array of namespace bindings
    if (config.kv_namespaces !== undefined) {
      if (environment.kv_namespaces === undefined) {
        console.warn(
          `In your configuration, "kv_namespaces" exists at the top level, but not on "env.${envKey}".\n` +
            `This is not what you probably want, since "kv_namespaces" is not inherited by environments.\n` +
            `Please add "kv_namespaces" to "env.${envKey}".`
        );
      } else {
        const envBindings = new Set(
          environment.kv_namespaces.map((kvNamespace) => kvNamespace.binding)
        );
        for (const bindingName of config.kv_namespaces.map(
          (kvNamespace) => kvNamespace.binding
        )) {
          if (!envBindings.has(bindingName)) {
            console.warn(
              `In your configuration, there is a kv_namespaces with binding "${bindingName}" at the top level, but not on "env.${envKey}".\n` +
                `This is not what you probably want, since "kv_namespaces" is not inherited by environments.\n` +
                `Please add a binding for "${bindingName}" to "env.${envKey}.kv_namespaces".`
            );
          }
        }
      }
    }

    // `experimental_services` contains an array of namespace bindings
    if (config.experimental_services !== undefined) {
      if (environment.experimental_services === undefined) {
        console.warn(
          `In your configuration, "experimental_services" exists at the top level, but not on "env.${envKey}".\n` +
            `This is not what you probably want, since "experimental_services" is not inherited by environments.\n` +
            `Please add "experimental_services" to "env.${envKey}".`
        );
      } else {
        const envBindingNames = new Set(
          environment.experimental_services.map((service) => service.name)
        );
        for (const bindingName of config.experimental_services.map(
          (service) => service.name
        )) {
          if (!envBindingNames.has(bindingName)) {
            console.warn(
              `In your configuration, there is a experimental_services with binding name "${bindingName}" at the top level, but not on "env.${envKey}".\n` +
                `This is not what you probably want, since "experimental_services" is not inherited by environments.\n` +
                `Please add a service for "${bindingName}" to "env.${envKey}.experimental_services".`
            );
          }
        }
      }
    }
  }
}
