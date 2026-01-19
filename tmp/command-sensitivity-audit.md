# Wrangler Command Sensitivity Audit

This document tracks the decision for each wrangler command regarding whether its arguments should be considered sensitive (stripped from telemetry) or safe (included as `safe_args`).

## How to Use This Document

- **My Decision**: Claude's recommended classification
  - `sensitive` = args will be stripped from telemetry
  - `safe` = args will be included in telemetry as `safe_args`
- **Override?**: Mark `[x]` to **flip** the decision to the opposite

---

## Authentication & Account Commands

| Command               | Reason                                                      | My Decision | Override? |
| --------------------- | ----------------------------------------------------------- | ----------- | --------- |
| `wrangler login`      | OAuth flow may involve tokens/credentials in args           | `sensitive` | `[ ]`     |
| `wrangler logout`     | No user input, just clears local state                      | `safe`      | `[ ]`     |
| `wrangler whoami`     | Read-only, optional `--account` is just an ID               | `safe`      | `[ ]`     |
| `wrangler auth token` | Read-only, outputs token but doesn't accept sensitive input | `safe`      | `[ ]`     |

## Telemetry Commands

| Command                      | Reason             | My Decision | Override? |
| ---------------------------- | ------------------ | ----------- | --------- |
| `wrangler telemetry status`  | Read-only, no args | `safe`      | `[ ]`     |
| `wrangler telemetry enable`  | No args            | `safe`      | `[ ]`     |
| `wrangler telemetry disable` | No args            | `safe`      | `[ ]`     |

## Secret Commands (Workers)

| Command                  | Reason                                 | My Decision | Override? |
| ------------------------ | -------------------------------------- | ----------- | --------- |
| `wrangler secret put`    | Secret value provided via stdin/prompt | `sensitive` | `[ ]`     |
| `wrangler secret bulk`   | File/stdin contains secret values      | `sensitive` | `[ ]`     |
| `wrangler secret delete` | Only accepts key name, not sensitive   | `safe`      | `[x]`     |
| `wrangler secret list`   | Read-only, lists secret names only     | `safe`      | `[ ]`     |

## Secret Commands (Pages)

| Command                        | Reason                                 | My Decision | Override? |
| ------------------------------ | -------------------------------------- | ----------- | --------- |
| `wrangler pages secret put`    | Secret value provided via stdin/prompt | `sensitive` | `[ ]`     |
| `wrangler pages secret bulk`   | File/stdin contains secret values      | `sensitive` | `[ ]`     |
| `wrangler pages secret delete` | Only accepts key name                  | `safe`      | `[x]`     |
| `wrangler pages secret list`   | Read-only                              | `safe`      | `[ ]`     |

## Secret Commands (Versions)

| Command                           | Reason                                 | My Decision | Override? |
| --------------------------------- | -------------------------------------- | ----------- | --------- |
| `wrangler versions secret put`    | Secret value provided via stdin/prompt | `sensitive` | `[ ]`     |
| `wrangler versions secret bulk`   | File/stdin contains secret values      | `sensitive` | `[ ]`     |
| `wrangler versions secret delete` | Only accepts key name                  | `safe`      | `[x]`     |
| `wrangler versions secret list`   | Read-only                              | `safe`      | `[ ]`     |

## KV Commands

| Command                        | Reason                                              | My Decision | Override? |
| ------------------------------ | --------------------------------------------------- | ----------- | --------- |
| `wrangler kv namespace create` | Just namespace name                                 | `safe`      | `[ ]`     |
| `wrangler kv namespace list`   | Read-only                                           | `safe`      | `[ ]`     |
| `wrangler kv namespace delete` | Just binding/namespace-id                           | `safe`      | `[ ]`     |
| `wrangler kv namespace rename` | Just names/IDs                                      | `safe`      | `[ ]`     |
| `wrangler kv key put`          | **Value is positional arg** - could contain secrets | `sensitive` | `[ ]`     |
| `wrangler kv key list`         | Read-only                                           | `safe`      | `[ ]`     |
| `wrangler kv key get`          | Read-only                                           | `safe`      | `[ ]`     |
| `wrangler kv key delete`       | Just key name                                       | `safe`      | `[ ]`     |
| `wrangler kv bulk put`         | File contains key-value pairs (secrets)             | `sensitive` | `[ ]`     |
| `wrangler kv bulk get`         | Read-only, just outputs values                      | `safe`      | `[ ]`     |
| `wrangler kv bulk delete`      | File contains just key names                        | `safe`      | `[ ]`     |

## D1 Commands

| Command                           | Reason                                                               | My Decision | Override? |
| --------------------------------- | -------------------------------------------------------------------- | ----------- | --------- |
| `wrangler d1 create`              | Just database name                                                   | `safe`      | `[x]`     |
| `wrangler d1 list`                | Read-only                                                            | `safe`      | `[ ]`     |
| `wrangler d1 info`                | Read-only                                                            | `safe`      | `[ ]`     |
| `wrangler d1 delete`              | Just database name                                                   | `safe`      | `[ ]`     |
| `wrangler d1 execute`             | **`--command` accepts SQL** - could contain secrets in INSERT/UPDATE | `sensitive` | `[ ]`     |
| `wrangler d1 export`              | Output file path, potentially sensitive path                         | `sensitive` | `[ ]`     |
| `wrangler d1 insights`            | Read-only                                                            | `safe`      | `[ ]`     |
| `wrangler d1 time-travel info`    | Read-only                                                            | `safe`      | `[ ]`     |
| `wrangler d1 time-travel restore` | Just timestamps/bookmarks                                            | `safe`      | `[ ]`     |
| `wrangler d1 migrations create`   | Just migration name/message                                          | `safe`      | `[x]`     |
| `wrangler d1 migrations list`     | Read-only                                                            | `safe`      | `[ ]`     |
| `wrangler d1 migrations apply`    | Just database name                                                   | `safe`      | `[x]`     |

## R2 Commands

| Command                                                  | Reason                                                                   | My Decision | Override? |
| -------------------------------------------------------- | ------------------------------------------------------------------------ | ----------- | --------- |
| `wrangler r2 bucket create`                              | Just bucket name                                                         | `safe`      | `[x]`     |
| `wrangler r2 bucket list`                                | Read-only                                                                | `safe`      | `[ ]`     |
| `wrangler r2 bucket info`                                | Read-only                                                                | `safe`      | `[ ]`     |
| `wrangler r2 bucket delete`                              | Just bucket name                                                         | `safe`      | `[x]`     |
| `wrangler r2 bucket update storage-class`                | Just bucket name and storage class                                       | `safe`      | `[x]`     |
| `wrangler r2 bucket sippy enable`                        | **Accepts AWS/GCS credentials** (`--secret-access-key`, `--private-key`) | `sensitive` | `[ ]`     |
| `wrangler r2 bucket sippy disable`                       | Just bucket name                                                         | `safe`      | `[x]`     |
| `wrangler r2 bucket sippy get`                           | Read-only                                                                | `safe`      | `[ ]`     |
| `wrangler r2 bucket catalog enable`                      | Just bucket name                                                         | `safe`      | `[x]`     |
| `wrangler r2 bucket catalog disable`                     | Just bucket name                                                         | `safe`      | `[x]`     |
| `wrangler r2 bucket catalog get`                         | Read-only                                                                | `safe`      | `[ ]`     |
| `wrangler r2 bucket catalog compaction enable`           | Just bucket name                                                         | `safe`      | `[x]`     |
| `wrangler r2 bucket catalog compaction disable`          | Just bucket name                                                         | `safe`      | `[x]`     |
| `wrangler r2 bucket catalog snapshot-expiration enable`  | Just bucket name                                                         | `safe`      | `[x]`     |
| `wrangler r2 bucket catalog snapshot-expiration disable` | Just bucket name                                                         | `safe`      | `[x]`     |
| `wrangler r2 bucket notification create`                 | Just queue/bucket names                                                  | `safe`      | `[x]`     |
| `wrangler r2 bucket notification list`                   | Read-only                                                                | `safe`      | `[ ]`     |
| `wrangler r2 bucket notification get`                    | Read-only                                                                | `safe`      | `[ ]`     |
| `wrangler r2 bucket notification delete`                 | Just rule ID                                                             | `safe`      | `[ ]`     |
| `wrangler r2 bucket domain add`                          | Just domain/bucket names                                                 | `safe`      | `[x]`     |
| `wrangler r2 bucket domain list`                         | Read-only                                                                | `safe`      | `[ ]`     |
| `wrangler r2 bucket domain get`                          | Read-only                                                                | `safe`      | `[ ]`     |
| `wrangler r2 bucket domain remove`                       | Just domain name                                                         | `safe`      | `[x]`     |
| `wrangler r2 bucket domain update`                       | Just domain settings                                                     | `safe`      | `[x]`     |
| `wrangler r2 bucket dev-url enable`                      | Just bucket name                                                         | `safe`      | `[ ]`     |
| `wrangler r2 bucket dev-url disable`                     | Just bucket name                                                         | `safe`      | `[ ]`     |
| `wrangler r2 bucket dev-url get`                         | Read-only                                                                | `safe`      | `[ ]`     |
| `wrangler r2 bucket lifecycle add`                       | Just lifecycle rules                                                     | `safe`      | `[ ]`     |
| `wrangler r2 bucket lifecycle list`                      | Read-only                                                                | `safe`      | `[ ]`     |
| `wrangler r2 bucket lifecycle remove`                    | Just rule ID                                                             | `safe`      | `[ ]`     |
| `wrangler r2 bucket lifecycle set`                       | Just lifecycle rules                                                     | `safe`      | `[ ]`     |
| `wrangler r2 bucket cors list`                           | Read-only                                                                | `safe`      | `[ ]`     |
| `wrangler r2 bucket cors set`                            | CORS config (origins, methods)                                           | `safe`      | `[ ]`     |
| `wrangler r2 bucket cors delete`                         | Just bucket name                                                         | `safe`      | `[ ]`     |
| `wrangler r2 bucket lock add`                            | Just lock rules                                                          | `safe`      | `[ ]`     |
| `wrangler r2 bucket lock list`                           | Read-only                                                                | `safe`      | `[ ]`     |
| `wrangler r2 bucket lock remove`                         | Just rule ID                                                             | `safe`      | `[ ]`     |
| `wrangler r2 bucket lock set`                            | Just lock rules                                                          | `safe`      | `[ ]`     |
| `wrangler r2 object get`                                 | Read-only, object path (potentially sensitive path)                      | `sensitive` | `[ ]`     |
| `wrangler r2 object put`                                 | File path could reveal sensitive structure                               | `sensitive` | `[ ]`     |
| `wrangler r2 object delete`                              | Object path (potentially sensitive path)                                 | `sensitive` | `[ ]`     |
| `wrangler r2 bulk put`                                   | File path, bulk upload                                                   | `sensitive` | `[ ]`     |
| `wrangler r2 sql query`                                  | **SQL query** - could contain secrets                                    | `sensitive` | `[ ]`     |

## Queues Commands

| Command                                  | Reason                   | My Decision | Override? |
| ---------------------------------------- | ------------------------ | ----------- | --------- |
| `wrangler queues create`                 | Just queue name          | `safe`      | `[x]`     |
| `wrangler queues list`                   | Read-only                | `safe`      | `[ ]`     |
| `wrangler queues delete`                 | Just queue name          | `safe`      | `[x]`     |
| `wrangler queues info`                   | Read-only                | `safe`      | `[ ]`     |
| `wrangler queues update`                 | Just queue settings      | `safe`      | `[ ]`     |
| `wrangler queues pause-delivery`         | Just queue name          | `safe`      | `[x]`     |
| `wrangler queues resume-delivery`        | Just queue name          | `safe`      | `[x]`     |
| `wrangler queues purge`                  | Just queue name          | `safe`      | `[x]`     |
| `wrangler queues consumer add`           | Just worker/queue names  | `safe`      | `[x]`     |
| `wrangler queues consumer remove`        | Just worker/queue names  | `safe`      | `[x]`     |
| `wrangler queues consumer http add`      | Just queue names         | `safe`      | `[x]`     |
| `wrangler queues consumer http remove`   | Just queue names         | `safe`      | `[x]`     |
| `wrangler queues consumer worker add`    | Just worker/queue names  | `safe`      | `[x]`     |
| `wrangler queues consumer worker remove` | Just worker/queue names  | `safe`      | `[x]`     |
| `wrangler queues subscription create`    | Just subscription config | `safe`      | `[ ]`     |
| `wrangler queues subscription list`      | Read-only                | `safe`      | `[ ]`     |
| `wrangler queues subscription get`       | Read-only                | `safe`      | `[ ]`     |
| `wrangler queues subscription delete`    | Just subscription ID     | `safe`      | `[ ]`     |
| `wrangler queues subscription update`    | Just subscription config | `safe`      | `[ ]`     |

## Hyperdrive Commands

| Command                      | Reason                                                                  | My Decision | Override? |
| ---------------------------- | ----------------------------------------------------------------------- | ----------- | --------- |
| `wrangler hyperdrive create` | **Accepts `--connection-string`, `--origin-password`** - DB credentials | `sensitive` | `[ ]`     |
| `wrangler hyperdrive list`   | Read-only                                                               | `safe`      | `[ ]`     |
| `wrangler hyperdrive get`    | Read-only                                                               | `safe`      | `[ ]`     |
| `wrangler hyperdrive delete` | Just hyperdrive ID                                                      | `safe`      | `[ ]`     |
| `wrangler hyperdrive update` | **Accepts `--connection-string`, `--origin-password`** - DB credentials | `sensitive` | `[ ]`     |

## Vectorize Commands

| Command                                    | Reason                                   | My Decision | Override? |
| ------------------------------------------ | ---------------------------------------- | ----------- | --------- |
| `wrangler vectorize create`                | Just index name and config               | `safe`      | `[x]`     |
| `wrangler vectorize list`                  | Read-only                                | `safe`      | `[ ]`     |
| `wrangler vectorize get`                   | Read-only                                | `safe`      | `[ ]`     |
| `wrangler vectorize delete`                | Just index name                          | `safe`      | `[x]`     |
| `wrangler vectorize info`                  | Read-only                                | `safe`      | `[ ]`     |
| `wrangler vectorize insert`                | File path with vector data               | `sensitive` | `[ ]`     |
| `wrangler vectorize upsert`                | File path with vector data               | `sensitive` | `[ ]`     |
| `wrangler vectorize query`                 | Query vector data (numbers, not secrets) | `safe`      | `[ ]`     |
| `wrangler vectorize list-vectors`          | Read-only                                | `safe`      | `[ ]`     |
| `wrangler vectorize get-vectors`           | Read-only                                | `safe`      | `[ ]`     |
| `wrangler vectorize delete-vectors`        | Just vector IDs                          | `safe`      | `[ ]`     |
| `wrangler vectorize create-metadata-index` | Just property names                      | `safe`      | `[ ]`     |
| `wrangler vectorize list-metadata-index`   | Read-only                                | `safe`      | `[ ]`     |
| `wrangler vectorize delete-metadata-index` | Just property name                       | `safe`      | `[ ]`     |

## Secrets Store Commands

| Command                                   | Reason                               | My Decision | Override? |
| ----------------------------------------- | ------------------------------------ | ----------- | --------- |
| `wrangler secrets-store store create`     | Just store name                      | `safe`      | `[x]`     |
| `wrangler secrets-store store delete`     | Just store ID                        | `safe`      | `[ ]`     |
| `wrangler secrets-store store list`       | Read-only                            | `safe`      | `[ ]`     |
| `wrangler secrets-store secret create`    | **Accepts `--value`** - secret value | `sensitive` | `[ ]`     |
| `wrangler secrets-store secret list`      | Read-only                            | `safe`      | `[ ]`     |
| `wrangler secrets-store secret get`       | Read-only                            | `safe`      | `[ ]`     |
| `wrangler secrets-store secret update`    | **Accepts `--value`** - secret value | `sensitive` | `[ ]`     |
| `wrangler secrets-store secret delete`    | Just secret ID                       | `safe`      | `[ ]`     |
| `wrangler secrets-store secret duplicate` | Just IDs and names                   | `safe`      | `[ ]`     |

## Workflows Commands

| Command                                      | Reason                                                      | My Decision | Override? |
| -------------------------------------------- | ----------------------------------------------------------- | ----------- | --------- |
| `wrangler workflows list`                    | Read-only                                                   | `safe`      | `[ ]`     |
| `wrangler workflows describe`                | Read-only                                                   | `safe`      | `[ ]`     |
| `wrangler workflows delete`                  | Just workflow name                                          | `safe`      | `[x]`     |
| `wrangler workflows trigger`                 | **Accepts `--params`** - JSON payload could contain secrets | `sensitive` | `[ ]`     |
| `wrangler workflows instances list`          | Read-only                                                   | `safe`      | `[ ]`     |
| `wrangler workflows instances describe`      | Read-only                                                   | `safe`      | `[ ]`     |
| `wrangler workflows instances send-event`    | **Accepts `--payload`** - JSON could contain secrets        | `sensitive` | `[ ]`     |
| `wrangler workflows instances terminate`     | Just instance ID                                            | `safe`      | `[ ]`     |
| `wrangler workflows instances terminate-all` | Just workflow name                                          | `safe`      | `[x]`     |
| `wrangler workflows instances pause`         | Just instance ID                                            | `safe`      | `[ ]`     |
| `wrangler workflows instances resume`        | Just instance ID                                            | `safe`      | `[ ]`     |
| `wrangler workflows instances restart`       | Just instance ID                                            | `safe`      | `[ ]`     |

## Versions & Deployments Commands

| Command                       | Reason                               | My Decision | Override? |
| ----------------------------- | ------------------------------------ | ----------- | --------- |
| `wrangler versions view`      | Read-only                            | `safe`      | `[ ]`     |
| `wrangler versions list`      | Read-only                            | `safe`      | `[ ]`     |
| `wrangler versions upload`    | Worker code (could argue either way) | `sensitive` | `[ ]`     |
| `wrangler versions deploy`    | Just version IDs and percentages     | `safe`      | `[ ]`     |
| `wrangler deployments list`   | Read-only                            | `safe`      | `[ ]`     |
| `wrangler deployments status` | Read-only                            | `safe`      | `[ ]`     |
| `wrangler deployments view`   | Read-only                            | `safe`      | `[ ]`     |
| `wrangler rollback`           | Just version selection               | `safe`      | `[ ]`     |

## Core Worker Commands

| Command           | Reason                                      | My Decision | Override? |
| ----------------- | ------------------------------------------- | ----------- | --------- |
| `wrangler dev`    | Config/script paths, could reveal structure | `sensitive` | `[ ]`     |
| `wrangler deploy` | Config/script paths, could reveal structure | `sensitive` | `[ ]`     |
| `wrangler delete` | Just worker name                            | `safe`      | `[ ]`     |
| `wrangler build`  | Config/script paths                         | `sensitive` | `[ ]`     |
| `wrangler init`   | Project name, template                      | `safe`      | `[ ]`     |
| `wrangler setup`  | Just config setup                           | `safe`      | `[ ]`     |
| `wrangler tail`   | Just worker name, filters                   | `safe`      | `[ ]`     |
| `wrangler types`  | Just generates types                        | `safe`      | `[ ]`     |
| `wrangler docs`   | Just search query                           | `safe`      | `[ ]`     |

## Pages Commands

| Command                                    | Reason                            | My Decision | Override? |
| ------------------------------------------ | --------------------------------- | ----------- | --------- |
| `wrangler pages dev`                       | Directory paths                   | `sensitive` | `[ ]`     |
| `wrangler pages deploy`                    | Directory paths                   | `sensitive` | `[ ]`     |
| `wrangler pages publish`                   | Directory paths (alias of deploy) | `sensitive` | `[ ]`     |
| `wrangler pages project list`              | Read-only                         | `safe`      | `[ ]`     |
| `wrangler pages project create`            | Just project name                 | `safe`      | `[x]`     |
| `wrangler pages project delete`            | Just project name                 | `safe`      | `[X]`     |
| `wrangler pages project upload`            | Directory path                    | `sensitive` | `[ ]`     |
| `wrangler pages project validate`          | Directory path                    | `sensitive` | `[ ]`     |
| `wrangler pages deployment list`           | Read-only                         | `safe`      | `[ ]`     |
| `wrangler pages deployment create`         | Directory path                    | `sensitive` | `[ ]`     |
| `wrangler pages deployment tail`           | Just deployment ID                | `safe`      | `[ ]`     |
| `wrangler pages download config`           | Just project name                 | `safe`      | `[x]`     |
| `wrangler pages functions build`           | Directory paths                   | `sensitive` | `[ ]`     |
| `wrangler pages functions build-env`       | Just project name                 | `safe`      | `[ ]`     |
| `wrangler pages functions optimize-routes` | Directory path                    | `sensitive` | `[ ]`     |

## Certificate Commands

| Command                                      | Reason                           | My Decision | Override? |
| -------------------------------------------- | -------------------------------- | ----------- | --------- |
| `wrangler cert list`                         | Read-only                        | `safe`      | `[ ]`     |
| `wrangler cert delete`                       | Just cert ID/name                | `safe`      | `[ ]`     |
| `wrangler cert upload mtls-certificate`      | **File paths to cert/key files** | `sensitive` | `[ ]`     |
| `wrangler cert upload certificate-authority` | **File path to CA cert**         | `sensitive` | `[ ]`     |
| `wrangler mtls-certificate upload`           | File paths to cert/key files     | `sensitive` | `[ ]`     |
| `wrangler mtls-certificate list`             | Read-only                        | `safe`      | `[ ]`     |
| `wrangler mtls-certificate delete`           | Just cert ID                     | `safe`      | `[ ]`     |

## Dispatch Namespace Commands

| Command                              | Reason              | My Decision | Override? |
| ------------------------------------ | ------------------- | ----------- | --------- |
| `wrangler dispatch-namespace list`   | Read-only           | `safe`      | `[ ]`     |
| `wrangler dispatch-namespace get`    | Read-only           | `safe`      | `[ ]`     |
| `wrangler dispatch-namespace create` | Just namespace name | `safe`      | `[ ]`     |
| `wrangler dispatch-namespace delete` | Just namespace name | `safe`      | `[ ]`     |
| `wrangler dispatch-namespace rename` | Just names          | `safe`      | `[ ]`     |

## AI Commands

| Command                       | Reason                               | My Decision | Override? |
| ----------------------------- | ------------------------------------ | ----------- | --------- |
| `wrangler ai models`          | Read-only                            | `safe`      | `[ ]`     |
| `wrangler ai finetune list`   | Read-only                            | `safe`      | `[ ]`     |
| `wrangler ai finetune create` | Folder path (could reveal structure) | `sensitive` | `[ ]`     |

## Pipelines Commands

| Command                             | Reason               | My Decision | Override? |
| ----------------------------------- | -------------------- | ----------- | --------- |
| `wrangler pipelines list`           | Read-only            | `safe`      | `[ ]`     |
| `wrangler pipelines get`            | Read-only            | `safe`      | `[ ]`     |
| `wrangler pipelines create`         | Just pipeline name   | `safe`      | `[ ]`     |
| `wrangler pipelines delete`         | Just pipeline name   | `safe`      | `[ ]`     |
| `wrangler pipelines update`         | Just pipeline config | `safe`      | `[ ]`     |
| `wrangler pipelines setup`          | Just pipeline setup  | `safe`      | `[ ]`     |
| `wrangler pipelines streams create` | Just stream config   | `safe`      | `[ ]`     |
| `wrangler pipelines streams list`   | Read-only            | `safe`      | `[ ]`     |
| `wrangler pipelines streams get`    | Read-only            | `safe`      | `[ ]`     |
| `wrangler pipelines streams delete` | Just stream ID       | `safe`      | `[ ]`     |
| `wrangler pipelines sinks create`   | Just sink config     | `safe`      | `[ ]`     |
| `wrangler pipelines sinks list`     | Read-only            | `safe`      | `[ ]`     |
| `wrangler pipelines sinks get`      | Read-only            | `safe`      | `[ ]`     |
| `wrangler pipelines sinks delete`   | Just sink ID         | `safe`      | `[ ]`     |

## VPC Commands

| Command                       | Reason              | My Decision | Override? |
| ----------------------------- | ------------------- | ----------- | --------- |
| `wrangler vpc service list`   | Read-only           | `safe`      | `[ ]`     |
| `wrangler vpc service get`    | Read-only           | `safe`      | `[ ]`     |
| `wrangler vpc service create` | Just service name   | `safe`      | `[ ]`     |
| `wrangler vpc service delete` | Just service name   | `safe`      | `[ ]`     |
| `wrangler vpc service update` | Just service config | `safe`      | `[ ]`     |

## Triggers Commands

| Command                    | Reason                        | My Decision | Override? |
| -------------------------- | ----------------------------- | ----------- | --------- |
| `wrangler triggers deploy` | Just cron patterns and routes | `safe`      | `[ ]`     |

## Check Commands

| Command                  | Reason           | My Decision | Override? |
| ------------------------ | ---------------- | ----------- | --------- |
| `wrangler check startup` | Just worker name | `safe`      | `[ ]`     |

## Hello World (Internal/Test)

| Command                    | Reason       | My Decision | Override? |
| -------------------------- | ------------ | ----------- | --------- |
| `wrangler hello-world get` | Test command | `safe`      | `[ ]`     |
| `wrangler hello-world set` | Test command | `safe`      | `[ ]`     |

---

## Summary Statistics

Based on this audit:

- **Total commands**: ~170
- **Marked as `sensitive`**: ~35 (21%)
- **Marked as `safe`**: ~135 (79%)

## Implementation Notes

1. **Rename `args` to `safe_args`** in telemetry events to distinguish from historical data
2. **Invert the default**: Commands without explicit `sensitiveArgs` will default to `true` (sensitive)
3. **Mark safe commands explicitly**: Add `sensitiveArgs: false` to all commands marked `safe` above
4. Commands marked `sensitive` can either:
   - Explicitly set `sensitiveArgs: true`, OR
   - Rely on the inverted default (no change needed)
