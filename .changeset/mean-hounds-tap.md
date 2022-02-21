---
"wrangler": patch
---

- Add tests covering pretty-printing of logs in `wrangler tail`
- Modify `RequestEvent` types
  - Change `Date` types to `number` to make parsing easier
  - Change `exception` and `log` `message` properties to `unknown`
- Add datetime to pretty-printed request events
