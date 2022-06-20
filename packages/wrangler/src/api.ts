import { main } from ".";

interface DevOptions {
  name?: string;
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
  console.log("API called with: script: ", script);
  console.log("API called with: options: ", options);

  const args = ["dev", script];
  if (options.name) {
    args.push(`--name=${options.name}`);
  }
  if (options.env) {
    args.push(`--env=${options.env}`);
  }
  if (options.compatibilityDate) {
    args.push(`--compatibility-date=${options.compatibilityDate}`);
  }
  if (options.compatibilityFlags) {
    //TODO: check if parsing is correct
    args.push(
      `--compatibility-flags=[${options.compatibilityFlags.map(
        (flag) => `'${flag}'`
      )}`
    );
  }
  if (options.latest) {
    args.push(`--latest`);
  }
  if (options.ip) {
    args.push(`--ip=${options.ip}`);
  }
  if (options.port) {
    args.push(`--port=${options.port}`);
  }
  if (options.inspectorPort) {
    args.push(`--inspector-port=${options.inspectorPort}`);
  }
  if (options.routes) {
    //TODO: check if parsing is correct
    args.push(`--routes=${options.routes}`);
  }
  if (options.host) {
    args.push(`--host=${options.host}`);
  }
  if (options.localProtocol) {
    args.push(`--local-protocol=${options.localProtocol}`);
  }
  if (options.assets) {
    args.push(`--assets=${options.assets}`);
  }
  if (options.site) {
    args.push(`--site=${options.site}`);
  }
  if (options.siteInclude) {
    //TODO: check if parsing is correct
    args.push(`--site-include=${options.siteInclude}`);
  }
  if (options.siteExclude) {
    //TODO: check if parsing is correct
    args.push(`--site-exclude=${options.siteExclude}`);
  }
  if (options.upstreamProtocol) {
    args.push(`--upstream-protocol=${options.upstreamProtocol}`);
  }
  if (options.jsxFactory) {
    args.push(`--jsx-factory=${options.jsxFactory}`);
  }
  if (options.jsxFragment) {
    args.push(`--jsx-fragment=${options.jsxFragment}`);
  }
  if (options.tsconfig) {
    args.push(`--tsconfig=${options.tsconfig}`);
  }
  if (options.local) {
    args.push(`--local`);
  }
  if (options.minify) {
    args.push(`--minify`);
  }
  if (options.nodeCompat) {
    args.push(`--node-compat`);
  }
  if (options.experimentalEnableLocalPersistence) {
    args.push(`--experimental-enable-local-persistence`);
  }
  console.log("calling with these args: ", args);
  await main(args);
}
