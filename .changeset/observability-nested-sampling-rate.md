---
"@cloudflare/workers-utils": patch
---

Validate `observability.logs.head_sampling_rate` and `observability.traces.head_sampling_rate` are between 0 and 1

The 0–1 range check was only applied to the top level `observability.head_sampling_rate`. The two nested fields were type-checked as numbers but never bounds-checked, so a value such as `10` (a common mix-up with a percentage) was accepted locally and sent to the API.

```jsonc
{
	"observability": {
		"logs": { "enabled": true, "head_sampling_rate": 10 },
	},
}
```

All three fields now report `must be a value between 0 and 1.` consistently.
