---
"wrangler": patch
---

fix: remove bold font from additional lines of warnings and errors

Previously, when a warning or error was logged, the entire message
was formatted in bold font. This change makes only the first line of
the message bold, and the rest is formatted with a normal font.
