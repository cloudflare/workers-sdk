---
"wrangler": minor
---

Avoid Worker and workers.dev naming prompts in agent-driven deploys

Wrangler now derives the Worker name from the project and automatically registers the same project-derived workers.dev account subdomain on a first deploy when running in a detected agent environment. The deploy output explains how to change both names.
