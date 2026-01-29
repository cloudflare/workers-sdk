---
"@cloudflare/vite-plugin": patch
---

Preserve subpath imports starting with `#` in `cleanUrl()`

The `cleanUrl()` function was incorrectly stripping the entire path for subpath imports that begin with `#` (e.g., `import("#path/to/file.html")`). This happened because the regex `/[?#].*$/` was designed to remove URL query parameters and hash fragments, but it also matched the `#` prefix used in subpath imports. The function now checks if the URL starts with `#` and returns it unchanged, allowing subpath imports to work correctly with `.html`, `.txt`, and other additional module types.
