---
"wrangler": patch
---

Update the structure of the `configure` method of autoconfig frameworks

Update the signature of the `configure` function of autoconfig frameworks (`AutoconfigDetails#Framework`), before they would return a `RawConfig` object to use to update the project's wrangler config file, now they return an object that includes the `RawConfig` and that can potentially also hold additional data relevant to the configuration.
