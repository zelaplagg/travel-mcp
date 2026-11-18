import { config } from '../config.ts';
import { TtlCache } from '../lib/cache.ts';
import { ToolError } from '../lib/errors.ts';
import { fetchJson } from '../lib/http.ts';
import { MinIntervalLimiter } from '../lib/rateLimiter.ts';
import { cleanText } from '../lib/sanitize.ts';
import type { GeoResult, Geocoder } from '../types.ts';

interface NominatimItem {
  lat: string;
  lon: string;
  display_name: string;
  name?: string;
  address?: { country?: string };
}

export interface NominatimOptions {
  baseUrl?: string;
  limiter?: MinIntervalLimiter;
  cache?: TtlCache<GeoResult[]>;
}

/** Geocoding via OpenStreetMap Nominatim, following its usage policy (1 req/s, caching, own User-Agent). */
export class NominatimClient implements Geocoder {
  private readonly baseUrl: string;
  private readonly limiter: MinIntervalLimiter;
  private readonly cache: TtlCache<GeoResult[]>;

  constructor(options: NominatimOptions = {}) {
    this.baseUrl = options.baseUrl ?? config.nominatimUrl;
    this.limiter = options.limiter ?? new MinIntervalLimiter(1100);
    this.cache = options.cache ?? new TtlCache<GeoResult[]>(60 * 60 * 1000);
  }

  async geocode(query: string, limit = 3): Promise<GeoResult[]> {
    const q = query.trim();
    if (q.length < 2) throw new ToolError('Query must be at least 2 characters long.');

    const cacheKey = `${q.toLowerCase()}|${limit}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    await this.limiter.wait();
    const params = new URLSearchParams({
      q,
      format: 'jsonv2',
      limit: String(limit),
      addressdetails: '1',
    });
    const items = await fetchJson<NominatimItem[]>(`${this.baseUrl}/search?${params.toString()}`);

    const results = items
      .map((item): GeoResult => {
        // OSM text is untrusted: strip hidden characters and cap the length.
        const displayName = cleanText(String(item.display_name ?? ''), 300);
        const country = item.address?.country ? cleanText(item.address.country, 100) : '';
        return {
          name: cleanText(String(item.name ?? ''), 200) || displayName,
          displayName,
          latitude: Number(item.lat),
          longitude: Number(item.lon),
          ...(country ? { country } : {}),
        };
      })
      .filter((r) => r.displayName !== '' && Number.isFinite(r.latitude) && Number.isFinite(r.longitude));

    this.cache.set(cacheKey, results);
    return results;
  }
}
