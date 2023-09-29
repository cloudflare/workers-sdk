---
"wrangler": minor
---

Support TailEvent messages in Tail sessions

When tailing a tail worker, messages previously had a null event
property. Following https://github.com/cloudflare/workerd/pull/1248,
these events have a valid event, specifying which scripts produced
events that caused your tail worker to run.

As part of rolling this out, we're filtering out tail events in the
internal tail infrastructure, so we control when these new messages are
forward to tail sessions, and can merge this freely.

One idiosyncracy to note, however, is that tail workers always report an
"OK" status, even if they run out of memory or throw. That is being
tracked and worked on separately.
