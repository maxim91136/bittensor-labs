#!/bin/bash
# Release script - reads VERSION and updates README, creates tag + release

set -e

VERSION=$(cat VERSION | tr -d '\n')
TAG="v$VERSION"

echo "📦 Releasing $TAG..."

# Update README with version from VERSION file
sed -i '' "s/\*\*Latest release:\*\* \`v[^\`]*\`/**Latest release:** \`$TAG\`/" README.md

# Check if there are changes
if git diff --quiet README.md; then
  echo "✓ README already up to date"
else
  git add README.md
  git commit -m "docs: Update version to $TAG"
  echo "✓ README updated"
fi

# Push changes
git push

# Create and push tag
if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "⚠ Tag $TAG already exists"
else
  git tag "$TAG"
  git push origin "$TAG"
  echo "✓ Tag $TAG created"
fi

# Get commits since last tag for release notes
PREV_TAG=$(git tag --sort=-version:refname | grep -v "^$TAG$" | head -1)
COMMITS=$(git log "$PREV_TAG".."$TAG" --oneline 2>/dev/null || git log --oneline -10)

# Create GitHub release
gh release create "$TAG" --title "$TAG" --notes "## Changes in $TAG

$COMMITS
" 2>/dev/null || echo "⚠ Release already exists or gh not available"

echo "✅ Released $TAG"
