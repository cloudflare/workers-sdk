// we're going to manually write both the type definition AND
// the validator for the config, so that we can give better error messages

type Project = "webpack" | "javascript" | "rust";

type Site = {
  // inherited
  bucket: string;
  "entry-point": string;
  include?: string[];
  exclude?: string[];
};

type Dev = {
  ip?: string;
  port?: number;
  local_protocol?: string;
  upstream_protocol?: string;
};

type Vars = { [key: string]: string };

type Cron = string; // TODO: we should be able to parse a cron pattern with ts

type KVNamespace = {
  binding?: string;
  preview_id: string;
  id: string;
};

type Build = {
  command?: string;
  cwd?: string;
  watch_dir?: string;
} & (
  | {
      upload?: {
        format: "service-worker";
        main: string;
      };
    }
  | {
      upload?: {
        format: "modules";
        dir?: string;
        main?: string;
        rules?: {
          type: "ESModule" | "CommonJS" | "Text" | "Data" | "CompiledWasm";
          globs: string[]; // can we use typescript for these patterns?
          fallthrough?: boolean;
        };
      };
    }
);

type UsageModel = "bundled" | "unbound";

type Env = {
  name?: string; // inherited
  account_id?: string; // inherited
  workers_dev?: boolean; // inherited
  zone_id?: string; // inherited
  routes?: string[]; // inherited
  route?: string; // inherited
  webpack_config?: string; // inherited
  site?: Site;
  // we should use typescript to parse cron patterns
  triggers?: { crons: Cron[] }; // inherited
  kv_namespaces?: KVNamespace[];
};

export type Config = {
  name?: string; // inherited
  account_id?: string; // inherited
  // @deprecated Don't use this
  type?: Project; // top level
  // -- there's some mutually exclusive logic for this next block,
  // but I didn't bother for now
  workers_dev?: boolean; // inherited
  zone_id?: string; // inherited
  routes?: string[]; // inherited
  route?: string; // inherited
  // -- end mutually exclusive stuff
  // @deprecated Don't use this
  webpack_config?: string; // inherited
  vars?: Vars;
  kv_namespaces?: KVNamespace[];
  site?: Site; // inherited
  // we should use typescript to parse cron patterns
  triggers?: { crons: Cron[] }; // inherited
  dev?: Dev;
  usage_model?: UsageModel; // inherited
  // top level
  build?: Build;
  env?: { [envName: string]: Env };
};
