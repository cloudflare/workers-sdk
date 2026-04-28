// Re-exported so that fixtures can import from `@fixture/shared/src/fs-helpers`
// without each fixture needing a direct dependency on `@cloudflare/workers-utils`.
export { removeDir, removeDirSync } from "@cloudflare/workers-utils";
