---
"@cloudflare/autoconfig": minor
"wrangler": patch
---

Run experimental cf projects with their installed Vite or Vite+ commands

`cf dev`, `cf build`, and deployments that build your project can use Vite or Vite+ even when no framework command is detected. This removes the need for the internal `cf-vite` delegate and supports dependencies declared and hoisted at the root of a configured workspace. Existing framework commands keep their priority. Consumers resolve bare executables using the detected `nodeModulesPaths` in order, adding `.bin` to each directory. Lookup stops at the validated workspace root; standalone applications use only their own `node_modules/.bin`.

Project inspection can recognize an existing Cloudflare configuration before dependencies are installed. Running a command provides guidance when the required tools are missing or the plugin version does not support cf profiles (`>=2.0.0-beta.v.13 <3`). Vite evaluates the project configuration when the command runs, including dynamic configs and custom config files. Repair guidance uses the project’s detected package manager. Automatic setup asks users to convert CommonJS `.cjs` and `.cts` Vite configs to ESM imports and exports in `.mjs` or `.mts` before adding the ESM-only Cloudflare plugin. Native builds also work with the Windows shell. Pages migration safeguards, unsupported-framework setup checks, and Wrangler command selection retain their existing behavior.
