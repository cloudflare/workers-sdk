---
"wrangler": patch
---

fix: do not crash in `wrangler dev` if user has multiple accounts

When a user has multiple accounts we show a prompt to allow the user to select which they should use.
This was broken in `wrangler dev` as we were trying to start a new ink.js app (to show the prompt)
from inside a running ink.js app (the UI for `wrangler dev`).

This fix refactors the `ChooseAccount` component so that it can be used directly within another component.

Fixes #1258
