---
"wrangler": patch
---

Add filtering to wrangler tail, so you can now `wrangler tail <name> --status ok`, for example. Supported options:

- `--status cancelled --status error` --> you can filter on `ok`, `error`, and `cancelled` to only tail logs that have that status
- `--header X-CUSTOM-HEADER:somevalue` --> you can filter on headers, including ones that have specific values (`"somevalue"`) or just that contain any header (e.g. `--header X-CUSTOM-HEADER` with no colon)
- `--method POST --method PUT` --> filter on the HTTP method used to trigger the worker
- `--search catch-this` --> only shows messages that contain the phrase `"catch-this"`. Does not (yet!) support regular expressions
- `--ip self --ip 192.0.2.232` --> only show logs from requests that originate from the given IP addresses. `"self"` will be replaced with the IP address of the computer that sent the tail request.
