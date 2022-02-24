---
"wrangler": patch
---

feat: add more comprehensive config validation checking

The configuration for a Worker is complicated since we can define different "environments", and each environment can have its own configuration.
There is a default ("top-level") environment and then named environments that provide environment specific configuration.

This is further complicated by the fact that there are three kinds of environment configuration:

- **non-overridable**: these values are defined once in the top-level configuration, apply to all environments and cannot be overridden by an environment.
- **inheritable**: these values can be defined at the top-level but can also be overridden by environment specific values.
  Named environments do not need to provide their own values, in which case they inherit the value from the top-level.
- **non-inheritable**: these values must be explicitly defined in each environment if they are defined at the top-level.
  Named environments do not inherit such configuration and must provide their own values.

All configuration values in `wrangler.toml` are optional and will receive a default value if not defined.

This change adds more strict interfaces for top-level `Config` and `Environment` types,
as well as validation and normalization of the optional fields that are read from `wrangler.toml`.
