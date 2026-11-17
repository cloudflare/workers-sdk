# Multipart object uploads

```sh
wrangler r2 object put my-bucket/backups/archive.tar --remote --multipart --file ./archive.tar
```

`--multipart` uploads a non-empty regular file in sequential 90 MiB parts. The last part can be smaller. This transport supports at most 10,000 parts (943,718,400,000 bytes). It requires `--remote` and `--file`; it cannot be used with `--local` or `--pipe`. Without `--multipart`, the existing single-request upload and its 300 MiB limit apply.

The command uses the current Wrangler login or API token, account, auth profile, compliance region, and requested `--jurisdiction`. It does not require S3 keys. In addition to R2 access, API tokens must have the permissions required to create a Workers preview session, as used by remote bindings. No permanent Worker is deployed. Failure to establish this session is reported before the multipart upload starts.

Before starting, the command asks for confirmation because the upload can overwrite an object and bypasses the REST API's Basin Catalog guard. If Basin Catalog is enabled, writing arbitrary objects can leave it in an invalid state. Use `--force` to acknowledge this warning, including in non-interactive environments.

The usual HTTP metadata and `--storage-class` options apply. For multipart uploads, `--expires` must be a valid date, such as `"Wed, 21 Oct 2037 07:28:00 GMT"`.

Each failed part is retried only for transient failures, with at most four attempts and exponential backoff. Memory use is bounded by streaming buffers rather than the file's size. The command hashes the source file before uploading, checks for source changes, and reads the completed remote object in full to verify its size and SHA-256. Verification downloads the entire object again and adds read operations and time. The multipart ETag is not treated as the full-file checksum.

On failure or a handled interrupt, the command attempts to abort an incomplete upload. It reports when cleanup cannot be confirmed; remaining parts are subject to the bucket's abort-multipart lifecycle rule. Abrupt termination, such as `SIGKILL`, cannot run cleanup. There is no persistent checkpoint or resume across CLI invocations.

If completion or verification fails, the object may already be published. The command reports failure and leaves the object in place for inspection. It never automatically deletes a completed object, including one that may have been overwritten by a concurrent writer.
