---
"wrangler": minor
---

feat: Capture Workers with static assets in the telemetry data

We want to measure accurately what this number of Workers + Assets projects running in remote mode is, as this number will be a very helpful data point down the road, when more decisions around remote mode will have to be taken.

These changes add this kind of insight to our telemetry data, by capturing whether the command running is in the context of a Workers + Assets project.

N.B. With these changes in place we will be capturing the Workers + Assets context for all commands, not just wrangler dev --remote.
