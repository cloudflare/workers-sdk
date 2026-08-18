---
"miniflare": minor
---

Add local support for Flagship feature-flag bindings

Flagship bindings previously had no local implementation. Miniflare now evaluates flags locally against a per-app flag store that persists across restarts alongside your other local resources, so Workers using a Flagship binding can run without reaching the network.

The new `Miniflare#getFlagshipBindingAPI()` method exposes list, get, create, update, put, delete and evaluate operations for managing the local store.
