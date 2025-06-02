/// <reference types="./worker-configuration.d.ts" />

declare module "h3" {
  interface H3EventContext {
    cf: CfProperties;
    cloudflare: {
      env: Env;
      context: ExecutionContext;
    };
  }
}

export {};
