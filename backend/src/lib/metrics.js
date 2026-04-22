import pino from 'pino';
import pinoHttp from 'pino-http';

export class MetricsService {
  constructor() {
    this.metrics = {
      httpRequestsTotal: new Map(),
      httpRequestDuration: [],
      cacheHits: 0,
      cacheMisses: 0,
      dbQueries: 0,
      dbQueryDuration: [],
      errors: new Map(),
      activeConnections: 0,
    };
  }

  recordHttpRequest(method, path, statusCode, duration) {
    const key = `${method}:${path}:${statusCode}`;
    this.metrics.httpRequestsTotal.set(key, (this.metrics.httpRequestsTotal.get(key) || 0) + 1);
    this.metrics.httpRequestDuration.push(duration);
  }

  recordCacheAccess(hit) {
    if (hit) this.metrics.cacheHits++;
    else this.metrics.cacheMisses++;
  }

  recordDbQuery(duration) {
    this.metrics.dbQueries++;
    this.metrics.dbQueryDuration.push(duration);
  }

  recordError(errorType) {
    this.metrics.errors.set(errorType, (this.metrics.errors.get(errorType) || 0) + 1);
  }

  getPrometheusMetrics() {
    let output = '';
    
    this.metrics.httpRequestsTotal.forEach((count, key) => {
      const [method, path, status] = key.split(':');
      output += `http_requests_total{method="${method}",path="${path}",status="${status}"} ${count}\n`;
    });

    const totalCacheAccess = this.metrics.cacheHits + this.metrics.cacheMisses;
    output += `cache_hits_total ${this.metrics.cacheHits}\n`;
    output += `cache_misses_total ${this.metrics.cacheMisses}\n`;
    if (totalCacheAccess > 0) {
      output += `cache_hit_rate ${(this.metrics.cacheHits / totalCacheAccess).toFixed(4)}\n`;
    }

    output += `db_queries_total ${this.metrics.dbQueries}\n`;
    output += `active_connections ${this.metrics.activeConnections}\n`;

    const memUsage = process.memoryUsage();
    output += `nodejs_heap_used_bytes ${memUsage.heapUsed}\n`;
    output += `process_uptime_seconds ${process.uptime()}\n`;

    return output;
  }

  metricsMiddleware() {
    return (req, res, next) => {
      const start = Date.now();
      this.metrics.activeConnections++;

      res.on('finish', () => {
        const duration = Date.now() - start;
        this.metrics.activeConnections--;
        this.recordHttpRequest(req.method, req.path, res.statusCode, duration);
        if (res.statusCode >= 400) {
          this.recordError(`http_${res.statusCode}`);
        }
      });

      next();
    };
  }

  async healthCheck() {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    };
  }
}

export const metricsService = new MetricsService();
