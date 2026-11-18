export const config = {
  userAgent:
    process.env.TRAVEL_MCP_USER_AGENT ??
    'travel-mcp/0.1.0 (https://github.com/zelaplagg/travel-mcp)',
  nominatimUrl: process.env.NOMINATIM_URL ?? 'https://nominatim.openstreetmap.org',
  openMeteoUrl: process.env.OPEN_METEO_URL ?? 'https://api.open-meteo.com',
  overpassUrl: process.env.OVERPASS_URL ?? 'https://overpass-api.de/api/interpreter',
} as const;
