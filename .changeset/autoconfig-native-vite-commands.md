---
"@cloudflare/autoconfig": minor
"wrangler": patch
---

Run experimental cf projects with their installed Vite or Vite+ commands

`cf dev`, `cf build`, and deployments that build your project can use Vite or Vite+ even when no framework command is detected. This removes the need for the internal `cf-vite` delegate and supports dependencies hoisted within a workspace. Existing framework commands keep their priority.

Project inspection can recognize an existing Cloudflare configuration before dependencies are installed. Running a command provides guidance when the required tools are missing, the plugin version is incompatible, or the Vite configuration does not enable the Cloudflare plugin. Native builds also work with the Windows shell. Pages migration safeguards, unsupported-framework setup checks, and Wrangler command selection retain their existing behavior.
