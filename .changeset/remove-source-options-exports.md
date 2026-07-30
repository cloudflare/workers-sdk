---
"miniflare": major
---

Remove `SourceOptions`, `NameSourceOptions`, `ModuleDefinition`, and `ModuleDefinitionSchema` from Miniflare's public API

Worker source is now provided inline through the config manifest, so stack traces are source-mapped directly against it. The `SourceOptions` intermediate representation and its associated exports are no longer needed and have been removed.
