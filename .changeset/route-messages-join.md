---
"@cloudflare/deploy-helpers": patch
---

Join route lists before printing them in deploy messages

The "already assigned to routes" error and the "Previously deployed routes" warning interpolated an array of routes straight into a template literal, so with more than one route the output picked up the commas that `Array.prototype.toString` inserts between elements. Both sites now join the mapped lines before printing.
