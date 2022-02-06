---
"wrangler": patch
---

feat: add scripts to package.json & autogenerate name value when initializing a project
To get wrangler init projects up and running with good ergonomics for deploying and development,
added default scripts "start" & "deploy" with assumed TS or JS files in generated ./src/index.
The name property is now derived from user input on `init <name>` or parent directory if no input is provided.
