---
"wrangler": minor
---

Add `wrangler preview secret put` and `wrangler preview secret delete` for managing secrets on a named Worker Preview

These private-beta commands manage secrets on a single named Preview by creating a new Preview deployment from its latest one, without affecting production, other Previews, or the Worker's Previews base configuration.

The new deployment goes live at 100% immediately, and the command reports the live Preview URL on success.
