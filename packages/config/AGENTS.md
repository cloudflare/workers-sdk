# `@cloudflare/config` — Agent Guide

> Defines, loads, and validates the configuration format authored in
> `cloudflare.config.ts` and emitted in the Build Output Specification. Do NOT
> repeat root AGENTS.md content (pnpm, changesets, code style, etc.).

This package is the single configuration format for the Developer Platform.
Its parsed config is consumed directly by the `cf` CLI, the Vite and Vitest
plugins, Miniflare, the build output and deploy tooling, and third-party tools.
Miniflare's own Worker configuration extends this package's schemas, so schema
changes flow directly into it. The schema is a public contract, so a change to
it is a design decision, not only a code change, and it affects every consumer.
Every change must uphold the principles below. If a requested change conflicts
with one of them, stop and raise the conflict rather than working around it.

## Config Structure

A config describes a project, not a single Worker. Its root can hold any of the
following, all of which are optional:

- **Account settings** that apply to everything in the config.
- **`worker`**, the Worker the project defines.
- **`containers`**, the Container applications the project defines.

## Design Principles

### Code-reflective structure

The `worker` definition mirrors how the Worker is written:

- `env` reflects `env` in the Worker: one entry per binding, keyed by the name
  the code uses.
- `exports` reflects the Worker's exports, keyed by export name.
- `triggers` reflects the Worker's handlers. Custom domains are configured
  separately for the common case.

Keep `env` and `exports` distinct:

- A Worker's own exports are configured in `exports` and accessed via
  `ctx.exports`. Bindings in `env` are intended for targets outside the Worker.
  Bindings to the Worker's own exports still work, but do not design features
  that depend on them.
- Settings for an export belong in the `exports` entry of the Worker that
  exports it, never in a binding definition. For example, Workflow schedules
  cannot be configured from `env`.

### Clear boundaries

The config contains only runtime and platform concerns:

- **Runtime:** how the Worker behaves (compatibility date and flags, bindings,
  and so on).
- **Platform:** how the project's resources interact with the rest of the
  platform (triggers, domains, placement, observability, and so on).

It does not contain:

- **Tool config:** options for a particular developer tool. These belong in that
  tool's own options or CLI flags.
- **Build config:** how resources are built, such as bundler options. This
  belongs in the build tool. The config can point to a resource's sources, such
  as the Worker entrypoint or a Container's Dockerfile, which the build output
  replaces with what was built. There is deliberately no assets directory
  field. It would mix build inputs and outputs, and with tools such as Vite
  several sources contribute to the assets. The build tool owns where assets
  come from.

Before adding a field, ask whether it would still mean something if the project
were deployed directly through the API with no local tooling. If not, it does
not belong here. The one exception is behavior that every tool needs for
local development, such as connecting a binding to a remote resource. Such
options go in a `dev` object on the binding or feature they affect, never at
the top level or under a tool's name.

Worker fields describe the Worker itself. Bindings connect the Worker to other
products' resources; they do not configure those products. Do not add a Worker
field for another product's settings. If a product seems to need per-Worker
settings, raise it as a design question before adding anything.

Keep the package free of logic for any one tool. Values that differ between
tools, such as the mode, come from the context object the consumer provides.

### Programmatic config

`cloudflare.config.ts` is TypeScript, so branching and dynamic values are
expressed in code using the context and `process.env`. Do not reintroduce
named environments, inheritance, or override rules into the schema. Those are
the complexity this format exists to remove.

### Consistency

- **Casing:** camelCase for property keys, kebab-case for string enum values.
- **`id`:** globally unique across Cloudflare.
- **`name`:** unique within a namespace, for example a single account.
- **`namespace`:** a separate concept from `name`, used where the resource has
  one.
- Prefix these (for example `tunnelId`, `networkId`) only when the bare word
  would be ambiguous.
- Bindings, triggers, and exports are discriminated unions keyed by `type`.
- Choose names that fit this format rather than copying Wrangler's. Wrangler's
  names are a migration source, not a precedent.

When adding a field, look at how the closest existing fields are named and
shaped, and match them.

## Loading and Resolution

The package turns `cloudflare.config.ts` into a parsed config in three steps:

1. **Evaluate** the config module. It is evaluated fresh on every load. The
   files imported while the module is evaluated, excluding installed packages,
   are reported so that consumers can reload when they change.
2. **Resolve** it with the context the consumer provides. The config and each
   resource definition can be a value, a promise, or a function of the
   context. References between resources are replaced with their names.
   Depending on the reference, it can be a name, a definition, or either. For
   example, a Container is always referenced by its definition.
3. **Validate** the resolved config against the schema. Problems are returned
   as issues with paths rather than thrown, so each consumer decides how to
   report them.

Two rules apply throughout:

- The loader never loads or executes Worker code itself. A config references
  the entrypoint with the `cf-worker` import attribute, which gives its path
  without loading the module.
- Keep each concern in its own step. Helpers do not resolve or validate,
  evaluation does not validate, and validation does not do I/O.

## Authored Types and Helpers

The hand-written public types are the user experience: they decide which
mistakes are caught as the user types.

- Every field needs clear JSDoc.
- Make invalid combinations impossible to express. Model mutually exclusive
  options as unions, and check that the resulting type errors point at the
  offending property.
- Add a helper (`bindings`, `exports`, `triggers`) with each new type. Helpers
  build plain entries with no defaults or logic, so a helper-built entry and a
  hand-written object are equivalent.
- The `define*` helpers return their input unchanged and preserve its exact
  inferred type.
- Export every type that can appear in a user's inferred config type, or
  declaration emit fails for projects that generate declarations.

## Type Inference

Types that come from the config are inferred from it rather than generated, so
they update as soon as the config changes. This includes the Worker's `env`
type, across every branch of a conditional config, and the export names a
binding can reference on another Worker. Runtime types are generated
separately and depend only on the compatibility date and flags. Keep the two
separate.

Changes must not degrade inference. Cover type-level behavior with type tests
as well as runtime tests.

## Validation

- Constraints that types cannot express are enforced in the schema. Error
  messages state the rule and name the fields involved.
- The public types and the schemas describe the same shape, and compile-time
  checks catch drift. Change both together rather than loosening the checks.
- Parsed output must remain valid schema input, because consumers modify a
  parsed config and parse it again. Do not add transforms that change a
  value's shape.
- The schema does not set defaults. An omitted field stays omitted in the
  parsed config, so it reflects what the user wrote, and each consumer applies
  its own default. A `@default` tag in JSDoc documents the default but does not
  set it.
- When a field is renamed, keep the old name as a deprecated field that accepts
  no value, with an error message that names the replacement.

## Build Output and Wrangler

- Each resource in the build output uses the same base shape as in the
  authored config. It differs only where deployment needs something different,
  such as a module manifest in place of a source entrypoint. The build output
  is fully resolved and serializable.
- Conversion to Wrangler's format is a compatibility bridge and the only place
  Wrangler's naming appears. Do not let the structure of Wrangler's config
  shape this package's format.
- When a field has a Wrangler equivalent, update the conversion and the
  Wrangler migration codemod in the same change.

## Escape Hatches

- Put features whose shape is still settling under `experimental`. Fields
  there may change or be removed without a major version bump.
- `unsafe` passes through values the format does not model. Do not use it to
  avoid designing a proper field for a supported feature.

## Checklist for Schema Changes

- Is it runtime or platform behavior, not tool or build behavior? Are
  local-development-only options under `dev`?
- Is it on the resource it configures, and does a Worker field configure the
  Worker rather than another product?
- Within the Worker, is it where the code would look for it (`env`, `exports`,
  or `triggers`), and defined once, on the Worker that owns it?
- Is it named and shaped like its closest neighbors?
- Are invalid combinations impossible in the types and rejected by the schema?
- Are the types, JSDoc, helper, schema, inference, Wrangler conversion, and
  codemod updated, with runtime and type tests?
- Do Miniflare and the other consumers handle it?
