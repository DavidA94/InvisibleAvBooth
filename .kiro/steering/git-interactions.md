When commiting code, always, as the last line, note that you (Kiro) were the author, and guided by me (David). The line should be "Written by Kiro, Guided by David"

Before you commit anything, run `npm run ci` from the repo root. This runs lint, format check, build, and test:coverage in sequence. All must pass. Redirect output to a file and only read the last few lines. Only read the full file if you need to understand a failure.

To commit, `npm run ci` must pass with zero failures. Note that we are in a mono-repo, and all checks run across all packages.

After commiting, unless instructed otherwise, you should push upstream.

Mark completed tasks in tasks.md BEFORE committing, not after.
