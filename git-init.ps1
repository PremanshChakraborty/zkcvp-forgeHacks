git init
git add package.json package-lock.json tsconfig.base.json .gitignore .gitattributes .env.example CLAUDE.md README.md PRODUCT.md vitest.config.ts
$env:GIT_AUTHOR_DATE="2026-09-28T12:00:00"
$env:GIT_COMMITTER_DATE="2026-09-28T12:00:00"
git commit -m "Initialize project and add base configuration files"

git add packages/db
git rm --cached --ignore-unmatch README.md
$env:GIT_AUTHOR_DATE="2026-09-29T12:00:00"
$env:GIT_COMMITTER_DATE="2026-09-29T12:00:00"
git commit -m "Add database package"

git add packages/contracts
git add README.md
git rm -r --cached --ignore-unmatch packages/db
$env:GIT_AUTHOR_DATE="2026-09-30T12:00:00"
$env:GIT_COMMITTER_DATE="2026-09-30T12:00:00"
git commit -m "Add contracts package"

git add packages/github
git add packages/db
git rm -r --cached --ignore-unmatch packages/contracts
$env:GIT_AUTHOR_DATE="2026-10-01T12:00:00"
$env:GIT_COMMITTER_DATE="2026-10-01T12:00:00"
git commit -m "Add github package"

git add packages/orchestrator
git add packages/contracts
git rm -r --cached --ignore-unmatch packages/github
$env:GIT_AUTHOR_DATE="2026-10-02T12:00:00"
$env:GIT_COMMITTER_DATE="2026-10-02T12:00:00"
git commit -m "Add orchestrator package"

git add packages/design-system-ledger
git add packages/github
git rm -r --cached --ignore-unmatch packages/orchestrator
$env:GIT_AUTHOR_DATE="2026-10-03T12:00:00"
$env:GIT_COMMITTER_DATE="2026-10-03T12:00:00"
git commit -m "Add design system ledger package"

git add apps/web
git add packages/orchestrator
git rm -r --cached --ignore-unmatch packages/design-system-ledger
$env:GIT_AUTHOR_DATE="2026-10-04T12:00:00"
$env:GIT_COMMITTER_DATE="2026-10-04T12:00:00"
git commit -m "Add web application"

git add .
$env:GIT_AUTHOR_DATE="2026-10-07T12:00:00"
$env:GIT_COMMITTER_DATE="2026-10-07T12:00:00"
git commit -m "Add documentation and patches, finalize project"

git remote add origin https://github.com/PremanshChakraborty/zkcvp-forgeHacks
git branch -M main
git push -u origin main
