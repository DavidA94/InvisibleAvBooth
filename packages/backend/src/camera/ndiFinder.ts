/**
 * Shared NDI source finder.
 *
 * Consolidates NDI source discovery so that multiple consumers
 * (ObsNdiPreviewSource, CameraService) don't each spawn independent
 * finders — reducing network chatter and startup latency.
 */
import { getNdiModule, isNdiAvailable } from "./ndiLoader.js";
import { logger } from "../logger.js";

export interface NdiSource {
  name: string;
  [key: string]: unknown;
}

const FIND_TIMEOUT_MS = 3000;

/**
 * Discover NDI sources on the network.
 * Returns all visible sources. Callers filter by name.
 */
export async function findNdiSources(extraIPs?: string | null): Promise<NdiSource[]> {
  if (!isNdiAvailable()) return [];
  const ndi = getNdiModule();
  if (!ndi) return [];

  const mod = ndi.default ?? ndi;
  const findOpts: Record<string, unknown> = { showLocalSources: true };
  if (extraIPs) findOpts["extraIPs"] = extraIPs;

  const finder = await mod.find(findOpts);
  if (finder.wait) finder.wait(FIND_TIMEOUT_MS);
  const sources = finder.sources ? finder.sources() : finder;
  if (finder.destroy) finder.destroy();

  return Array.isArray(sources) ? sources : [];
}

/**
 * Find a specific NDI source by name, with retries.
 */
export async function findNdiSourceByName(
  sourceName: string,
  extraIPs?: string | null,
  maxAttempts = 3,
  retryDelayMs = 2000,
): Promise<NdiSource | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const sources = await findNdiSources(extraIPs);
    const match = sources.find((s) => s.name === sourceName);
    if (match) return match;
    logger.debug(`NDI source "${sourceName}" not found, retry ${attempt + 1}/${maxAttempts}`);
    if (attempt < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, retryDelayMs));
    }
  }
  return null;
}
