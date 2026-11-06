// Owner: E11. Response of GET /health/live and GET /health/ready.

export type HealthCheckState = 'up' | 'down';

export interface HealthResponse {
  status: 'ok' | 'error';
  checks: Partial<Record<'database' | 'redis', HealthCheckState>>;
}
