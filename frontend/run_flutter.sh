#!/bin/bash
# Wrapper to clean ._* AppleDouble files before flutter run
# Required because project is on external exFAT/non-APFS drive

set -e

FRONTEND_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Cleaning ._* files from Pods directories..."
find "$FRONTEND_DIR/ios/Pods" -name '._*' -delete 2>/dev/null || true
find "$FRONTEND_DIR/macos/Pods" -name '._*' -delete 2>/dev/null || true

# Ensure build output symlinks to internal APFS drive (avoids codesign ._* issues)
if [ ! -L "$FRONTEND_DIR/build/ios" ]; then
  mkdir -p ~/Library/Developer/Health-Tracker-ios-build
  rm -rf "$FRONTEND_DIR/build/ios"
  ln -s ~/Library/Developer/Health-Tracker-ios-build "$FRONTEND_DIR/build/ios"
  echo "Created iOS build symlink → internal drive"
fi

if [ ! -L "$FRONTEND_DIR/build/macos" ]; then
  mkdir -p ~/Library/Developer/Health-Tracker-macos-build
  rm -rf "$FRONTEND_DIR/build/macos"
  ln -s ~/Library/Developer/Health-Tracker-macos-build "$FRONTEND_DIR/build/macos"
  echo "Created macOS build symlink → internal drive"
fi

echo "Running: flutter run $*"
cd "$FRONTEND_DIR"
flutter run "$@"
