---
"@cloudflare/vite-plugin": minor
---

Add `experimental.bufferPreviewResponses` to surface response-body streaming errors during `vite preview`.

When enabled, the preview entry Worker (the request dispatch target) fully buffers its response body in-worker so that errors thrown while streaming the body (for example a component that throws mid-render during prerendering) are reported as a real HTTP `500` carrying an `x-vite-cloudflare-worker-error` marker header, instead of a silently-truncated `200`. The marker lets consumers (such as a framework's prerenderer) distinguish a thrown error from a response the Worker intentionally returned with a non-2xx status. Auxiliary/service-bound Workers keep their normal streaming behaviour.

This is off by default because buffering breaks legitimate streaming responses in a normal preview. The wrapper preserves named exports (Durable Objects, entrypoints, Workflows) and non-`fetch` handlers, and assumes a plain-object default export.
