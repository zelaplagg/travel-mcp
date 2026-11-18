import { ToolError } from '../lib/errors.ts';
import { PLACE_CATEGORIES } from '../types.ts';
import type { DayForecast, ForecastProvider, Geocoder, Place, PlaceFinder } from '../types.ts';

export interface OutdoorAssessment {
  outdoorFriendly: boolean;
  reasons: string[];
}

/** Decides whether a day is suitable for outdoor activities, with human-readable reasons if not. */
export function assessDay(day: DayForecast): OutdoorAssessment {
  const reasons: string[] = [];
  if ((day.precipitationProbability ?? 0) >= 50) {
    reasons.push(`rain is likely (${day.precipitationProbability}% chance)`);
  }
  if ((day.precipitationMm ?? 0) >= 2) {
    reasons.push(`${day.precipitationMm} mm of precipitation expected`);
  }
  if ((day.windMaxKmh ?? 0) >= 40) {
    reasons.push(`strong wind (up to ${day.windMaxKmh} km/h)`);
  }
  if (day.tempMaxC !== null && day.tempMaxC < 5) {
    reasons.push(`cold (max ${day.tempMaxC}°C)`);
  }
  if (day.tempMaxC !== null && day.tempMaxC > 35) {
    reasons.push(`very hot (max ${day.tempMaxC}°C)`);
  }
  return { outdoorFriendly: reasons.length === 0, reasons };
}

export interface DayPlan {
  place: string;
  date: string;
  weather: DayForecast;
  outdoorFriendly: boolean;
  reasons: string[];
  suggestions: Place[];
}

const byDistance = (a: Place, b: Place): number => a.distanceM - b.distanceM;

/** Takes ~2/3 outdoor places (for good weather) and fills the rest with indoor stops such as cafes. */
function mixOutdoorFirst(outdoor: Place[], indoor: Place[], maxItems: number): Place[] {
  const outdoorCount = Math.min(outdoor.length, Math.ceil((maxItems * 2) / 3));
  const picked = [...outdoor.slice(0, outdoorCount), ...indoor.slice(0, maxItems - outdoorCount)];
  if (picked.length < maxItems) {
    picked.push(...outdoor.slice(outdoorCount, outdoorCount + maxItems - picked.length));
  }
  return picked;
}

export function buildPlan(
  placeName: string,
  day: DayForecast,
  places: Place[],
  maxItems = 6,
): DayPlan {
  const { outdoorFriendly, reasons } = assessDay(day);
  const outdoor = places.filter((p) => !p.indoor).sort(byDistance);
  const indoor = places.filter((p) => p.indoor).sort(byDistance);

  let suggestions: Place[];
  if (outdoorFriendly) {
    suggestions = mixOutdoorFirst(outdoor, indoor, maxItems);
  } else if (indoor.length > 0) {
    suggestions = indoor.slice(0, maxItems);
  } else {
    // Nothing indoors nearby: fall back to outdoor places rather than returning an empty plan.
    suggestions = outdoor.slice(0, maxItems);
  }

  return { place: placeName, date: day.date, weather: day, outdoorFriendly, reasons, suggestions };
}

export interface PlanDayServices {
  geocoder: Geocoder;
  forecasts: ForecastProvider;
  places: PlaceFinder;
}

export async function planDayForPlace(
  query: string,
  date: string | undefined,
  services: PlanDayServices,
  options: { radiusM?: number } = {},
): Promise<DayPlan> {
  if (date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new ToolError('Date must have the format YYYY-MM-DD.');
  }

  const [match] = await services.geocoder.geocode(query, 1);
  if (!match) throw new ToolError(`Could not find a place called "${query}".`);

  const forecast = await services.forecasts.getForecast(match.latitude, match.longitude, 7);
  const first = forecast[0];
  const last = forecast[forecast.length - 1];
  if (!first || !last) throw new ToolError('No forecast data is available for this place.');

  const day = date === undefined ? first : forecast.find((d) => d.date === date);
  if (!day) {
    throw new ToolError(`No forecast for ${date}. Available dates: ${first.date} to ${last.date}.`);
  }

  const places = await services.places.findNearby(
    match.latitude,
    match.longitude,
    PLACE_CATEGORIES,
    options.radiusM ?? 1500,
    30,
  );
  return buildPlan(match.displayName, day, places);
}
