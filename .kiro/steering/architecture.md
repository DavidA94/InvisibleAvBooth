---
inclusion: always
---

# Church Livestream Control System — Steering Document

## 1. Scope
The system provides **modular control of livestream operations** for a church environment.

### Initial Release Responsibilities
- **Camera Control:** Manual PTZ control, presets for framing, tap-to-center behavior.  
- **Audio Control:** Mixer volume, mute/unmute, and monitoring.  
- **OBS Control:** Start/stop recording, start/stop streaming, scene changes if needed.  
- **Text Overlays:** Lower-thirds, speaker names, Bible verses, lyrics, etc., controllable via a web interface.

### Notes
- Presets may affect multiple devices simultaneously; presets are applied as starting points, not tracked as ongoing system states.  
- Auto-camera switching and multi-user dashboards are out of scope for the initial release but should be supported in future extensible design.  
- Devices are configured statically; automatic device discovery is not required.

---

## 2. Core Concepts & Responsibilities

### Modular Plugin Architecture
- Each device or device group is controlled by its own plugin/widget.  
- Widgets communicate with the backend, which handles device APIs and state management.  
- Widgets can control multiple devices, but should not override one another; multiple effects from a preset or manual adjustment are permitted.

### Backend as Authority
- All commands flow through the backend for authentication, error handling, and state management.  
- For devices that **cannot be polled**, the backend maintains authoritative state to ensure continuity across clients (e.g., if a tablet changes).
- Each hardware or software integration must have a single backend abstraction layer responsible for all communication with that device or system.  
- No widget, preset, or feature may communicate with a device directly; all interactions must go through the appropriate backend abstraction.  
- This abstraction layer is responsible for:
  - Device communication
  - State reconciliation (polling vs. commanded state)
  - Error handling and reporting
- This constraint ensures consistency, prevents duplicated logic, and avoids conflicting commands to the same device.

### Widget-Centric State Visibility
- Each widget displays the real-time status of the device(s) it controls.  
- Manual adjustments immediately reflect on the widget; presets are applied but not tracked as ongoing system states.

---

## 3. Interfaces & Boundaries
- **Frontend ↔ Backend:** JSON-based commands and status updates; backend mediates all device communication.  
- **Backend ↔ Devices:** Handles all network/API calls to devices and reconciling reported states.  
- **Widget Responsibilities:**  
  - Display device state and updates.  
  - Communicate errors or alerts to the frontend.  
  - Respect device capabilities (grey out unavailable controls).

---

## 4. Failure Modes & Handling

### Notification Channels
1. **Toast Notifications:** Short-lived messages (~5s).  
2. **Warning/Error Banners:** Persistent messages that can display multiple errors (“Error 1 of X”), dismissable by the user.  
3. **Catastrophic Errors:** Modals, which can be auto-cleared by the widget if resolved.

### Error Sources
- Device offline  
- Command failure  
- OBS failure

### Recovery
- Widgets should poll device states where possible.  
- Backend maintains persistent state for non-pollable devices to ensure consistency.  
- Users are informed when errors resolve automatically.

---

## 5. Performance & Feedback
- Adjustments should propagate **as soon as possible** to widgets.  
- **Optimistic UI updates** are acceptable where feasible, but backend reconciliation ensures accuracy.  
- Boolean operations (start/stop recording or streaming) should show pending state until confirmation from the backend.  
- Polling ensures device connectivity and reflects any changes in real time.

---

## 6. Extensibility Considerations
- New device types or protocols can be added via additional widgets/plugins without requiring UI redesign.  
- System design should not preclude multi-dashboard or multi-user operation in the future.  
- Persistent backend state allows client continuity across tablets or devices when polling is unavailable.