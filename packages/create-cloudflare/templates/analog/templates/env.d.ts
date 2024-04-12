/// <reference types="WORKERS_TYPES_ENTRYPOINT" />

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
