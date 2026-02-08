---
"@cloudflare/vite-plugin": minor
---

Add support for importing `.md` (markdown) files as Text modules. You can now `import content from './file.md'` and receive the file contents as a string, consistent with `.txt`, `.html`, and `.sql` as documented in [Non-JavaScript modules](https://developers.cloudflare.com/workers/vite-plugin/reference/non-javascript-modules/).
