#!/bin/bash

RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[1;33m'
NC=$'\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }

# Prevent script execution as root directly; it handles sudo internally where needed
if [ "$EUID" -eq 0 ]; then
    error "Please run this script as your regular user (WITHOUT sudo)."
    exit 1
fi

# Exit immediately if any command fails
set -e

# 1. System Variables
TARGET_USER="$USER"
USER_HOME="$HOME"
GDM_CONFIG="/etc/gdm3/custom.conf"

info "=== Configuring Native OBS Auto-login, Lock, and RDP Mirroring ==="

# Prompt for passwords (not stored in script)
echo "Your login password is needed to unlock the GNOME keyring on boot."
echo "This allows gnome-remote-desktop to read RDP credentials after auto-login."
read -s -p "Enter your login (keyring) password: " KEYRING_PASSWORD
echo
if [ -z "$KEYRING_PASSWORD" ]; then
    error "Keyring password cannot be empty."
    exit 1
fi

read -s -p "Enter RDP password (for remote desktop clients): " RDP_PASSWORD
echo
if [ -z "$RDP_PASSWORD" ]; then
    error "RDP password cannot be empty."
    exit 1
fi

# 2. Configure GDM3 Auto-Login and Disable Wayland (force X11)
info "Configuring GDM automatic login..."
if [ -f "$GDM_CONFIG" ]; then
    sudo sed -i 's/^#\s*AutomaticLoginEnable.*/AutomaticLoginEnable=true/' "$GDM_CONFIG"
    sudo sed -i 's/^AutomaticLoginEnable.*/AutomaticLoginEnable=true/' "$GDM_CONFIG"
    sudo sed -i "s/^#\s*AutomaticLogin\s*=.*/AutomaticLogin=$TARGET_USER/" "$GDM_CONFIG"
    sudo sed -i "s/^AutomaticLogin\s*=.*/AutomaticLogin=$TARGET_USER/" "$GDM_CONFIG"

    # Disable Wayland to force X11 session (required for reliable OBS and RDP mirroring)
    info "Disabling Wayland (forcing X11)..."
    sudo sed -i 's/^#\s*WaylandEnable.*/WaylandEnable=false/' "$GDM_CONFIG"
    sudo sed -i 's/^WaylandEnable.*/WaylandEnable=false/' "$GDM_CONFIG"
else
    error "GDM3 configuration file not found at $GDM_CONFIG" && exit 1
fi

# 3. Configure keyring auto-unlock on boot
# GDM auto-login does not supply a password to PAM, so the GNOME keyring stays locked.
# gnome-remote-desktop stores RDP credentials in the keyring, so it must be unlocked
# before the RDP service starts. This systemd user service handles that.
#
# The keyring password is stored in a file with 600 permissions (readable only by the user).
# This is the same security posture as auto-login itself — anyone with user-level access
# already has full session access. The file prevents the empty-password keyring corruption
# bug seen in recent Ubuntu versions.
info "Setting up keyring auto-unlock service..."

KEYRING_PASS_FILE="$USER_HOME/.keyring_pass"
printf '%s' "$KEYRING_PASSWORD" > "$KEYRING_PASS_FILE"
chmod 600 "$KEYRING_PASS_FILE"

UNLOCK_SCRIPT="$USER_HOME/.config/unlock-keyring.sh"
mkdir -p "$USER_HOME/.config"
tee "$UNLOCK_SCRIPT" > /dev/null << 'UNLOCK_EOF'
#!/bin/bash
export DISPLAY=:0
export XDG_RUNTIME_DIR="/run/user/$(id -u)"

password=$(<"$HOME/.keyring_pass")
echo -n "$password" | /usr/bin/gnome-keyring-daemon --replace --unlock --components=pkcs11,secrets
UNLOCK_EOF
chmod +x "$UNLOCK_SCRIPT"

mkdir -p "$USER_HOME/.config/systemd/user"
tee "$USER_HOME/.config/systemd/user/unlock-keyring.service" > /dev/null << EOF
[Unit]
Description=Unlock GNOME Keyring on boot (for RDP credentials)
After=graphical-session.target
Before=gnome-remote-desktop.service

[Service]
Type=oneshot
ExecStart=$USER_HOME/.config/unlock-keyring.sh
RemainAfterExit=true
Environment=DISPLAY=:0
Environment=XDG_RUNTIME_DIR=/run/user/$(id -u)

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable unlock-keyring.service

# Unlock the keyring NOW so that grdctl can store credentials in this session
info "Unlocking keyring for current session..."
echo -n "$KEYRING_PASSWORD" | /usr/bin/gnome-keyring-daemon --replace --unlock --components=pkcs11,secrets > /dev/null 2>&1 || true
# Restart gnome-remote-desktop so it picks up the unlocked keyring
systemctl --user restart gnome-remote-desktop.service
sleep 1

# 4. Load v4l2loopback at boot (required for OBS virtual camera without auth prompt)
# OBS flatpak tries to modprobe v4l2loopback when starting the virtual camera, which
# requires root privileges and triggers a polkit auth dialog. Pre-loading the module
# at boot eliminates the prompt entirely.
info "Configuring v4l2loopback to load at boot..."
sudo tee /etc/modules-load.d/v4l2loopback.conf > /dev/null << EOF
v4l2loopback
EOF
sudo tee /etc/modprobe.d/v4l2loopback.conf > /dev/null << EOF
options v4l2loopback exclusive_caps=1 card_label="OBS Virtual Camera"
EOF

# 5. Configure RDP Desktop Sharing
info "Configuring GNOME RDP for Desktop Sharing Mode..."
gsettings set org.gnome.desktop.remote-desktop.rdp screen-share-mode 'mirror-primary'

grdctl rdp enable
grdctl rdp disable-view-only
grdctl rdp set-credentials "$TARGET_USER" "$RDP_PASSWORD"

# Verify credentials were stored
info "Verifying RDP credentials..."
STATUS=$(grdctl status 2>&1)
if echo "$STATUS" | grep -q "Username: (empty)\|Username: (null)"; then
    error "RDP credentials failed to persist. The keyring may not have unlocked."
    error "Try changing your login keyring password to match your login password,"
    error "then run this script again."
    exit 1
fi
info "RDP credentials stored successfully."

# 6. Create an optimized Display-Safe OBS Launch Wrapper
mkdir -p "$USER_HOME/.config/autostart"
AUTOSTART_SCRIPT="$USER_HOME/.config/obs_boot_wrapper.sh"

info "Creating display-wait launch wrapper..."
tee "$AUTOSTART_SCRIPT" > /dev/null << 'WRAPPER_EOF'
#!/bin/bash
# Wait for X11 display to be available (Wayland is disabled)
for i in {1..30}; do
    if [ -n "$DISPLAY" ]; then
        break
    fi
    sleep 1
done

# Remove .sentinel folder to prevent the "OBS didn't shut down properly" safe mode prompt.
# OBS 32.0+ removed --disable-shutdown-check; deleting .sentinel is the supported workaround.
rm -rf "$HOME/.var/app/com.obsproject.Studio/config/obs-studio/.sentinel"

# Launch OBS with virtual camera, minimized to system tray
flatpak run com.obsproject.Studio --startvirtualcam --unattended &

# Delay allows graphical elements to bind before triggering session lock
sleep 3
dbus-send --type=method_call --dest=org.gnome.ScreenSaver /org/gnome/ScreenSaver org.gnome.ScreenSaver.Lock
WRAPPER_EOF

chmod +x "$AUTOSTART_SCRIPT"

# 7. Generate the Graphical XDG Desktop Trigger
AUTOSTART_FILE="$USER_HOME/.config/autostart/obs-lock.desktop"
tee "$AUTOSTART_FILE" > /dev/null << DESKTOP_EOF
[Desktop Entry]
Type=Application
Name=OBS Autostart Wrapper
Exec=$AUTOSTART_SCRIPT
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
DESKTOP_EOF

# Restart the RDP service one final time to pick up all config
systemctl --user restart gnome-remote-desktop.service

info "=== Setup Complete ==="
info ""
info "What was configured:"
info "  • GDM auto-login as '$TARGET_USER' (X11, Wayland disabled)"
info "  • Keyring auto-unlock on boot (credentials in ~/.keyring_pass)"
info "  • RDP desktop sharing (mirror-primary mode)"
info "  • OBS auto-start with virtual camera + screen lock"
info "  • v4l2loopback loaded at boot (no auth prompt for virtual camera)"
info ""
info "Run 'sudo reboot' to verify the full boot sequence."
