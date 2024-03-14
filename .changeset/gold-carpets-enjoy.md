---
"create-cloudflare": patch
---

Remove custom `getPlatformProxy` hook from SvelteKit template.

`sveltejs/adapter-cloudflare@4.2.0` has been [released](https://github.com/sveltejs/kit/releases/tag/%40sveltejs%2Fadapter-cloudflare%404.2.0) which provides direct support for bindings emulation via `getPlatformProxy`, so the custom hook is no longer needed.
