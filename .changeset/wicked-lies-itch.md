---
"wrangler": patch
---

fix: implement `d1 execute --json` with clean output for piping into other commands

**Before:**

```bash
rozenmd@cflaptop test1 % npx wrangler d1 execute test --command="select * from customers"
▲ [WARNING] Processing wrangler.toml configuration:

    - D1 Bindings are currently in alpha to allow the API to evolve before general availability.
      Please report any issues to https://github.com/cloudflare/wrangler2/issues/new/choose
      Note: Run this command with the environment variable NO_D1_WARNING=true to hide this message

      For example: `export NO_D1_WARNING=true && wrangler <YOUR COMMAND HERE>`


--------------------
🚧 D1 is currently in open alpha and is not recommended for production data and traffic
🚧 Please report any bugs to https://github.com/cloudflare/wrangler2/issues/new/choose
🚧 To request features, visit https://community.cloudflare.com/c/developers/d1
🚧 To give feedback, visit https://discord.gg/cloudflaredev
--------------------

🌀 Mapping SQL input into an array of statements
🌀 Parsing 1 statements
🌀 Executing on test (xxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx):
🚣 Executed 1 command in 11.846710999961942ms
┌────────────┬─────────────────────┬───────────────────┐
│ CustomerID │ CompanyName         │ ContactName       │
├────────────┼─────────────────────┼───────────────────┤
│ 1          │ Alfreds Futterkiste │ Maria Anders      │
├────────────┼─────────────────────┼───────────────────┤
│ 4          │ Around the Horn     │ Thomas Hardy      │
├────────────┼─────────────────────┼───────────────────┤
│ 11         │ Bs Beverages        │ Victoria Ashworth │
├────────────┼─────────────────────┼───────────────────┤
│ 13         │ Bs Beverages        │ Random Name       │
└────────────┴─────────────────────┴───────────────────┘
```

**After:**

```bash
rozenmd@cflaptop test1 % npx wrangler d1 execute test --command="select * from customers" --json
[
  {
    "results": [
      {
        "CustomerID": 1,
        "CompanyName": "Alfreds Futterkiste",
        "ContactName": "Maria Anders"
      },
      {
        "CustomerID": 4,
        "CompanyName": "Around the Horn",
        "ContactName": "Thomas Hardy"
      },
      {
        "CustomerID": 11,
        "CompanyName": "Bs Beverages",
        "ContactName": "Victoria Ashworth"
      },
      {
        "CustomerID": 13,
        "CompanyName": "Bs Beverages",
        "ContactName": "Random Name"
      }
    ],
    "success": true,
    "meta": {
      "duration": 1.662519000004977,
      "last_row_id": null,
      "changes": null,
      "served_by": "primary-xxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.db3",
      "internal_stats": null
    }
  }
]
```
