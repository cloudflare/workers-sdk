---
"wrangler": patch
---

add validation to redirected configs in regards to environments

add the following validation behaviors to wrangler deploy commands, that relate
to redirected configs (i.e. config files specified by `.wrangler/deploy/config.json` files):

- redirected configs are supposed to be already flattened configurations without any
  environment (i.e. a build tool should generate redirected configs already targeting specific
  environments), so if wrangler encounters a redirected config with some environments defined
  it should error
- given the point above, specifying an environment (`--env=my-env`) when using redirected
  configs is incorrect, so these environments should be ignored and a warning should be
  presented to the user
