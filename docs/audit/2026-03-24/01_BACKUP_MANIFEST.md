# Mobile Full Rollback Backup Manifest

Generated: 2026-03-24 (America/New_York)
Repo: `/Users/jeffreynewell/Documents/TrussCTR-Mobile-1.0`

## Snapshot

- Backup directory: `/Users/jeffreynewell/Documents/TrussCTR-Mobile-1.0/backups/full-rollback-20260324-212239`
- Branch: `main`
- HEAD SHA: `d4a04a8ba2730395e93e958c40227e3e46611084`

## Included Artifacts

- `repo-all-refs.bundle`
- `workspace-full-snapshot.tar.gz`
- `git-status.txt`, `git-status-porcelain.txt`
- `git-log-last-100.txt`
- `git-remotes.txt`
- `uncommitted.diff`
- `staged.diff`
- `untracked-files.txt`
- `SHA256SUMS.txt`

## Integrity Verification

- `repo-all-refs.bundle: OK`
- `workspace-full-snapshot.tar.gz: OK`

## Restore Commands

Full snapshot restore:

```bash
cd /path/restore-target
mkdir -p TrussCTR-Mobile-1.0-restore
cd TrussCTR-Mobile-1.0-restore
tar -xzf /Users/jeffreynewell/Documents/TrussCTR-Mobile-1.0/backups/full-rollback-20260324-212239/workspace-full-snapshot.tar.gz
```

Git-history restore:

```bash
cd /path/restore-target
git clone /Users/jeffreynewell/Documents/TrussCTR-Mobile-1.0/backups/full-rollback-20260324-212239/repo-all-refs.bundle TrussCTR-Mobile-1.0-git-restore
```

Re-apply uncommitted delta to restored clone:

```bash
cd TrussCTR-Mobile-1.0-git-restore
git apply /Users/jeffreynewell/Documents/TrussCTR-Mobile-1.0/backups/full-rollback-20260324-212239/uncommitted.diff
```
