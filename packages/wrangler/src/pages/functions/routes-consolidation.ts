// Re-export from @cloudflare/pages-functions — this file is kept for
// backward compatibility with existing Wrangler-internal imports and to keep
// the initial migration minimal without changing lots and lots of files
// TODO(dario): after the initial pages-functions migration remove these re-exports
export { consolidateRoutes, shortenRoute } from "@cloudflare/pages-functions";
