---
"miniflare": major
---

Drop source map resolution for service-worker scripts

Stack traces from service-worker scripts (provided via `legacy.serviceWorkerScript`) are no longer source-mapped. Service-worker scripts have no associated module path, so their `//# sourceMappingURL=` comments can no longer be resolved to a source map. Module workers continue to be source-mapped via `sourcemap`-type manifest modules.
