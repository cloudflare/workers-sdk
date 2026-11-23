---
"miniflare": patch
---

Fix local R2 listings repeating a page when `startAfter` and `cursor` are used together with some Unicode keys

When both options were passed, the local R2 simulator picked the later of the two using JavaScript string comparison, which orders some characters (such as fullwidth letters and emoji) differently from how keys are stored and listed. Paginating with a saved `startAfter` could then return the same page forever. Keys are now compared in the same order they are listed in.
