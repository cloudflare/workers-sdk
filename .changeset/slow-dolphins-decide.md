---
"wrangler": patch
---

feat: support extending the user configuration

The main goal here is to enable tools to generate a partial configuration file that is merged into the user configuration when Wrangler commands are run.

The file must be written to `./.wrangler/config/extra.json`, where the path is relative to the project path, which is the directory containing the wrangler.toml or the current working directory if there is no wrangler.toml.

The format of the file is a JSON object whose properties are the inheritable and non-inheritable options described in the Wrangler configuration documentation. Notably it cannot contain the "top level" configuration properties.

The contents of the file will be merged into the configuration of the currently selected environment before being used in all Wrangler commands.

The user does not need to manually specify that this merging should happen. It is done automatically when the file is found.
