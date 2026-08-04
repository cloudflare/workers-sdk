/**
 * Non-HTTP Worker exports. Flue re-exports everything here from the
 * generated Worker entry.
 *
 * `WorkspaceServiceProxy` must be an entry-module export so the Cloudflare
 * Computer shell backend can create a loopback binding to its host workspace.
 */
export { WorkspaceServiceProxy } from "@cloudflare/computer";
