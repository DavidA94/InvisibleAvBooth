#!/usr/bin/env bash

RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[1;33m'
NC=$'\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }

ENV_FILE="./packages/backend/.env"
EXAMPLE_FILE="./packages/backend/.env.example"

# Loop until a valid choice (Y/N) is made
while true; do
    read -p "${GREEN}Do you want to generate a device secret key? (Y/N): ${NC}" response
    case "$response" in
        [Yy]* ) break;;
        [Nn]* ) info "Skipped key generation."; exit 0;;
        * ) error "Invalid selection. Please answer Y or N.";;
    esac
done

# Check if .env file already exists
if [ -f "$ENV_FILE" ]; then
    # Check if DEVICE_SECRET_KEY already has a value assigned
    # It looks for lines like DEVICE_SECRET_KEY=something (not blank)
    EXISTING_KEY=$(grep -E "^DEVICE_SECRET_KEY=[A-Za-z0-9]+" "$ENV_FILE")

    if [ -n "$EXISTING_KEY" ]; then
        while true; do
            read -p "${YELLOW}A DEVICE_SECRET_KEY already exists. Overwrite it? (Y/N): ${NC}" overwrite
            case "$overwrite" in
                [Yy]* ) break;;
                [Nn]* ) info "Operation cancelled. Key not changed."; exit 0;;
                * ) error "Invalid selection. Please answer Y or N.";;
            esac
        done
    fi
else
    # Copy from example template if the .env file does not exist at all
    if [ -f "$EXAMPLE_FILE" ]; then
        cp "$EXAMPLE_FILE" "$ENV_FILE"
    else
        # Fallback: create an empty file if the example template is missing
        touch "$ENV_FILE"
    fi
fi

# Generate the 32-byte secret key using Node.js
SECRET_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# Check if the DEVICE_SECRET_KEY line exists in the file (even if blank)
if grep -q "^DEVICE_SECRET_KEY=" "$ENV_FILE"; then
    # Update the existing line (Compatible with both Linux and macOS sed)
    if sed --version >/dev/null 2>&1; then
        sed -i "s/^DEVICE_SECRET_KEY=.*/DEVICE_SECRET_KEY=$SECRET_KEY/" "$ENV_FILE"
    else
        sed -i '' "s/^DEVICE_SECRET_KEY=.*/DEVICE_SECRET_KEY=$SECRET_KEY/" "$ENV_FILE"
    fi
else
    # Append the variable to the end of the file if the line was missing entirely
    echo "" >> "$ENV_FILE"
    echo "DEVICE_SECRET_KEY=$SECRET_KEY" >> "$ENV_FILE"
fi

info "Device secret key successfully saved to $ENV_FILE"
