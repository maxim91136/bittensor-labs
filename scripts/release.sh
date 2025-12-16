#!/bin/bash
# Release script - reads VERSION and updates README, creates tag + release

set -e

VERSION=$(cat VERSION | tr -d '\n')
TAG="v$VERSION"
TODAY=$(date +%Y-%m-%d)

echo "📦 Releasing $TAG..."

# Check if CHANGELOG has entry for this version
if ! grep -q "## $TAG" CHANGELOG.md; then
  echo "⚠ WARNING: CHANGELOG.md has no entry for $TAG"
  echo "  Please add changelog entry before releasing!"
  read -p "  Continue anyway? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

# Update README with version from VERSION file
sed -i '' "s/\*\*Latest release:\*\* \`v[^\`]*\`/**Latest release:** \`$TAG\`/" README.md

# Check if there are changes to commit
CHANGED_FILES=""
if ! git diff --quiet README.md 2>/dev/null; then
  CHANGED_FILES="$CHANGED_FILES README.md"
fi
if ! git diff --quiet CHANGELOG.md 2>/dev/null; then
  CHANGED_FILES="$CHANGED_FILES CHANGELOG.md"
fi
if ! git diff --quiet VERSION 2>/dev/null; then
  CHANGED_FILES="$CHANGED_FILES VERSION"
fi

if [ -n "$CHANGED_FILES" ]; then
  git add $CHANGED_FILES
  git commit -m "docs: Update version to $TAG"
  echo "✓ Docs updated:$CHANGED_FILES"
else
  echo "✓ Docs already up to date"
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

# Create GitHub release (not pre-release, mark as latest)
gh release create "$TAG" --title "$TAG" --latest --notes "## Changes in $TAG

$COMMITS
" 2>/dev/null || echo "⚠ Release already exists or gh not available"

echo "✅ Released $TAG"
