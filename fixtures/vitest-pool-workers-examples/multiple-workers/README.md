# 🔌 multiple-workers

This example uses multiple Workers:

- `api-service`: entrypoint to the project, forwards requests on to other services as needed
- `auth-service`: handles signing and verifying JWTs
- `database-service`: handles reading/writing values from a KV namespace

In a real project, only the `api-service` would be publicly routable. The `auth-service` sends request to an external endpoint to login and sign JWTs. This endpoint is mocked in tests using the `outboundService` Miniflare option. The `database-service` assumes the user has been authenticated and allows reads/writes to any key.

| Test                                            | Overview                       |
| ----------------------------------------------- | ------------------------------ |
| [integration.test.ts](test/integration.test.ts) | Integration tests using `SELF` |
