---
"@cloudflare/pages-shared": patch
---

Decode HTML entities in Early Hints href attributes

The automatic Early Hints feature now properly decodes HTML entities (like `&amp;`, `&lt;`, `&#38;`, `&#x26;`) in `<link>` element `href` attributes before constructing the Link header. Previously, URLs containing HTML entities would be passed through literally, causing browsers to fetch the wrong URL and resulting in duplicate resource requests.
