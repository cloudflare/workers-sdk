# `@cloudflare/build-output-utils`

Utilities for reading and writing the Build Output Specification directory (`.cloudflare/output/`).

This is not yet stable enough for external use — APIs may change without notice.

Build output directories must be portable and self-contained. `readBuildOutput()` rejects symlinks anywhere in `.cloudflare/output/`, including config files, bundles, assets, and Container files. This also applies to symlinks that point within the output directory, and to symlinked `.cloudflare` or `output` directories.
