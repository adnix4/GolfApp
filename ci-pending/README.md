# Pending CI changes

Workflow changes that are written and verified but could not be pushed,
because pushing anything under `.github/workflows/` needs a GitHub token with
the `workflow` scope and the one currently in use has only `gist, read:org,
repo`.

Keep a patch here rather than losing the work, then apply it once the token
can carry it. Delete the patch after it lands.

## sdk-pin-integrity-job.patch

Adds an `SDK Pin Integrity` job to `.github/workflows/ci.yml` and wires it into
the `all-checks-passed` aggregator, so a pin failure actually blocks a merge.

The job runs `npm run check-updates -- --assert-pins`, which fails when a
manifest pin or an installed version has drifted from the version Expo SDK 57
targets (fetched live from api.expo.dev) or from the Node / React version this
repo runs. It needs no `npm ci` — it reads only the lockfile and the manifests
— so it finishes in about a second.

This exists because the weekly dependency routine twice bumped an SDK-managed
package to npm's `latest`: react-native 0.87 in PR #40 and react 19.3.0 in
PR #64. Both passed lint, type-check and tests, because no peer range in the
tree is tight enough to catch it — react-native's peer is `react ^19.2.0`,
which accepts 19.9.0 quite happily. Only an explicit check catches it.

### Applying it

    gh auth refresh -s workflow --hostname github.com   # needs a real TTY
    git apply ci-pending/sdk-pin-integrity-job.patch
    git add .github/workflows/ci.yml
    git commit -m "ci: add SDK pin integrity gate"
    git push

The patch is against `.github/workflows/ci.yml` at commit 4498ac6. If that file
has since changed around the `dependency-audit` job or the `all-checks-passed`
`needs:` list, `git apply` will reject it — the change is small enough to
re-apply by hand: a new job plus two edits to the aggregator.
