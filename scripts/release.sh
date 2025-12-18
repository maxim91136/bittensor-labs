#!/bin/bash
# Release script - reads VERSION and updates README, creates tag + release
# Strict mode: fails on missing dependencies

set -e

VERSION=$(cat VERSION | tr -d '\n')
TAG="v$VERSION"
TODAY=$(date +%Y-%m-%d)

echo "📦 Releasing $TAG..."
echo ""

# ===== DEPENDENCY CHECKS =====
ERRORS=0

# Check 1: gh CLI available
if ! command -v gh &> /dev/null; then
  echo "❌ MISSING: gh CLI not installed (brew install gh)"
  ERRORS=$((ERRORS + 1))
fi

# Check 2: CHANGELOG entry exists
if ! grep -q "## $TAG" CHANGELOG.md; then
  echo "❌ MISSING: CHANGELOG.md has no entry for $TAG"
  echo "   Add: ## $TAG ($(date +%Y-%m-%d))"
  ERRORS=$((ERRORS + 1))
fi

# Check 3: Tag doesn't already exist
if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "❌ CONFLICT: Tag $TAG already exists"
  ERRORS=$((ERRORS + 1))
fi

# Check 4: On main branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ]; then
  echo "❌ WRONG BRANCH: On '$CURRENT_BRANCH', should be 'main'"
  ERRORS=$((ERRORS + 1))
fi

# Check 5: No uncommitted changes (except VERSION/README/CHANGELOG)
DIRTY_FILES=$(git status --porcelain | grep -v "VERSION\|README.md\|CHANGELOG.md" | wc -l | tr -d ' ')
if [ "$DIRTY_FILES" != "0" ]; then
  echo "❌ DIRTY: Uncommitted changes detected"
  git status --porcelain | grep -v "VERSION\|README.md\|CHANGELOG.md"
  ERRORS=$((ERRORS + 1))
fi

# Abort if any errors
if [ "$ERRORS" -gt 0 ]; then
  echo ""
  echo "🛑 Release aborted: $ERRORS error(s) found"
  exit 1
fi

echo "✓ All dependency checks passed"
echo ""

# ===== RELEASE PROCESS =====

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
git tag "$TAG"
git push origin "$TAG"
echo "✓ Tag $TAG created"

# Get commits since last tag for release notes
PREV_TAG=$(git tag --sort=-version:refname | grep -v "^$TAG$" | head -1)
COMMITS=$(git log "$PREV_TAG".."$TAG" --oneline 2>/dev/null || git log --oneline -10)

# Create GitHub release
gh release create "$TAG" --title "$TAG" --latest --notes "## Changes in $TAG

$COMMITS
"

echo ""
echo "✅ Released $TAG"
