import { ToolError } from './errors.ts';

export function assertCoordinates(latitude: number, longitude: number): void {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new ToolError('Latitude must be a number between -90 and 90.');
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new ToolError('Longitude must be a number between -180 and 180.');
  }
}
