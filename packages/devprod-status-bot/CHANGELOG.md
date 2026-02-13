# devprod-status-bot

## 1.4.1

### Patch Changes

- [#12435](https://github.com/cloudflare/workers-sdk/pull/12435) [`c2163df`](https://github.com/cloudflare/workers-sdk/commit/c2163df17f1c7b7fe96f10fbca35dc19ee65b7e2) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - Simplify Version Packages PR CI failure alerts

  The bot now sends an alert for any failing CI job on the Version Packages PR, instead of first fetching the required status checks from GitHub's branch protection API and filtering. This removes unnecessary complexity and ensures all CI failures are reported.

## 1.4.0

### Minor Changes

- [#12371](https://github.com/cloudflare/workers-sdk/pull/12371) [`50ad9a9`](https://github.com/cloudflare/workers-sdk/commit/50ad9a9ad9581122f83b9da245f10c9d677cc848) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - Send alert to ANT: Alerts chat on failed CI checks in Version Packages PRs

  When a required CI check fails or times out on the Version Packages PR (`changeset-release/main` branch), an alert is now sent to the ANT: Alerts Google Chat channel. This helps the team quickly identify and address CI failures that shouldn't occur since individual PRs have already passed before landing on main.

  Alerts for the same PR are grouped into the same chat thread using the PR number as the thread ID.

## 1.3.0

### Minor Changes

- [#11916](https://github.com/cloudflare/workers-sdk/pull/11916) [`0b249a1`](https://github.com/cloudflare/workers-sdk/commit/0b249a103e981b6f3f92290dbb65448ecd65739a) Thanks [@emily-shen](https://github.com/emily-shen)! - Notify when security advisories are submitted to workers-sdk

## 1.2.3

### Patch Changes

- [#11333](https://github.com/cloudflare/workers-sdk/pull/11333) [`474910a`](https://github.com/cloudflare/workers-sdk/commit/474910ac683bdb9b6c95fa4ab03623574d34ffc1) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix the security classification logic

## 1.2.2

### Patch Changes

- [#11315](https://github.com/cloudflare/workers-sdk/pull/11315) [`2309ec1`](https://github.com/cloudflare/workers-sdk/commit/2309ec1590490c803f254154bf731cdcd0eb3704) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - Tighten up the security checks on issues to avoid false positives

## 1.2.1

### Patch Changes

- [#10270](https://github.com/cloudflare/workers-sdk/pull/10270) [`7caf49e`](https://github.com/cloudflare/workers-sdk/commit/7caf49ef5e25ec3326dfc46f157057ec109a3131) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix security alerts to avoid being in the same notification thread

- [#10269](https://github.com/cloudflare/workers-sdk/pull/10269) [`469f6ee`](https://github.com/cloudflare/workers-sdk/commit/469f6eec9a2a2d29317720f0be6af5bd1fa02404) Thanks [@devin-ai-integration](https://github.com/apps/devin-ai-integration)! - Remove PR summary messages and PR update notifications from devprod-status-bot Worker

## 1.2.0

### Minor Changes

- [#10214](https://github.com/cloudflare/workers-sdk/pull/10214) [`b9d3174`](https://github.com/cloudflare/workers-sdk/commit/b9d317490a0236f3472646b175b75891290e41ef) Thanks [@devin-ai-integration](https://github.com/apps/devin-ai-integration)! - Add GitHub issue security analysis feature to detect and alert on potential vulnerability reports

## 1.1.7

### Patch Changes

- [#9649](https://github.com/cloudflare/workers-sdk/pull/9649) [`ec9b417`](https://github.com/cloudflare/workers-sdk/commit/ec9b417f8ed711e7b5044410e83d781f123a6a62) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - patch release to trigger a test release

## 1.1.6

### Patch Changes

- [#9033](https://github.com/cloudflare/workers-sdk/pull/9033) [`2c50115`](https://github.com/cloudflare/workers-sdk/commit/2c501151d3d1a563681cdb300a298b83862b60e2) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - chore: convert wrangler.toml files into wrangler.jsonc ones

## 1.1.5

### Patch Changes

- [`07613d3`](https://github.com/cloudflare/workers-sdk/commit/07613d3b231779466ca2528ce07385552ec73501) Thanks [@penalosa](https://github.com/penalosa)! - Trigger release after testing release process

## 1.1.4

### Patch Changes

- [#7486](https://github.com/cloudflare/workers-sdk/pull/7486) [`7e40e14`](https://github.com/cloudflare/workers-sdk/commit/7e40e145a8c3642c493a2f082eb32a1231c62ff8) Thanks [@penalosa](https://github.com/penalosa)! - Limit status bot repos

## 1.1.3

### Patch Changes

- [#7143](https://github.com/cloudflare/workers-sdk/pull/7143) [`4d7ce6f`](https://github.com/cloudflare/workers-sdk/commit/4d7ce6fd9fc80a0920a97dae14726c79012337b1) Thanks [@emily-shen](https://github.com/emily-shen)! - chore: enable observability on our internal infra Workers + bots

## 1.1.2

### Patch Changes

- [#6236](https://github.com/cloudflare/workers-sdk/pull/6236) [`26d0afc`](https://github.com/cloudflare/workers-sdk/commit/26d0afca80b2baf8ef79b1f4330e606b7d692adc) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - chore: add account_id to wrangler.toml to fix deployment

## 1.1.1

### Patch Changes

- [#6220](https://github.com/cloudflare/workers-sdk/pull/6220) [`c3cf009`](https://github.com/cloudflare/workers-sdk/commit/c3cf00984c16d3e865059fbd0f05fff28d8668cc) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - add Edmund and Emily to the contributors list

## 1.1.0

### Minor Changes

- [#5958](https://github.com/cloudflare/workers-sdk/pull/5958) [`93f7255`](https://github.com/cloudflare/workers-sdk/commit/93f725588a96a8baee408b273a57eb2dba9280d9) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - feat: add Andy to the list of internal contributors

## 1.0.0

### Major Changes

- [#5901](https://github.com/cloudflare/workers-sdk/pull/5901) [`ddf43da`](https://github.com/cloudflare/workers-sdk/commit/ddf43da91e4ec46249e38ccbb9498bb22085ebe1) Thanks [@penalosa](https://github.com/penalosa)! - feat: Add & release the initial version of the status bot
