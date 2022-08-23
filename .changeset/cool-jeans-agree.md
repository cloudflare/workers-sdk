---
"wrangler": patch
---

feat: trigger scheduled events from fetch events for testing

- Implements triggering scheduled events from a fetch event for testing
- Triggers by a fetch event at the URL: `/___scheduled`
- Implemented for both module workers and service workers
- Lets through all other fetch events so does not modify any other behaviour of workers

Closes: https://github.com/cloudflare/wrangler2/issues/570
