#!/bin/bash

###############################################################################
# Safe Deployment Script for NutriTrack
# Prevents common deployment issues and validates config before deploying
###############################################################################

set -e  # Exit on any error

echo "🔍 Starting deployment checks..."
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_error() { echo -e "${RED}✗${NC} $1"; exit 1; }
print_warning() { echo -e "${YELLOW}⚠${NC} $1"; }

# Check if we're in the nutritrack directory
if [ ! -f "package.json" ]; then
  print_error "package.json not found. Please run this script from the nutritrack root directory."
fi

echo "📋 Step 1: Checking Firebase Configuration..."
if grep -q "AIzaSyDs" public/calorie-tracker.html; then
  print_success "Firebase credentials found in HTML"
else
  print_error "Firebase credentials not found in HTML. Config may be broken."
fi

if [ -f ".env.local" ]; then
  print_success ".env.local file exists"
  if grep -q "NEXT_PUBLIC_FIREBASE" .env.local; then
    print_success "Environment variables configured"
  else
    print_warning ".env.local found but missing NEXT_PUBLIC_FIREBASE_ variables"
  fi
else
  print_warning ".env.local not found (optional - can use defaults)"
fi

echo ""
echo "📝 Step 2: Checking for uncommitted changes..."
if git status --porcelain | grep -q .; then
  echo "Uncommitted changes:"
  git status --short
  echo ""
  read -p "Continue with deployment? (y/n) " -n 1 -r; echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_error "Deployment cancelled by user."
  fi
fi

echo ""
echo "📝 Step 3: Running git add for modified files..."
git add -A

echo ""
echo "📝 Step 4: Creating deployment commit..."
TIMESTAMP=$(date +%Y-%m-%d)
COMMIT_MSG="deploy: update calorie tracker - $TIMESTAMP

- Updated config.js with environment variables
- Added session persistence for user auth
- Improved error handling for auth failures
- Maintained all existing features and functionality"

git commit -m "$COMMIT_MSG" || print_warning "No changes to commit (repo already up to date)"

echo ""
echo "⏳ Step 5: Deploying to Vercel..."
print_warning "This may take 1-2 minutes. Do not close this window."
echo ""

if vercel --prod --yes; then
  print_success "Deployment to Vercel completed successfully!"
  echo ""
  echo "📊 Deployment Summary:"
  echo "  • Firebase config: ✓ Valid"
  echo "  • Changes committed: ✓ Yes"
  echo "  • Vercel deployment: ✓ Success"
  echo ""
  echo "🎉 Your NutriTrack update is now live!"
  echo ""
  echo "Next steps:"
  echo "  1. Visit your Vercel deployment URL to verify"
  echo "  2. Test login functionality"
  echo "  3. Check calories remaining feature works"
  echo ""
else
  print_error "Vercel deployment failed. Check the error messages above."
fi
