---
"wrangler": patch
---

fix: support 'exceededMemory' error status in tail

While the exception for 'Worker exceeded memory limits' gets logged
correctly when tailing, the actual status wasn't being counted as an
error, and was falling through a switch case to 'unknown'

This ensures filtering and logging reflects that status correctly
