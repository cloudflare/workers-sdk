---
"wrangler": patch
---

improve error message when redirected config contains environments

this change improves that validation error message that users see
when a redirected config file contains environments, by:

- cleaning the message formatting and displaying the
  offending environments in a list
- prompting the user to report the issue to the author
  of the tool which has generated the config
