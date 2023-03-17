---
"wrangler": minor
---

feat: add support for send email bindings

Support send email bindings in order to send emails from a worker. There
are three types of bindings:

- Unrestricted: can send email to any verified destination address.
- Restricted: can only send email to the supplied destination address (which
  does not need to be specified when sending the email but also needs to be a
  verified destination address).
- Allowlist: can only send email to the supplied list of verified destination
  addresses.
