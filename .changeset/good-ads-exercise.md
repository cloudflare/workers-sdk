---
"wrangler": patch
---

Use getBasePath() when trying to specify paths to files relative to the
base of the Wrangler package directory rather than trying to compute the
path from Node.js constants like **dirname and **filename. This is
because the act of bundling the source code can move the file that contains
these constants around potentially breaking the relative path to the desired files.

Fixes #1755
