// S3-compatible API for local R2 buckets. Status codes, headers, XML bodies,
// and header-screening behavior mimic R2's S3 endpoint, captured from a real
// bucket (2026-06-11).
//
// ## Gaps: surfaces real R2 implements, with no local equivalent
//
// These exist in real R2 but cannot be served faithfully here because the R2
// binding backing this endpoint (and Miniflare's R2 simulator behind it)
// exposes no equivalent. Operations among them respond exactly like the
// operations R2's S3 endpoint itself does not implement: R2's templated
// "<name> not implemented" error (plus list/bucket-route "search parameter"
// errors and RouteNotFound for unknown methods).
//
// - SSE-C: the simulator ignores encryption keys entirely, so writes with
//   SSE-C headers are rejected with NotImplemented rather than silently
//   storing plaintext. Reads with SSE-C headers return the same error real
//   R2 gives for unencrypted objects.
// - x-amz-storage-class: the simulator can't persist storage classes, so
//   non-default classes (STANDARD_IA) are rejected with NotImplemented
//   rather than silently stored as STANDARD.
// - Flexible checksums: real R2 validates, stores, and echoes
//   x-amz-checksum-* request headers (returning BadDigest on mismatch); the
//   local binding has no checksum surface beyond MD5, so they are silently
//   ignored like other unrecognized x-amz-* headers (Content-MD5 IS
//   verified). The aws-chunked content encoding SDKs use to stream trailing
//   checksums is not decoded either; clients must send plain bodies.
// - ListParts, ListMultipartUploads, the partNumber query parameter, the
//   bucket-configuration reads ?acl, ?cors, and ?lifecycle, and the
//   bucket-configuration writes/deletes for ?cors, ?encryption, ?lifecycle,
//   and ?versioning answer the templated not-implemented error described
//   above.
// - Owner in listings is omitted; there's no account id to report locally.
// - ListBuckets omits CreationDate; local buckets have no creation time.
// - GetBucketLocation reports "auto"; real R2 reports the bucket's location
//   hint (e.g. ENAM).
//
// ## By design: surfaces where the local architecture differs
//
// Local buckets and credentials are declared in Wrangler/Miniflare config,
// not provisioned under a Cloudflare account, so some of real R2's account
// semantics deliberately do not apply:
//
// - CreateBucket and DeleteBucket answer the templated not-implemented
//   error: a bucket exists locally by being configured as a binding, and a
//   bucket created over HTTP would not be reachable from any Worker.
// - Credentials are per-bucket, not account-scoped. Requests for unknown
//   buckets return NoSuchBucket without checking the signature (real R2
//   verifies auth first), and ListBuckets lists the buckets sharing the
//   presented credential pair rather than every bucket on an account.
// - CORS: cross-origin use is always allowed, as if the bucket had a
//   permissive CORS policy configured. Real R2 answers preflights according
//   to the bucket's per-bucket CORS configuration, which has no R2 binding
//   equivalent. Without preflight approval for `Authorization` and
//   `x-amz-*` headers, no browser request could ever reach this endpoint
//   (e.g. presigned uploads from a frontend dev server).
//
// ## Client quirks
//
// - workerd never responds with `100 Continue`, so clients sending
//   `Expect: 100-continue` (the AWS SDKs do by default for requests with
//   bodies) hang waiting for it. With @aws-sdk/client-s3, remove the
//   `addExpectContinueMiddleware` from the client's middleware stack.

import { cors } from "hono/cors";
import { Hono } from "hono/tiny";
import { CorePaths } from "../../core/constants";
import { listBuckets } from "./account.worker";
import { dispatch } from "./dispatch.worker";
import type { Env } from "./common.worker";

const app = new Hono<{ Bindings: Env }>().basePath(CorePaths.R2_S3);

app.use(
	cors({
		origin: "*",
		allowMethods: ["GET", "HEAD", "PUT", "POST", "DELETE"],
		exposeHeaders: ["*"],
	})
);

app.all("/:bucketId/:key{.+}", (c) => dispatch(c, c.req.param("key")));
app.all("/:bucketId", (c) => dispatch(c, undefined));
app.all("/", (c) => listBuckets(c));

export default app;
