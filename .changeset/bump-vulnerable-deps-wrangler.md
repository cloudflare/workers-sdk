---
"wrangler": patch
---

Bump node-forge to ^1.3.2 to address security vulnerabilities

node-forge had ASN.1 unbounded recursion, OID integer truncation, and ASN.1 validator desynchronization vulnerabilities. This is a bundled dependency used for local HTTPS certificate handling.
