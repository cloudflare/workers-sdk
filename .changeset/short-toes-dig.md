---
"wrangler": minor
---

Add validation to actions that could affect R2 Data Catalog state with override option.

Data catalog errors are difficult to recover from, and users sometimes are not aware that an action on R2 could delete or overwrite files that could leave their data catalog in an invalid state. This change ensures R2 object and lifecycle commands now validate by default on these actions. By default, Wrangler will perform the catalog check and fail on these actions with a 409 error; if the user must proceed with the action anyway, Wrangler will also display a message instructing users to use `--force` to override this mechanism.
