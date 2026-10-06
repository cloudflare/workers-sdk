# 📚 d1

This Worker implements a simple blog using D1 bindings. It uses migrations for setting up the database. These migrations are read in `vitest.config.mts`, and applied with the [test/apply-migrations.ts](test/apply-migrations.ts) setup file.

| Test                                    | Overview                         |
| --------------------------------------- | -------------------------------- |
| [queries.test.ts](test/queries.test.ts) | Unit tests for SQL query helpers |
| [routes.test.ts](test/routes.test.ts)   | Integration for endpoints        |
