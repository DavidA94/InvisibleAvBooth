import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import Select from "react-select";
import { darkSelectStyles } from "../../theme/selectStyles";
import { WidgetContainer } from "../WidgetContainer";
import type { ConnectionStatus } from "../WidgetContainer";
import { WidgetErrorOverlay } from "../WidgetErrorOverlay";
import { useStore } from "../../store";
import { useSocket } from "../../providers/SocketProvider";
import { useResizeObserver } from "../../hooks/useResizeObserver";
import { logger } from "../../logger";
import { CTS_MIXER_SET, CTS_MIXER_PRESET_ACTIVATE, CTS_MIXER_WIDGET_PRESENT, CONTROLS_FRESHNESS_MS, PRESET_ACK_TIMEOUT_MS } from "@invisible-av-booth/shared";
import type { MixerChannelState } from "@invisible-av-booth/shared";

interface StripHandlers {
  onFaderChange: (fader: number) => void;
  onMuteToggle: (muted: boolean) => void;
  onGainChange: (gainDb: number) => void;
}
import { ChannelStrip } from "./ChannelStrip";
import { PresetsArea } from "./PresetsArea";
import { computePaginationLayout, channelsForPage, rangeLabel } from "./pagination";
import {
  TEST_ID_SOUNDBOARD_WIDGET,
  TEST_ID_SOUNDBOARD_MIXER_SELECT,
  TEST_ID_SOUNDBOARD_STRIP_ROW,
  TEST_ID_SOUNDBOARD_EMPTY_PLACEHOLDER,
  TEST_ID_MIXER_PAGINATION,
  TEST_ID_MIXER_PAGINATION_PREV,
  TEST_ID_MIXER_PAGINATION_NEXT,
} from "../../constants/testIds";
import "./SoundBoard.css";

/**
 * Derive the "Controls" indicator status (Req 12). Red when the mixer is
 * offline; otherwise green when fresh control state has arrived within
 * CONTROLS_FRESHNESS_MS, red when stale.
 */
export function deriveControlsStatus(connected: boolean, stateFresh: boolean): ConnectionStatus["status"] {
  if (!connected) return "unhealthy";
  return stateFresh ? "healthy" : "unhealthy";
}

interface SoundBoardWidgetProps {
  /** When false, the widget suppresses its socket activity (widget-present / metering). */
  enabled?: boolean;
  /** Force selection of a specific mixer (used in the admin preset-authoring modal). */
  forceSelectedId?: string;
}

export function SoundBoardWidget({ enabled = true, forceSelectedId }: SoundBoardWidgetProps = {}): ReactNode {
  const mixerStates = useStore((s) => s.mixerStates);
  const pendingPresetIds = useStore((s) => s.pendingPresetIds);
  const socket = useSocket();

  const containerRef = useRef<HTMLDivElement>(null);
  const width = useResizeObserver(containerRef);

  const mixers = useMemo(() => Object.values(mixerStates), [mixerStates]);
  const [selectedId, setSelectedId] = useState<string>(forceSelectedId ?? "");
  useEffect(() => {
    if (forceSelectedId) setSelectedId(forceSelectedId);
    else if (!selectedId && mixers.length > 0) setSelectedId(mixers[0]!.mixerId);
  }, [mixers, selectedId, forceSelectedId]);

  const state = selectedId ? (mixerStates[selectedId] ?? null) : (mixers[0] ?? null);
  const mixerId = state?.mixerId ?? "";

  // Widget-presence lifecycle (Req 12.4): tell the backend which mixer is shown.
  // The backend tracks presence PER CONNECTION and clears it on disconnect, so we
  // must (re)send on every socket "connect" — not just on mount. socket.io reuses
  // the same Socket instance across reconnects, so a mount-only emit would be lost
  // after a backend restart/reconnect and metering would never re-enable until a
  // full page refresh (observed in the field). Re-emitting on "connect" makes the
  // meter recover automatically like the rest of the state.
  useEffect(() => {
    if (!enabled || !socket || !mixerId) return;
    const announcePresent = (): void => {
      socket.emit(CTS_MIXER_WIDGET_PRESENT, { mixerId, present: true });
    };
    announcePresent(); // in case we're already connected
    socket.on("connect", announcePresent);
    return () => {
      socket.off("connect", announcePresent);
      socket.emit(CTS_MIXER_WIDGET_PRESENT, { mixerId, present: false });
    };
  }, [enabled, socket, mixerId]);

  // Controls freshness: driven by control STATE changes only. Level frames must
  // NOT re-render this widget at all — each strip's MixerChannelMeter subscribes
  // to its own level (measured: widget-level meter subscription re-rendered all
  // 16 strips ~12×/s and starved the main thread on tablet-class CPUs).
  const [stateFresh, setStateFresh] = useState(false);
  useEffect(() => {
    if (!state) return;
    setStateFresh(true);
    const timer = setTimeout(() => setStateFresh(false), CONTROLS_FRESHNESS_MS);
    return () => clearTimeout(timer);
  }, [state]);

  // Pagination.
  const channelCount = state?.channelCount ?? 0;
  const layout = computePaginationLayout(width, channelCount);
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [mixerId, layout.perPage]);
  const visibleChannels = layout.paginated ? channelsForPage(page, layout.perPage, channelCount) : channelsForPage(0, channelCount || 1, channelCount);

  const emitSet = (channel: number, fields: { fader?: number; muted?: boolean; gainDb?: number }): void => {
    if (socket && mixerId) socket.emit(CTS_MIXER_SET, { mixerId, channel, ...fields });
  };

  // STABLE per-channel handlers so memoized ChannelStrips don't re-render just
  // because the parent created new arrow functions. They call through a ref to
  // the latest emitSet, so a socket/mixer change is still picked up (no stale
  // closure). Measured: re-rendering all 16 strips on every state broadcast was a
  // ~390 ms main-thread task on a tablet-class (6× throttled) CPU.
  const emitSetRef = useRef(emitSet);
  emitSetRef.current = emitSet;
  const handlerCache = useRef(new Map<number, StripHandlers>());
  const handlersFor = (index: number): StripHandlers => {
    let handlers = handlerCache.current.get(index);
    if (!handlers) {
      handlers = {
        onFaderChange: (fader) => emitSetRef.current(index, { fader }),
        onMuteToggle: (muted) => emitSetRef.current(index, { muted }),
        onGainChange: (gainDb) => emitSetRef.current(index, { gainDb }),
      };
      handlerCache.current.set(index, handlers);
    }
    return handlers;
  };

  const connected = state?.connected ?? false;
  const connections: ConnectionStatus[] = [{ label: "Controls", status: deriveControlsStatus(connected, stateFresh) }];

  const channelByIndex = (index: number): MixerChannelState | undefined => state?.channels.find((c) => c.channel === index);

  const mixerOptions = mixers.map((m) => ({ value: m.mixerId, label: m.mixerId }));
  const selectedOption = mixerOptions.find((o) => o.value === mixerId) ?? null;

  return (
    <div data-testid={TEST_ID_SOUNDBOARD_WIDGET} data-status={connected ? "online" : "offline"} ref={containerRef} className="full-height">
      <WidgetContainer title="Sound Board" connections={connections}>
        <WidgetErrorOverlay isVisible={!connected} message="Mixer offline" actionLabel="" isPending={false}>
          <div className="soundboard-widget">
            {!forceSelectedId && mixers.length > 1 && (
              <div className="soundboard-mixer-select">
                <Select
                  data-testid={TEST_ID_SOUNDBOARD_MIXER_SELECT}
                  options={mixerOptions}
                  value={selectedOption}
                  onChange={(opt) => opt && setSelectedId((opt as { value: string }).value)}
                  isSearchable={false}
                  styles={darkSelectStyles()}
                  menuPortalTarget={document.body}
                />
              </div>
            )}

            {channelCount === 0 ? (
              <div className="soundboard-empty" data-testid={TEST_ID_SOUNDBOARD_EMPTY_PLACEHOLDER}>
                No channels configured.
              </div>
            ) : (
              <div className="soundboard-strip-row" data-testid={TEST_ID_SOUNDBOARD_STRIP_ROW}>
                {(() => {
                  // If ANY visible channel has a name, reserve the name row on every
                  // strip so the controls stay vertically aligned across the page.
                  const anyNameOnPage = visibleChannels.some((index) => (channelByIndex(index)?.name ?? "").trim().length > 0);
                  return visibleChannels.map((index) => {
                    const channel = channelByIndex(index);
                    if (!channel) return null;
                    return (
                      <ChannelStrip
                        key={index}
                        channel={channel}
                        features={state!.capabilities.features}
                        gainMinDb={state!.capabilities.gainRange.minDb}
                        gainMaxDb={state!.capabilities.gainRange.maxDb}
                        mixerId={mixerId}
                        faderUnreconciled={channel.unreconciled ?? false}
                        showNameRow={anyNameOnPage}
                        {...handlersFor(index)}
                      />
                    );
                  });
                })()}

                {layout.paginated && (
                  <div className="mixer-pagination" data-testid={TEST_ID_MIXER_PAGINATION}>
                    {/* Top half: the NEXT-range button anchored to its BOTTOM, so it sits
                        just above the center line. Empty (reserved) on the last page. */}
                    <div className="mixer-pagination-slot mixer-pagination-slot-top">
                      {page < layout.pageCount - 1 && (
                        <button
                          type="button"
                          className="mixer-preset-button mixer-pagination-button"
                          data-testid={TEST_ID_MIXER_PAGINATION_NEXT}
                          onClick={() => setPage((p) => Math.min(layout.pageCount - 1, p + 1))}
                        >
                          <span aria-hidden="true">▶</span> {rangeLabel(page + 1, layout.perPage, channelCount)}
                        </button>
                      )}
                    </div>
                    {/* Bottom half: the PREVIOUS-range button anchored to its TOP, so it sits
                        just below the center line. Empty (reserved) on the first page. */}
                    <div className="mixer-pagination-slot mixer-pagination-slot-bottom">
                      {page > 0 && (
                        <button
                          type="button"
                          className="mixer-preset-button mixer-pagination-button"
                          data-testid={TEST_ID_MIXER_PAGINATION_PREV}
                          onClick={() => setPage((p) => Math.max(0, p - 1))}
                        >
                          <span aria-hidden="true">◀</span> {rangeLabel(page - 1, layout.perPage, channelCount)}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {state && (
              <PresetsArea
                presets={state.presets}
                pendingPresetIds={pendingPresetIds}
                onActivate={(presetId) => {
                  if (!socket || !mixerId) return;
                  // No optimistic toast: mark the button pending and let the
                  // backend ack (STC_MIXER_PRESET_RESULT) drive the toast once the
                  // preset is actually applied + verified on the board.
                  useStore.getState().markPresetPending(presetId);
                  socket.emit(CTS_MIXER_PRESET_ACTIVATE, { mixerId, presetId });
                  // A lost ack must never leave the button spinning: if the
                  // backend has not answered in time, release it and say so.
                  setTimeout(() => {
                    const store = useStore.getState();
                    if (!store.pendingPresetIds.includes(presetId)) return; // ack already arrived
                    logger.warn("Preset ack timed out", { context: { mixerId, presetId, timeoutMs: PRESET_ACK_TIMEOUT_MS } });
                    store.clearPresetPending(presetId);
                    store.addNotification({
                      id: `preset-${presetId}-${Date.now()}`,
                      level: "toast",
                      severity: "error",
                      message: "No response from the sound board — check the preset was applied",
                    });
                  }, PRESET_ACK_TIMEOUT_MS);
                }}
              />
            )}
          </div>
        </WidgetErrorOverlay>
      </WidgetContainer>
    </div>
  );
}
