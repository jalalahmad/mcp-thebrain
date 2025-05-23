#!/bin/sh

# This script modifies the package.json of thebrain-api to make it compatible with CommonJS
# It should be run in the Docker container before starting the app

echo "Fixing ESM modules for thebrain-api..."

# Get the path to the thebrain-api package.json
PACKAGE_JSON_PATH="/app/node_modules/thebrain-api/package.json"

if [ -f "$PACKAGE_JSON_PATH" ]; then
  echo "Found package.json at $PACKAGE_JSON_PATH"
  
  # Create a backup
  cp "$PACKAGE_JSON_PATH" "${PACKAGE_JSON_PATH}.bak"
  
  # Update the package.json to use commonjs instead of module
  sed -i 's/"type": "module"/"type": "commonjs"/g' "$PACKAGE_JSON_PATH"
  
  echo "Modified thebrain-api package.json to use CommonJS"
else
  echo "Error: thebrain-api package.json not found at $PACKAGE_JSON_PATH"
  exit 1
fi

echo "ESM modules fixed successfully"