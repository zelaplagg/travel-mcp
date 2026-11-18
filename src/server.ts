import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { NominatimClient } from './clients/nominatim.ts';
import { OpenMeteoClient } from './clients/openMeteo.ts';
import { OverpassClient } from './clients/overpass.ts';
import { toUserMessage, ToolError } from './lib/errors.ts';
import { planDayForPlace } from './tools/planDay.ts';
import { PLACE_CATEGORIES } from './types.ts';
import type { ForecastProvider, Geocoder, PlaceFinder } from './types.ts';

export interface Services {
  geocoder: Geocoder;
  forecasts: ForecastProvider;
  places: PlaceFinder;
}

export function createDefaultServices(): Services {
  return {
    geocoder: new NominatimClient(),
    forecasts: new OpenMeteoClient(),
    places: new OverpassClient(),
  };
}

async function run(fn: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    const result = await fn();
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    if (!(error instanceof ToolError)) console.error('[travel-mcp] tool failed:', error);
    return { isError: true, content: [{ type: 'text', text: toUserMessage(error) }] };
  }
}

const readOnly = { readOnlyHint: true, openWorldHint: true } as const;

export function createMcpServer(services: Services = createDefaultServices()): McpServer {
  const server = new McpServer({ name: 'travel-mcp', version: '0.1.0' });

  server.registerTool(
    'geocode_place',
    {
      title: 'Geocode place',
      description:
        'Find coordinates for a place name or address (OpenStreetMap Nominatim). Use this before get_forecast or find_nearby.',
      inputSchema: {
        query: z.string().min(2).max(200).describe('Place name or address, e.g. "Vienna" or "Prater, Wien"'),
        limit: z.number().int().min(1).max(5).default(3).describe('Maximum number of matches'),
      },
      annotations: readOnly,
    },
    async ({ query, limit }) => run(() => services.geocoder.geocode(query, limit)),
  );

  server.registerTool(
    'get_forecast',
    {
      title: 'Get weather forecast',
      description:
        'Daily weather forecast for coordinates (Open-Meteo): conditions, min/max temperature, precipitation, wind.',
      inputSchema: {
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        days: z.number().int().min(1).max(16).default(3).describe('Number of days, 1-16'),
      },
      annotations: readOnly,
    },
    async ({ latitude, longitude, days }) =>
      run(() => services.forecasts.getForecast(latitude, longitude, days)),
  );

  server.registerTool(
    'find_nearby',
    {
      title: 'Find nearby places',
      description:
        'Find named places of the given categories near coordinates (OpenStreetMap Overpass), sorted by distance. To search several categories (e.g. museums and cafes), pass them all in the categories array of ONE call; do not call once per category.',
      inputSchema: {
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        categories: z
          .array(z.enum(PLACE_CATEGORIES))
          .min(1)
          .max(PLACE_CATEGORIES.length)
          .describe('One or more categories, combined in a single call'),
        radius_m: z.number().int().min(100).max(5000).default(1000).describe('Search radius in metres'),
        limit: z.number().int().min(1).max(30).default(10),
      },
      annotations: readOnly,
    },
    async ({ latitude, longitude, categories, radius_m, limit }) =>
      run(() => services.places.findNearby(latitude, longitude, categories, radius_m, limit)),
  );

  server.registerTool(
    'plan_day',
    {
      title: 'Plan a day',
      description:
        'Weather-aware day plan for a place: checks the forecast and suggests outdoor stops on good days and indoor stops (museums, cafes) when rain, wind or extreme temperatures are expected.',
      inputSchema: {
        place: z.string().min(2).max(200).describe('Place name, e.g. "Salzburg"'),
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe('Optional. Date as YYYY-MM-DD within the next 7 days. Omit it to plan for today; do not ask the user for a date.'),
      },
      annotations: readOnly,
    },
    async ({ place, date }) => run(() => planDayForPlace(place, date, services)),
  );

  return server;
}
