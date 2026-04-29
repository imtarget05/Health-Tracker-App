import Redis from 'ioredis';
import { logger } from './logger.js';

export class CacheService {
  constructor(config = {}) {
    this.redis = new Redis({
      host: config.host || process.env.REDIS_HOST || 'localhost',
      port: config.port || process.env.REDIS_PORT || 6379,
      password: config.password || process.env.REDIS_PASSWORD,
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });

    this.ttls = {
      user: 3600,
      waterIntake: 1800,
      meals: 1800,
      workouts: 1800,
      nutrition: 3600,
      session: 604800,
      default: 1800,
    };
  }

  async get(key) {
    try {
      const value = await this.redis.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error({ key, error }, 'Cache get error');
      return null;
    }
  }

  async set(key, value, ttl = null) {
    try {
      const serialized = JSON.stringify(value);
      const finalTtl = ttl || this.ttls.default;
      if (finalTtl > 0) {
        await this.redis.setex(key, finalTtl, serialized);
      } else {
        await this.redis.set(key, serialized);
      }
    } catch (error) {
      logger.error({ key, error }, 'Cache set error');
    }
  }

  async delete(key) {
    try {
      await this.redis.del(key);
    } catch (error) {
      logger.error({ key, error }, 'Cache delete error');
    }
  }

  async getOrSet(key, fetcher, ttl = null) {
    try {
      const cached = await this.get(key);
      if (cached) return cached;
      const data = await fetcher();
      await this.set(key, data, ttl);
      return data;
    } catch (error) {
      logger.error({ key, error }, 'Cache getOrSet error');
      return await fetcher();
    }
  }

  async healthCheck() {
    try {
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch (error) {
      logger.error({ error }, 'Cache health check failed');
      return false;
    }
  }

  async close() {
    try {
      if (this.redis) {
        await this.redis.quit();
        logger.info('Cache (Redis) connection closed');
      }
    } catch (error) {
      logger.error({ error }, 'Error closing Redis connection');
    }
  }
}

export const cacheService = new CacheService();
