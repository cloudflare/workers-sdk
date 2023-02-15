---
"wrangler": minor
---

Add mtls-certificate commands and binding support

Functionality implemented first as an api, which is used in the cli standard
api commands

Note that this adds a new OAuth scope, so OAuth users will need to log out and
log back in to use the new 'mtls-certificate' commands
However, publishing with mtls-certifcate bindings (bindings of type
'mtls_certificate') will work without the scope.
