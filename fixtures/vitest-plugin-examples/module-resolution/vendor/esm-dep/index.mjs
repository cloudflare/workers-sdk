// Intentionally extensionless — valid in bundler/Vite contexts but technically
// requires explicit extensions in strict ESM. The module fallback service must
// NOT add extensions for `import` (only for `require()`); it should defer to
// Vite's resolver for this.
export { value } from "./value";
