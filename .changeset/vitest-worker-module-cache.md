---
"@cloudflare/vitest-plugin": patch
---

Fix Worker tests and V8 coverage with Vitest 5.0.4

Vitest 5.0.4 enables filesystem module caching by default, but workerd cannot read transformed modules from the host filesystem. Disable it for the Workers pool to prevent missing cache file errors. Handle the new V8 coverage stop command using the existing inspector cleanup.
