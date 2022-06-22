import { dev as wranglerDev } from "./dev";

interface DevOptions {
  name?: string;
  config?: string;
  env?: string;
  compatibilityDate?: string;
  compatibilityFlags?: string[];
  latest?: boolean;
  ip?: string;
  port?: number;
  inspectorPort?: number;
  routes?: string[];
  host?: string;
  localProtocol?: "http" | "https";
  assets?: string;
  site?: string;
  siteInclude?: string[];
  siteExclude?: string[];
  upstreamProtocol?: "http" | "https";
  jsxFactory?: string;
  jsxFragment?: string;
  tsconfig?: string;
  local?: boolean;
  minify?: boolean;
  nodeCompat?: boolean;
  experimentalEnableLocalPersistence?: boolean;
}

export async function dev(script: string, options: DevOptions) {
  await wranglerDev({ script: script, ...options });
}
