import { config } from '../config.ts';
import { ToolError } from '../lib/errors.ts';
import { haversineM } from '../lib/geo.ts';
import { fetchJson } from '../lib/http.ts';
import { MinIntervalLimiter } from '../lib/rateLimiter.ts';
import { cleanText, safeHttpUrl } from '../lib/sanitize.ts';
import { assertCoordinates } from '../lib/validate.ts';
import type { Place, PlaceCategory, PlaceFinder } from '../types.ts';

const CATEGORY_TAGS: Record<PlaceCategory, readonly [key: string, value: string]> = {
  museum: ['tourism', 'museum'],
  park: ['leisure', 'park'],
  restaurant: ['amenity', 'restaurant'],
  cafe: ['amenity', 'cafe'],
  viewpoint: ['tourism', 'viewpoint'],
  attraction: ['tourism', 'attraction'],
};

const INDOOR_CATEGORIES: ReadonlySet<PlaceCategory> = new Set(['museum', 'restaurant', 'cafe']);

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements?: OverpassElement[];
}

/**
 * Builds an Overpass QL query. All interpolated values are numbers or come from a fixed
 * category table, so no user-provided text ends up inside the query.
 */
export function buildOverpassQuery(
  latitude: number,
  longitude: number,
  categories: readonly PlaceCategory[],
  radiusM: number,
  limit: number,
): string {
  const clauses = [...new Set(categories)].map((category) => {
    const [key, value] = CATEGORY_TAGS[category];
    return `nwr(around:${radiusM},${latitude},${longitude})["${key}"="${value}"]["name"];`;
  });
  // Overpass cannot sort by distance, so fetch extra results and trim after sorting.
  return `[out:json][timeout:20];(${clauses.join('')});out center ${limit * 3};`;
}

function categoryOf(
  tags: Record<string, string>,
  categories: readonly PlaceCategory[],
): PlaceCategory | undefined {
  return categories.find((category) => {
    const [key, value] = CATEGORY_TAGS[category];
    return tags[key] === value;
  });
}

export interface OverpassOptions {
  endpoint?: string;
  limiter?: MinIntervalLimiter;
}

export class OverpassClient implements PlaceFinder {
  private readonly endpoint: string;
  private readonly limiter: MinIntervalLimiter;

  constructor(options: OverpassOptions = {}) {
    this.endpoint = options.endpoint ?? config.overpassUrl;
    this.limiter = options.limiter ?? new MinIntervalLimiter(1000);
  }

  async findNearby(
    latitude: number,
    longitude: number,
    categories: readonly PlaceCategory[],
    radiusM = 1000,
    limit = 15,
  ): Promise<Place[]> {
    assertCoordinates(latitude, longitude);
    if (categories.length === 0) throw new ToolError('At least one category is required.');
    if (!Number.isInteger(radiusM) || radiusM < 100 || radiusM > 5000) {
      throw new ToolError('Radius must be an integer between 100 and 5000 metres.');
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      throw new ToolError('Limit must be an integer between 1 and 50.');
    }

    await this.limiter.wait();
    const query = buildOverpassQuery(latitude, longitude, categories, radiusM, limit);
    const data = await fetchJson<OverpassResponse>(this.endpoint, {
      method: 'POST',
      body: new URLSearchParams({ data: query }).toString(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeoutMs: 25_000,
    });

    const places: Place[] = [];
    for (const element of data.elements ?? []) {
      const tags = element.tags ?? {};
      const name = cleanText(tags['name'] ?? '');
      const lat = element.lat ?? element.center?.lat;
      const lon = element.lon ?? element.center?.lon;
      const category = categoryOf(tags, categories);
      if (!name || lat === undefined || lon === undefined || !category) continue;

      const website = safeHttpUrl(tags['website'] ?? tags['contact:website']);
      places.push({
        id: `${element.type}/${element.id}`,
        name,
        category,
        latitude: lat,
        longitude: lon,
        distanceM: Math.round(haversineM(latitude, longitude, lat, lon)),
        indoor: INDOOR_CATEGORIES.has(category),
        ...(website ? { website } : {}),
      });
    }

    return places.sort((a, b) => a.distanceM - b.distanceM).slice(0, limit);
  }
}
