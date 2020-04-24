# Release Checklist

This is a list of the things that need to happen during a release.

## Build a Release

### Prepare the Changelog (Full release only)

1. Open the associated milestone. All issues and PRs should be closed. If
   they are not you should reassign all open issues and PRs to future
   milestones.
1. Go through the commit history since the last release. Ensure that all PRs
   that have landed are marked with the milestone. You can use this to
   show all the PRs that are merged on or after YYY-MM-DD:
   `https://github.com/issues?q=repo%3Acloudflare%2Fkv-asset-handler+merged%3A%3E%3DYYYY-MM-DD`
1. Go through the closed PRs in the milestone. Each should have a changelog
   label indicating if the change is docs, fix, feature, or maintenance. If
   there is a missing label, please add one.
1. Choose an emoji for the release. Try to make it semi-related to something that's been included in the release (point releases can be a little weirder).
1. Add this release to the `CHANGELOG.md`. Use the structure of previous
   entries. If you use VS Code, you can use [this snippet](https://gist.github.com/EverlastingBugstopper/04d1adb99506388ff9d7abd8d0a82bc3) to insert new changelog sections. If it is a release candidate, no official changelog is needed, but testing instructions will be added later in the process.

### Start a release PR

1. Create a new branch "#.#.#" where "#.#.#" is this release's version (release) or "#.#.#-rc.#" (release candidate)
1. Push up a commit with the `CHANGELOG.md` changes. The commit message can just be "#.#.#" (release) or "#.#.#-rc.#" (release candidate)
1. Request review from the @cloudflare/workers-devexp team.

### Review

Most of your comments will be about the changelog. Once the PR is finalized and approved...

1. If you made changes, squash or fixup all changes into a single commit.
1. Run `git push` and wait for CI to pass.

### Tag and build release

This part of the release process is handled by GitHub Actions, and our binaries are distributed as GitHub Releases. When you push a version tag, it kicks off an action that creates a new GitHub release for that tag, builds release binaries and attaches them to the release.

1. Once ready to merge, tag the commit by running either `git tag -a v#.#.# -m #.#.#` (release), or `git tag -a v#.#.#-rc.# -m #.#.#` (release candidate)
1. Run `git push --tags`.
1. Wait for CI to pass.

### Edit the release

After CI builds the release binaries and they appear on the [releases page](https://github.com/cloudflare/kv-asset-handler/releases), click `Edit` and update release notes.

### Publish to npm

Full releases are tagged `latest`. Release candidates are tagged `beta`. If for some reason you mix up the commands below, follow the troubleshooting guide.

1. If this is a full release, `cd npm && npm publish`. If it is a release candidate, `cd npm && npm publish --tag beta`
1. Tweet.

# Troubleshooting a release

Mistakes happen. Most of these release steps are recoverable if you mess up. The goal is not to, but if you find yourself cursing a fat fingered command, here are some troubleshooting tips. Please feel free to add to this guide.

## I pushed the wrong tag

Tags and releases can be removed in GitHub. First, [remove the remote tag](https://stackoverflow.com/questions/5480258/how-to-delete-a-remote-tag):

```console
$ git push --delete origin tagname
```

This will turn the release into a `draft` and you can delete it from the edit page.

Make sure you also delete the local tag:

```console
$ git tag --delete vX.X.X
```

## I forgot to add the `beta` tag to my RC when I ran `npm publish`

Never fear! We can fix this by updating npm tags. First, add a beta tag for the version you just published:

```console
$ npm dist-tag add @cloudflare/kv-asset-handler@x.x.x-rc.x beta
```

once you add the beta tag, pause...

...and then list your tags:

```console
$ npm dist-tag ls @cloudflare/kv-asset-handler
```

You should now see two tags pointing to the version you just pushed; for example if you had tried to push v1.9.0-rc.0:

```console
$ npm dist-tag ls @cloudflare/kv-asset-handler
beta: 1.9.0-rc.0
latest: 1.9.0-rc.0
```

Go back to the Changelog or GitHub releases, find the _actual_ latest version, and re-tag it as latest:

```console
$ npm dist-tag add @cloudflare/kv-asset-handler@x.x.x latest
```

List tags again and you should see the latest restored, and your new release candidate as beta (e.g. 1.9.0-rc.0 is beta and 1.8.4 was last stable version)

```console
$ npm dist-tag ls @cloudflare/kv-asset-handler
beta: 1.9.0-rc.0
latest: 1.8.4
```
