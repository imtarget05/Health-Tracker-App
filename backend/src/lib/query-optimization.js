import { logger } from './logger.js';

export class QueryOptimization {
  static async batchQuery(db, collection, options = {}) {
    const { filters = [], limit = 100, orderBy = null, startAfter = null, pageSize = 25 } = options;

    try {
      let query = db.collection(collection);
      for (const [field, operator, value] of filters) {
        query = query.where(field, operator, value);
      }
      if (orderBy) {
        query = query.orderBy(orderBy.field, orderBy.direction || 'asc');
      }
      if (startAfter) {
        query = query.startAfter(startAfter);
      }
      query = query.limit(Math.min(pageSize, limit));

      const snapshot = await query.get();
      const docs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

      return {
        data: docs,
        hasMore: docs.length === pageSize,
        cursor: docs.length > 0 ? docs[docs.length - 1] : null,
      };
    } catch (error) {
      logger.error({ collection, error }, 'Batch query error');
      throw error;
    }
  }

  static getConnectionPoolConfig() {
    return {
      min: 5,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
      statement_timeout: 30000,
    };
  }

  static getIndexRecommendations() {
    return {
      users: [{ fields: ['email ASC', 'createdAt DESC'], reason: 'Email lookup with sorting' }],
      workouts: [{ fields: ['userId ASC', 'date DESC'], reason: 'User workouts timeline' }],
      meals: [{ fields: ['userId ASC', 'date DESC'], reason: 'User meals by date' }],
      waterIntake: [{ fields: ['userId ASC', 'date DESC'], reason: 'Daily water intake tracking' }],
    };
  }

  static analyzeQuery(queryStats) {
    const { executionTimeMs, documentsScanned, documentsReturned, collection } = queryStats;
    const efficiency = documentsScanned > 0 ? (documentsReturned / documentsScanned) * 100 : 100;
    const issues = [];

    if (executionTimeMs > 1000) issues.push(`Slow query: ${executionTimeMs}ms`);
    if (efficiency < 50) issues.push(`Low efficiency: ${efficiency.toFixed(2)}%`);
    if (documentsScanned > 10000) issues.push(`Scanning too many documents: ${documentsScanned.toLocaleString()}`);

    return {
      executionTimeMs,
      efficiency: efficiency.toFixed(2),
      documentsScanned,
      documentsReturned,
      collection,
      issues,
    };
  }

  static queryPerformanceMonitor() {
    return async (req, res, next) => {
      const startTime = Date.now();
      const originalSend = res.send;
      res.send = function (data) {
        const duration = Date.now() - startTime;
        if (duration > 500) {
          logger.warn({ path: req.path, method: req.method, duration: `${duration}ms` }, 'Slow request detected');
        }
        return originalSend.call(this, data);
      };
      next();
    };
  }
}

export default QueryOptimization;
