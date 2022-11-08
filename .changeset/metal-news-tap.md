---
"wrangler": minor
---

feature: Add warnings around bundle sizes for large scripts

Prints a warning for scripts > 1MB compressed, encouraging smaller
script sizes. This warning can be silenced by setting the
NO_SCRIPT_SIZE_WARNING env variable

If a publish fails with either a script size error or a validator error
on script startup (CPU or memory), we print out the largest 5
dependencies in your bundle. This is accomplished by using the esbuild
generated metafile.
