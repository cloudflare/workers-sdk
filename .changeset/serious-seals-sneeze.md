---
"wrangler": patch
---

fix: throw helpful error if email validation required

Previously, Wrangler would display the raw API error message and code if email validation was required during `wrangler deploy`. This change ensures a helpful error message is displayed instead, prompting users to check their emails or visit the dashboard for a verification link.
