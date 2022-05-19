import { findUpSync } from "find-up";
import { logger } from "../logger";
import { parseTOML, readFileSync } from "../parse";
import { normalizeAndValidateConfig } from "./validation";
import type { Config, RawConfig } from "./config";

export type {
  Config,
  RawConfig,
  ConfigFields,
  DevConfig,
  RawDevConfig,
} from "./config";
export type {
  Environment,
  RawEnvironment,
  ConfigModuleRuleType,
} from "./environment";

/**
 * Get the Wrangler configuration; read it from the give `configPath` if available.
 */
export function readConfig(
  configPath: string | undefined,
  args: unknown
): Config {
  let rawConfig: RawConfig = {};
  if (!configPath) {
    configPath = findWranglerToml();
  }

  // Load the configuration from disk if available
  if (configPath) {
    rawConfig = parseTOML(readFileSync(configPath), configPath);
  }

  // Process the top-level configuration.
  const { config, diagnostics } = normalizeAndValidateConfig(
    rawConfig,
    configPath,
    args
  );

  if (diagnostics.hasWarnings()) {
    logger.warn(diagnostics.renderWarnings());
  }
  if (diagnostics.hasErrors()) {
    throw new Error(diagnostics.renderErrors());
  }

  return config;
}

/**
 * Find the wrangler.toml file by searching up the file-system
 * from the current working directory.
 */
export function findWranglerToml(
  referencePath: string = process.cwd()
): string | undefined {
  const configPath = findUpSync("wrangler.toml", { cwd: referencePath });
  return configPath;
}

/**
 * Print all the bindings a worker using a given config would have access to
 */
export function printBindings({
  config,
  dev,
}: {
  /**
   * The configuration to get bindings from
   */
  config: Config;

  /**
   * `true` if running in dev mode. Uses `preview_id`s when possible.
   */
  dev: boolean;
}) {
  const truncate = (item: string | Record<string, unknown>) => {
    const s = typeof item === "string" ? item : JSON.stringify(item, null, " ");
    const maxLength = 40;
    if (s.length < maxLength) {
      return s;
    }

    return `${s.substring(0, maxLength - 3)}...`;
  };

  const output: { type: string; entries: { key: string; value: string }[] }[] =
    [];

  const {
    data_blobs,
    durable_objects,
    kv_namespaces,
    r2_buckets,
    services,
    text_blobs,
    unsafe,
    vars,
    wasm_modules,
  } = config;

  if (data_blobs !== undefined && Object.keys(data_blobs).length > 0) {
    output.push({
      type: "Data Blobs",
      entries: Object.entries(data_blobs).map(([key, value]) => ({
        key,
        value: truncate(value),
      })),
    });
  }

  if (durable_objects.bindings.length > 0) {
    output.push({
      type: "Durable Objects",
      entries: durable_objects.bindings.map(
        ({ name, class_name, script_name, environment }) => {
          let value = class_name;
          if (script_name) {
            value += ` (defined in ${script_name})`;
          }
          if (environment) {
            value += ` - ${environment}`;
          }

          return {
            key: name,
            value,
          };
        }
      ),
    });
  }

  if (kv_namespaces.length > 0) {
    output.push({
      type: "KV Namespaces",
      entries: kv_namespaces.map(({ binding, id, preview_id }) => {
        return {
          key: binding,
          value: dev ? preview_id ?? id : id,
        };
      }),
    });
  }

  if (r2_buckets.length > 0) {
    output.push({
      type: "R2 Buckets",
      entries: r2_buckets.map(
        ({ binding, bucket_name, preview_bucket_name }) => {
          return {
            key: binding,
            value: dev ? preview_bucket_name ?? bucket_name : bucket_name,
          };
        }
      ),
    });
  }

  if (services.length > 0) {
    output.push({
      type: "Services",
      entries: services.map(({ binding, service, environment }) => {
        let value = service;
        if (environment) {
          value += ` - ${environment}`;
        }

        return {
          key: binding,
          value,
        };
      }),
    });
  }

  if (text_blobs !== undefined && Object.keys(text_blobs).length > 0) {
    output.push({
      type: "Text Blobs",
      entries: Object.entries(text_blobs).map(([key, value]) => ({
        key,
        value: truncate(value),
      })),
    });
  }

  if (unsafe.bindings.length > 0) {
    const groupedBindings = unsafe.bindings.reduce(
      (grouped, { type, name, ...binding }) => {
        const i = grouped.findIndex((group) => group.type === type);
        if (i < 0) {
          grouped.push({
            type,
            entries: [
              {
                key: name,
                value: truncate(binding),
              },
            ],
          });
        } else {
          grouped[i].entries.push({
            key: name,
            value: truncate(binding),
          });
        }

        return grouped;
      },
      [] as typeof output
    );

    output.push(...groupedBindings);
  }

  if (vars !== undefined && Object.keys(vars).length > 0) {
    output.push({
      type: "Vars",
      entries: Object.entries(vars).map(([key, value]) => ({
        key,
        value: truncate(`${value}`),
      })),
    });
  }

  if (wasm_modules !== undefined && Object.keys(wasm_modules).length > 0) {
    output.push({
      type: "Wasm Modules",
      entries: Object.entries(wasm_modules).map(([key, value]) => ({
        key,
        value: truncate(value),
      })),
    });
  }

  if (output.length === 0) {
    return;
  }

  const message = [
    `Your worker has access to the following:`,
    ...output
      .map((bindingGroup) => {
        return [
          bindingGroup.type,
          bindingGroup.entries.map(({ key, value }) => `\t- ${key}: ${value}`),
        ];
      })
      .flat(2),
  ].join("\n");

  logger.log(message);
}
