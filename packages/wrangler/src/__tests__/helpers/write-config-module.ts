import * as fs from "fs";
import type { RawConfig } from "../../config";

export type WriteConfigModuleFormats = "esm" | "cjs" | "ts";
export type WriteConfigModuleOptions = {
  hasConfig?: boolean;
  hasOnConfig?: boolean;
};

const config = (rawConfig: RawConfig) => JSON.stringify(rawConfig);
const onConfig = (isTs = false) => `(initialConfig${
  isTs ? ": Record<string, unknown>" : ""
}) => {
  return {
    ...initialConfig,
    vars: {...initialConfig.vars, transformed: "yes" }
  };
}`;

function getESMModule(
  rawConfig: RawConfig,
  { hasConfig, hasOnConfig }: WriteConfigModuleOptions
): string {
  const pieces: string[] = [];
  if (hasConfig) pieces.push(`export const config = ${config(rawConfig)}`);
  if (hasOnConfig) pieces.push(`export const onConfig = ${onConfig()}`);
  return pieces.join("\n");
}

function getCJSModule(
  rawConfig: RawConfig,
  { hasConfig, hasOnConfig }: WriteConfigModuleOptions
): string {
  const pieces: string[] = ["{"];
  if (hasConfig) pieces.push(`  config: ${config(rawConfig)},`);
  if (hasOnConfig) pieces.push(`  onConfig: ${onConfig()},`);
  pieces.push("}");
  return `module.exports = ${pieces.join("\n")}`;
}

function getTSModule(
  rawConfig: RawConfig,
  { hasConfig, hasOnConfig }: WriteConfigModuleOptions
): string {
  const pieces: string[] = [];
  if (hasConfig) pieces.push(`export const config = ${config(rawConfig)}`);
  if (hasOnConfig) pieces.push(`export const onConfig = ${onConfig(true)}`);
  return pieces.join("\n");
}

export default function writeConfigModule(
  format: WriteConfigModuleFormats,
  rawConfig: RawConfig = {},
  options: WriteConfigModuleOptions = {}
): string {
  let ext = "js";
  let content = "";
  switch (format) {
    case "esm":
      ext = "mjs";
      content = getESMModule(rawConfig, options);
      break;
    case "cjs":
      ext = "js";
      content = getCJSModule(rawConfig, options);
      break;
    case "ts":
      ext = "ts";
      content = getTSModule(rawConfig, options);
      break;
  }
  const filename = `./wrangler.${ext}`;
  // console.log({ ext, content });
  fs.writeFileSync(filename, content, "utf-8");
  return filename;
}
