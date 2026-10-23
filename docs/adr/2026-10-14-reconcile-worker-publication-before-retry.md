# Reconcile Worker publication before retry

- Date: 2026-10-14

## Context

Transient control-plane failures can interrupt publication after a Worker version has already uploaded. Uploads retry; the subsequent deployment creation does not.

## Constraints and evidence

The deployment API creates a new record for each POST and may fail after commit. Repeating an entire customer deploy command can duplicate unrelated side effects. Deployment history exposes the live version traffic and message, but there is no compare-and-swap precondition.

## Decision

Retry the final publication at most three times, with 30-second attempt deadlines and a 95-second total budget. Before another POST, read deployment history: accept a matching live target or stop on a different deployment. Keep version upload and customer commands outside this retry boundary.

## Alternatives considered

Reject blind POST retries and full-command retries. Leave other callers of the low-level deployment API unchanged.

## Consequences

Ambiguous successful publications can recover without another write. A concurrent deploy between reconciliation and POST remains possible; this is not exactly-once publication.

## Reconsider when

The API exposes idempotency keys or conditional deployment writes.
