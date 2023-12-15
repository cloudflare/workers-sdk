---
"wrangler": minor
---

feat: apply source mapping to logged strings

Previously, Wrangler would only apply source mapping to uncaught exceptions. This meant if you caught an exception and logged its stack trace, the call sites would reference built JavaScript files as opposed to source files. This change looks for stack traces in logged messages, and tries to source map them.

Note source mapping is only applied when outputting logs. `Error#stack` does not return a source mapped stack trace. This means the actual runtime value of `new Error().stack` and the output from `console.log(new Error().stack)` may be different.
