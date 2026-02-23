---
"create-cloudflare": patch
---

Fix --variant flag being ignored for pages

When creating a Pages project using `npm create cloudflare -- --type pages --variant <variant>`,
the `--variant` flag was being ignored, causing users to be prompted for variant selection
or defaulting to an unexpected variant. This now correctly passes the variant to the project setup.

**BREAKING CHANGE**: The internal on-disk format for the `unsafeDevRegistryPath` has changed. This is an internal, unsafe, and undocumented feature, but any tools relying on its previous structure will need to be updated to support the new `debugPortAddress`, `defaultEntrypointService`, and `userWorkerService` properties in worker-definition files.
