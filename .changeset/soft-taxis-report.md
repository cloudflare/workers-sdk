---
"@cloudflare/vite-plugin": patch
"miniflare": patch
"wrangler": patch
---

Improve over-limit `run_worker_first` errors when duplicate rules are present

The error now reports distinct and duplicate-entry counts and lists duplicated rules, making it clear when removing redundant entries can bring the configuration within the limit.

```
Too many `run_worker_first` rules were provided; 105 rules provided (99 distinct, 6 duplicate entries) exceeds max of 100. Note: duplicate entries count towards the route limit. Ensure that no duplicate rules are present in your `run_worker_first` configuration.

The duplicated rules found are:
- "/rule/0"
- "/rule/1"
- "/rule/2"
- "/rule/3"
- "/rule/4"
...and 1 more duplicated rule.
```
