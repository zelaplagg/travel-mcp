import { config } from '../config.ts';
import { TtlCache } from '../lib/cache.ts';
import { ToolError, UpstreamError } from '../lib/errors.ts';
import { fetchJson } from '../lib/http.ts';
import { assertCoordinates } from '../lib/validate.ts';
import type { DayForecast, ForecastProvider } from '../types.ts';

const WMO_CODES: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  56: 'Light freezing drizzle',
  57: 'Dense freezing drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  66: 'Light freezing rain',
  67: 'Heavy freezing rain',
  71: 'Slight snow',
  73: 'Moderate snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Slight rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  85: 'Slight snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with slight hail',
  99: 'Thunderstorm with heavy hail',
};

export function describeWeatherCode(code: number | null | undefined): string {
  if (code === null || code === undefined) return 'Unknown';
  return WMO_CODES[code] ?? `Unknown (WMO code ${code})`;
}

type Series = (number | null)[] | undefined;

interface ForecastResponse {
  daily?: {
    time?: string[];
    weather_code?: Series;
    temperature_2m_max?: Series;
    temperature_2m_min?: Series;
    precipitation_sum?: Series;
    precipitation_probability_max?: Series;
    wind_speed_10m_max?: Series;
  };
}

export interface OpenMeteoOptions {
  baseUrl?: string;
  cache?: TtlCache<DayForecast[]>;
}

export class OpenMeteoClient implements ForecastProvider {
  private readonly baseUrl: string;
  private readonly cache: TtlCache<DayForecast[]>;

  constructor(options: OpenMeteoOptions = {}) {
    this.baseUrl = options.baseUrl ?? config.openMeteoUrl;
    this.cache = options.cache ?? new TtlCache<DayForecast[]>(10 * 60 * 1000);
  }

  async getForecast(latitude: number, longitude: number, days = 3): Promise<DayForecast[]> {
    assertCoordinates(latitude, longitude);
    if (!Number.isInteger(days) || days < 1 || days > 16) {
      throw new ToolError('Days must be an integer between 1 and 16.');
    }

    const cacheKey = `${latitude.toFixed(2)},${longitude.toFixed(2)},${days}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      daily: [
        'weather_code',
        'temperature_2m_max',
        'temperature_2m_min',
        'precipitation_sum',
        'precipitation_probability_max',
        'wind_speed_10m_max',
      ].join(','),
      timezone: 'auto',
      forecast_days: String(days),
    });
    const data = await fetchJson<ForecastResponse>(`${this.baseUrl}/v1/forecast?${params.toString()}`);

    const daily = data.daily;
    if (!daily?.time) {
      throw new UpstreamError('Open-Meteo returned no daily data', { retryable: false });
    }

    const forecast = daily.time.map(
      (date, i): DayForecast => ({
        date,
        summary: describeWeatherCode(daily.weather_code?.[i]),
        tempMaxC: daily.temperature_2m_max?.[i] ?? null,
        tempMinC: daily.temperature_2m_min?.[i] ?? null,
        precipitationMm: daily.precipitation_sum?.[i] ?? null,
        precipitationProbability: daily.precipitation_probability_max?.[i] ?? null,
        windMaxKmh: daily.wind_speed_10m_max?.[i] ?? null,
      }),
    );

    this.cache.set(cacheKey, forecast);
    return forecast;
  }
}
