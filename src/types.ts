export interface GeoResult {
  name: string;
  displayName: string;
  latitude: number;
  longitude: number;
  country?: string;
}

export interface DayForecast {
  date: string;
  summary: string;
  tempMaxC: number | null;
  tempMinC: number | null;
  precipitationMm: number | null;
  precipitationProbability: number | null;
  windMaxKmh: number | null;
}

export const PLACE_CATEGORIES = [
  'museum',
  'park',
  'restaurant',
  'cafe',
  'viewpoint',
  'attraction',
] as const;

export type PlaceCategory = (typeof PLACE_CATEGORIES)[number];

export interface Place {
  id: string;
  name: string;
  category: PlaceCategory;
  latitude: number;
  longitude: number;
  distanceM: number;
  indoor: boolean;
  website?: string;
}

export interface Geocoder {
  geocode(query: string, limit?: number): Promise<GeoResult[]>;
}

export interface ForecastProvider {
  getForecast(latitude: number, longitude: number, days?: number): Promise<DayForecast[]>;
}

export interface PlaceFinder {
  findNearby(
    latitude: number,
    longitude: number,
    categories: readonly PlaceCategory[],
    radiusM?: number,
    limit?: number,
  ): Promise<Place[]>;
}
