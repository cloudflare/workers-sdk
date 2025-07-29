---
"wrangler": minor
---

---

"wrangler": patch

---

Fix D1 migration files ordering to display in chronological order

D1 migration files were previously displayed in random order by `wrangler d1 migrations list` and `wrangler d1 migrations apply` commands due to filesystem read order dependency. This fix ensures migration files are always sorted alphabetically by filename, which corresponds to chronological order since migration files follow the `migration_YYYYMMDDHHMMSS.sql` naming convention.

The change modifies the `getMigrationNames()` function in `packages/wrangler/src/d1/migrations/helpers.ts` to sort the migration filenames before returning them, providing consistent behavior across different operating systems and filesystems.
