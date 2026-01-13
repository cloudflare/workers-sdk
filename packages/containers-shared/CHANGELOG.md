# @cloudflare/containers-shared

## 0.8.0

### Minor Changes

- [#11755](https://github.com/cloudflare/workers-sdk/pull/11755) [`0f8d69d`](https://github.com/cloudflare/workers-sdk/commit/0f8d69d31071abeb567aa3c8478492536b5740fb) Thanks [@nikitassharma](https://github.com/nikitassharma)! - Users can now specify `constraints.tiers` for their container applications. `tier` is deprecated in favor of `tiers`.
  If left unset, we will default to `tiers: [1, 2]`.
  Note that `constraints` is an experimental feature.

## 0.7.0

### Minor Changes

- [#11702](https://github.com/cloudflare/workers-sdk/pull/11702) [`f612b46`](https://github.com/cloudflare/workers-sdk/commit/f612b4683a7e1408709ad378fb6c5b96af485d49) Thanks [@gpanders](https://github.com/gpanders)! - Add support for trusted_user_ca_keys in Wrangler

  You can now configure SSH trusted user CA keys for containers. Add the following to your wrangler.toml:

  ```toml
  [[containers.trusted_user_ca_keys]]
  public_key = "ssh-ed25519 AAAAC3..."
  ```

  This allows you to specify CA public keys that can be used to verify SSH user certificates.

- [#11437](https://github.com/cloudflare/workers-sdk/pull/11437) [`9e360f6`](https://github.com/cloudflare/workers-sdk/commit/9e360f6918588af59f86bb153008f3ec18b082c6) Thanks [@ichernetsky-cf](https://github.com/ichernetsky-cf)! - Drop deprecated containers `observability.logging` field

### Patch Changes

- [#11768](https://github.com/cloudflare/workers-sdk/pull/11768) [`2a4299d`](https://github.com/cloudflare/workers-sdk/commit/2a4299db71d39c68eac2e51abd8c14398b813adc) Thanks [@gpanders](https://github.com/gpanders)! - Rename "durable_objects_active" field in ApplicationHealthInstances to "active"

## 0.6.0

### Minor Changes

- [#11196](https://github.com/cloudflare/workers-sdk/pull/11196) [`171cfd9`](https://github.com/cloudflare/workers-sdk/commit/171cfd96e07394ccd00025770d18657c6c297c87) Thanks [@emily-shen](https://github.com/emily-shen)! - For containers being created in a FedRAMP high environment, registry credentials are encrypted by the container platform.
  Update wrangler to correctly send a request to configure a registry for FedRAMP containers.

## 0.5.0

### Minor Changes

- [#10582](https://github.com/cloudflare/workers-sdk/pull/10582) [`991760d`](https://github.com/cloudflare/workers-sdk/commit/991760d13168f613a99a4b6e70a43887934cddfb) Thanks [@flakey5](https://github.com/flakey5)! - Add `containers ssh` command

## 0.4.0

### Minor Changes

- [#11360](https://github.com/cloudflare/workers-sdk/pull/11360) [`6b38532`](https://github.com/cloudflare/workers-sdk/commit/6b38532298a17fc4fd643dd8eb96647d9ef98e2f) Thanks [@emily-shen](https://github.com/emily-shen)! - Containers: Allow users to directly authenticate external image registries in local dev

  Previously, we always queried the API for stored registry credentials and used those to pull images. This means that if you are using an external registry (ECR, dockerhub) then you have to configure registry credentials remotely before running local dev.

  Now you can directly authenticate with your external registry provider (using `docker login` etc.), and Wrangler or Vite will be able to pull the image specified in the `containers.image` field in your config file.

  The Cloudflare-managed registry (registry.cloudflare.com) currently still does not work with the Vite plugin.

## 0.3.0

### Minor Changes

- [#10605](https://github.com/cloudflare/workers-sdk/pull/10605) [`b55a3c7`](https://github.com/cloudflare/workers-sdk/commit/b55a3c70f7204c56e4f33649bc2ebcc2f7fa75f3) Thanks [@emily-shen](https://github.com/emily-shen)! - Add command to configure credentials for non-Cloudflare container registries

  Note this is a closed/experimental command that will not work without the appropriate account-level capabilities.

## 0.2.13

### Patch Changes

- [#11007](https://github.com/cloudflare/workers-sdk/pull/11007) [`cf16deb`](https://github.com/cloudflare/workers-sdk/commit/cf16debb668a1ffb69cba9171048c5a295dde6c6) Thanks [@gpanders](https://github.com/gpanders)! - Correctly handle image names that contain a slash

- [#11000](https://github.com/cloudflare/workers-sdk/pull/11000) [`a6de9db`](https://github.com/cloudflare/workers-sdk/commit/a6de9db65185ba40e8a7fcecc5d9e79287c04d2f) Thanks [@jonboulle](https://github.com/jonboulle)! - always load container image into local store during build

  BuildKit supports different [build drivers](https://docs.docker.com/build/builders/drivers/). When using the more modern `docker-container` driver (which is now the default on some systems, e.g. a standard Docker installation on Fedora Linux), it will not automatically load the built image into the local image store. Since wrangler expects the image to be there (e.g. when calling `getImageRepoTags`), it will thus fail, e.g.:

  ```
  ⎔ Preparing container image(s)...
  [+] Building 0.3s (8/8) FINISHED                                                                                                                                                                                                     docker-container:default

  [...]

  WARNING: No output specified with docker-container driver. Build result will only remain in the build cache. To push result image into registry use --push or to load image into docker use --load

  ✘ [ERROR] failed inspecting image locally: Error response from daemon: failed to find image cloudflare-dev/sandbox:f86e40e4: docker.io/cloudflare-dev/sandbox:f86e40e4: No such image

  ```

  Explicitly setting the `--load` flag (equivalent to `-o type=docker`) during the build fixes this and should make the build a bit more portable without requiring users to change their default build driver configuration.

## 0.2.12

### Patch Changes

- [#10634](https://github.com/cloudflare/workers-sdk/pull/10634) [`62656bd`](https://github.com/cloudflare/workers-sdk/commit/62656bd8863e650e498552d5dff5f281f5506c4e) Thanks [@emily-shen](https://github.com/emily-shen)! - fix: error if the container image uri has an account id that doesn't match the current account

## 0.2.11

### Patch Changes

- [#10623](https://github.com/cloudflare/workers-sdk/pull/10623) [`7a6381c`](https://github.com/cloudflare/workers-sdk/commit/7a6381c4f9494dd871f70c305763d22e7049a0be) Thanks [@IRCody](https://github.com/IRCody)! - Handle more cases for correctly resolving the full uri for an image when using containers push.

- [#10808](https://github.com/cloudflare/workers-sdk/pull/10808) [`a7f6966`](https://github.com/cloudflare/workers-sdk/commit/a7f6966825df066e7d9e254164471a1916b40247) Thanks [@nikitassharma](https://github.com/nikitassharma)! - When returning the default managed registry, inspect the environment variable
  `WRANGLER_API_ENVIRONMENT` to determine if we should be returning the production
  or staging registry.

- [#10769](https://github.com/cloudflare/workers-sdk/pull/10769) [`0a554f9`](https://github.com/cloudflare/workers-sdk/commit/0a554f9323bb323c97dd07cfb5805ea5d20b371d) Thanks [@penalosa](https://github.com/penalosa)! - Mark more errors as `UserError` to disable Sentry reporting

## 0.2.10

### Patch Changes

- [#10289](https://github.com/cloudflare/workers-sdk/pull/10289) [`a5a1426`](https://github.com/cloudflare/workers-sdk/commit/a5a1426a9ead85d2518f01fde0c1dbc02f98c4df) Thanks [@emily-shen](https://github.com/emily-shen)! - Cleanup container images created during local dev if no changes have been made.

  We now untag old images that were created by Wrangler/Vite if we find that the image content and configuration is unchanged, so that we don't keep accumulating image tags.

## 0.2.9

### Patch Changes

- [#10258](https://github.com/cloudflare/workers-sdk/pull/10258) [`d391076`](https://github.com/cloudflare/workers-sdk/commit/d39107694b6bd9d63f15b529798aba0fd9a43643) Thanks [@nikitassharma](https://github.com/nikitassharma)! - Add the option to allow all tiers when creating a container

- [#10232](https://github.com/cloudflare/workers-sdk/pull/10232) [`e7cae16`](https://github.com/cloudflare/workers-sdk/commit/e7cae16d5be9a8a0487ffab351ccf8f27808524f) Thanks [@emily-shen](https://github.com/emily-shen)! - include containers API calls in output of WRANGLER_LOG=debug

## 0.2.8

### Patch Changes

- [#10061](https://github.com/cloudflare/workers-sdk/pull/10061) [`f8a80a8`](https://github.com/cloudflare/workers-sdk/commit/f8a80a807576f7fa6d9eca37d297c50793bca188) Thanks [@emily-shen](https://github.com/emily-shen)! - feat(containers): try to automatically get the socket path that the container engine is listening on.

  Currently, if your container engine isn't set up to listen on `unix:///var/run/docker.sock` (or isn't symlinked to that), then you have to manually set this via the `dev.containerEngine` field in your Wrangler config, or via the env vars `WRANGLER_DOCKER_HOST`. This change means that we will try and get the socket of the current context automatically. This should reduce the occurrence of opaque `internal error`s thrown by the runtime when the daemon is not listening on `unix:///var/run/docker.sock`.

  In addition to `WRANGLER_DOCKER_HOST`, `DOCKER_HOST` can now also be used to set the container engine socket address.

## 0.2.7

### Patch Changes

- [#9819](https://github.com/cloudflare/workers-sdk/pull/9819) [`0c4008c`](https://github.com/cloudflare/workers-sdk/commit/0c4008ce183c82ebff8eac2469ff9a8256cffa5f) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - feat(vite-plugin): Add containers support in `vite dev`

  Adds support for Cloudflare Containers in `vite dev`. Please note that at the time of this PR a container image can only specify the path to a `Dockerfile`. Support for registry links will be added in a later version, as will containers support in `vite preview`.

## 0.2.6

### Patch Changes

- [#9925](https://github.com/cloudflare/workers-sdk/pull/9925) [`b46386c`](https://github.com/cloudflare/workers-sdk/commit/b46386c0b245ef1d64e6e7dcff4e421002a3158c) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - clarify the docker build error message

## 0.2.5

### Patch Changes

- [#9833](https://github.com/cloudflare/workers-sdk/pull/9833) [`3743896`](https://github.com/cloudflare/workers-sdk/commit/3743896120baa530c1b6d4cb7eeda27847b2db44) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - extend `prepareContainerImagesForDev` to allow aborting a container's build process

- [#9923](https://github.com/cloudflare/workers-sdk/pull/9923) [`c01c4ee`](https://github.com/cloudflare/workers-sdk/commit/c01c4ee6affd0acf2f678d9c562f4a7d6db82465) Thanks [@gpanders](https://github.com/gpanders)! - Fix image name resolution when modifying a container application

## 0.2.4

### Patch Changes

- [#9888](https://github.com/cloudflare/workers-sdk/pull/9888) [`d2fe58b`](https://github.com/cloudflare/workers-sdk/commit/d2fe58b33a3172e204ff3a477c4a0d33ab8f2c76) Thanks [@IRCody](https://github.com/IRCody)! - Remove undici dependency from @cloudflare/containers-shared

- [#9879](https://github.com/cloudflare/workers-sdk/pull/9879) [`e10c3e2`](https://github.com/cloudflare/workers-sdk/commit/e10c3e2a6b3049d23b58cbc63eef1756233cf9c3) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - fix: enable Dockerfile exposed port validation on linux as well

- [#9879](https://github.com/cloudflare/workers-sdk/pull/9879) [`e10c3e2`](https://github.com/cloudflare/workers-sdk/commit/e10c3e2a6b3049d23b58cbc63eef1756233cf9c3) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - update error message presented when no port is exported by the image

## 0.2.3

### Patch Changes

- [#9872](https://github.com/cloudflare/workers-sdk/pull/9872) [`a727db3`](https://github.com/cloudflare/workers-sdk/commit/a727db341a811572623e0a0f361f070a95758776) Thanks [@emily-shen](https://github.com/emily-shen)! - fix: resolve Dockerfile path relative to the Wrangler config path

  This fixes a bug where Wrangler would not be able to find a Dockerfile if a Wrangler config path had been specified with the `--config` flag.

## 0.2.2

### Patch Changes

- [#9718](https://github.com/cloudflare/workers-sdk/pull/9718) [`fb83341`](https://github.com/cloudflare/workers-sdk/commit/fb83341bed6ff6571519eb117db19e3e76a83215) Thanks [@mhart](https://github.com/mhart)! - fix error message when docker daemon is not running

## 0.2.1

### Patch Changes

- [#9596](https://github.com/cloudflare/workers-sdk/pull/9596) [`5162c51`](https://github.com/cloudflare/workers-sdk/commit/5162c5194604f26b2e5018961b761f3450872333) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - add ability to pull images for containers local dev

## 0.2.0

### Minor Changes

- [#9675](https://github.com/cloudflare/workers-sdk/pull/9675) [`caf97e4`](https://github.com/cloudflare/workers-sdk/commit/caf97e40e5c9d765dcf0bd716cd81d986c496bdc) Thanks [@emily-shen](https://github.com/emily-shen)! - `containers-shared` contains shared code relating to containers that is used across `workers-sdk`.

### Patch Changes

- [#9653](https://github.com/cloudflare/workers-sdk/pull/9653) [`8a60fe7`](https://github.com/cloudflare/workers-sdk/commit/8a60fe76ec5ecc734c0eb9f31b4d60e86d5cb06d) Thanks [@penalosa](https://github.com/penalosa)! - Rename `WRANGLER_CONTAINERS_DOCKER_PATH` to `WRANGLER_DOCKER_BIN`

- [#9653](https://github.com/cloudflare/workers-sdk/pull/9653) [`8a60fe7`](https://github.com/cloudflare/workers-sdk/commit/8a60fe76ec5ecc734c0eb9f31b4d60e86d5cb06d) Thanks [@penalosa](https://github.com/penalosa)! - Add a warning banner to `wrangler cloudchamber` and `wrangler containers` commands

- [#9605](https://github.com/cloudflare/workers-sdk/pull/9605) [`17d23d8`](https://github.com/cloudflare/workers-sdk/commit/17d23d8e5fd54737d1c4b9cb487fd6e85cddc9c8) Thanks [@emily-shen](https://github.com/emily-shen)! - Add rebuild hotkey for containers local dev, and clean up containers at the end of a dev session.
