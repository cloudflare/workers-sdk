# Workers SDK threat model

## Project and scope

Workers SDK is the monorepo for Cloudflare's tools for building, developing,
locally testing, and deploying Workers and Pages applications. The tools run
with the developer's operating system permissions and can use credentials with
access to Cloudflare resources.

Prioritize these components and their shared dependencies:

- `packages/wrangler/`: the CLI, local development and inspector servers,
  bundling, deployments, asset uploads, and Cloudflare API integration.
- `packages/miniflare/`: local development orchestration, host services, internal
  proxies, persistent storage, and embedded runtime Workers in `src/workers/`.
- `packages/vite-plugin-cloudflare/` and `packages/vitest-plugin/`: integrations
  that expose Miniflare through development servers and test runners.
- `packages/workers-auth/`, `packages/remote-bindings/`,
  `packages/workers-utils/`, and `packages/config/`: credential storage, OAuth,
  remote resource access, configuration, filesystem, and request handling.
- `packages/workers-shared/`, `packages/pages-shared/`,
  `packages/pages-functions/`, and `packages/kv-asset-handler/`: shared runtime
  logic, routing, middleware, and asset serving, including code deployed to
  production.
- `packages/create-cloudflare/`: project creation, handling of downloaded
  templates, and invocation of external tools.

The `workerd` runtime, V8, Node.js, and third-party dependencies are maintained
outside this repository. Focus on this repository's integration with them; an
upstream issue needs a reachable SDK impact and an identified upstream component.
Fixtures and playgrounds are useful reproducer material. An intentionally unsafe
example or test helper alone is not a vulnerability in a shipped package.

## Assets and trust boundaries

Protect the developer's files, environment variables, `.dev.vars` files,
credentials, authenticated sessions, and Cloudflare accounts. Protect the
integrity of code and assets selected for deployment, and the isolation of
local projects and their configured storage and bindings.

Important inputs include:

- HTTP requests, URLs, headers, bodies, WebSocket messages, and inspector
  connections to local development servers. Include requests sent by a malicious
  website through the developer's browser, even when the server binds to loopback.
- Paths, routing metadata, redirects, asset names, and encoded URLs handled by
  local servers or deployed asset and Pages middleware.
- Data returned by remote APIs, registries, templates, archives, and remote
  binding proxies, including error messages and content displayed in logs or UIs.
- Application traffic and binding data crossing from runtime Workers into
  host-side services or privileged internal control endpoints.

Check authentication and authorization of internal proxies, loopback services,
local project discovery, inspector endpoints, and remote bindings. Client-supplied
headers must not grant access to privileged host operations or another project's
bindings. Check host/origin validation, DNS rebinding, cross-site requests,
credential forwarding across redirects, and accidental credential disclosure.

Check path containment, symlinks, archive extraction, command arguments, and
rendering of attacker-controlled data where they cross a meaningful boundary.
A file-serving endpoint must not expose files beyond its intended roots. Remote
binding access must remain limited to the developer's configured permissions.

## Intended behavior and assumptions

Project source, build scripts, configuration files, installed dependencies, Vite
plugins, Vitest tests, and explicitly configured host callbacks are trusted code.
Running an attacker-controlled project or installing a malicious dependency can
already execute code as the developer. Report command execution only when an
attacker with less privilege can reach it through an unintended input path.

Local development and testing are not a hosted multi-tenant sandbox for arbitrary
untrusted projects. Worker code can intentionally use its configured bindings,
make outbound requests, and invoke configured host integrations. Those capabilities
alone are not sandbox escapes or SSRF. Unauthorized access to a privileged SDK
control channel, unconfigured host capabilities, or another project's resources
is worth investigating.

Some workflows deliberately expose an application on a non-loopback interface or
connect to live Cloudflare resources. State the configuration and privileges
required for an exploit. Distinguish application traffic from SDK control traffic;
public application access must not silently grant administrative capabilities.

## Building and testing offline

The scanner image keeps the checkout at `/src`, installs the complete pnpm
workspace with its lockfile, and builds packages under `packages/`. Node.js is
pinned to `volta.node` in `package.json`; Corepack uses its `packageManager` field
for pnpm. Build for Linux x86-64, matching the scanner; Miniflare's Chrome for
Testing download is not available for Linux ARM64.

Playwright's Chromium and Miniflare's separate Chrome installation are fetched
during the image build. The Dockerfile also runs focused runtime, authentication,
and asset-handler tests. From `/src`, useful offline commands are:

```sh
pnpm --filter miniflare exec vitest run test/loopback-auth.spec.ts test/dev-registry-auth.spec.ts test/workers/email-input-validation.spec.ts
pnpm --filter miniflare exec vitest run test/plugins/browser/index.spec.ts --testNamePattern='it creates a browser session'
pnpm --filter @cloudflare/workers-auth test:ci
pnpm --filter @cloudflare/kv-asset-handler test:ci
pnpm --filter wrangler test:ci src/__tests__/get-host-from-url.test.ts
```

After changing package source, rebuild the affected package and its dependencies,
for example `pnpm build --filter='miniflare...' --concurrency=2`. Test files and
fixtures are alongside their packages; add regression coverage at the shared
implementation layer and at an affected integration when necessary.

The entire monorepo test suite is not an offline smoke test. Tests that require a
live Cloudflare account, external downloads, a running Docker daemon, or an OS
keychain service need additional infrastructure. Use mocked API tests and local
reproducers without real credentials. Do not deploy resources, contact production
services, or use production tokens to demonstrate a finding.

## Severity and useful reports

Rate findings by demonstrated impact, attacker access, required user interaction,
and configuration. These are triage guidelines rather than automatic ratings:

- Critical: a practical, broadly exploitable compromise with exceptional impact,
  such as remote host code execution or account takeover without meaningful
  prerequisites. Explain the complete exploit chain.
- High: realistic unauthorized host code execution, theft of reusable credentials,
  access to sensitive files, or unauthorized modification of Cloudflare resources.
- Medium: meaningful but constrained confidentiality or integrity impact, or
  repeatable denial of service across a boundary the attacker should not control.
  Account for whether restarting the local tool restores service.
- Low: limited impact or substantial prerequisites with little additional access.

A crash, expensive request, missing header, or suspicious pattern alone does not
establish severity. Explain what an attacker can do beyond their intended
capabilities and whether the impact reaches the developer, other projects, or a
production deployment.

Provide the affected package and source location, a minimal local reproducer,
exact commands, expected and actual behavior, prerequisites, and a regression
test where possible. Use dummy secrets and mocked Cloudflare responses. Prefer
small patches in the lowest shared layer that fixes all affected consumers.
