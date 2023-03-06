---
"wrangler": minor
---

feat: log error causes when running `wrangler dev`

Previously, the `cause` property of errors was ignored when logging.
This is used by D1 to include context on why an operation failed.
Because we weren't logging this, D1 failures would always show up as
`D1_ERROR`, with no additional context, making debugging difficult.

We now attempt to source-map and log these, and the reasons for
`DOMException`s.
