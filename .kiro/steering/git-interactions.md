When commiting code, always, as the last line, note that you (Kiro) were the author, and guided by me (David). The line should be "Written by Kiro, Guided by David"

Before you commit anything, the entire system needs to build. You should redirect all output to a file, and then only read the last few lines of the file, based on the build command. Only read the full file if you need to understand a failure. 

When a feature is complete that has integration tests, you should run the integration tests with the same methodology of piping to a file, and only reading the end of it. And only looking at more of the file if you need to investigate a failure.

To commit, all existing unit and integration tests must pass. Note that we are in a mono-repo, and tests should pass for the entire mono-repo.

After commiting, unless instructed otherwise, you should push upstream.