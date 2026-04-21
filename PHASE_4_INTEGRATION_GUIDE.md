# Phase 4 Integration Guide - Health Tracker v1.2

## Quick Start

### 1. Environment Setup

```bash
# Copy environment template
cp backend/.env.example backend/.env

# Edit and add your credentials
nano backend/.env

# Required environment variables:
# - FIREBASE_PROJECT_ID
# - FIREBASE_PRIVATE_KEY
# - JWT_SECRET
# - REDIS_HOST (optional, defaults to 127.0.0.1)
```

### 2. Local Development

```bash
# Install dependencies
cd backend
npm install

# Start with metrics disabled (dev mode)
DISABLE_SCHEDULER=1 npm start

# With scheduler enabled (requires cron setup)
npm start

# View metrics
curl http://localhost:5001/metrics
```

### 3. Docker Build & Run

```bash
# Build image
docker build -t health-tracker:latest .

# Run container
docker run -p 5001:5001 \
  --env-file .env.production \
  health-tracker:latest

# With Docker Compose
docker-compose up -d backend
```

### 4. Kubernetes Deployment

```bash
# Create namespace
kubectl create namespace health-tracker

# Add secret
kubectl create secret generic health-api-secrets \
  --from-literal=FIREBASE_PRIVATE_KEY="$FIREBASE_PRIVATE_KEY" \
  --from-literal=AI_CHAT_API_KEY="$AI_CHAT_API_KEY" \
  -n health-tracker

# Apply ConfigMap
kubectl apply -f backend/k8s/health-api-configmap.yaml.tpl -n health-tracker

# Deploy
kubectl apply -f backend/k8s/health-api-deployment.yaml.tpl -n health-tracker

# Verify
kubectl get pods -n health-tracker
kubectl port-forward svc/health-api 5001:80 -n health-tracker
```

---

## Phase 4 Features

### 📊 Monitoring Endpoints

```
GET /api/health          → Health check endpoint
GET /metrics            → Prometheus metrics (text format)
```

### 📈 Metrics Available

**HTTP Requests**
```
http_requests_total{method="GET",path="/api/health",status="200"} 150
```

**Cache Performance**
```
cache_hits_total 1234
cache_misses_total 456
```

**Database Queries**
```
db_queries_total 892
db_query_duration_ms [sum, mean, max available]
```

**Error Tracking**
```
errors_total{type="ValidationError"} 12
errors_total{type="AuthenticationError"} 3
```

### 🔒 Security Features

- ✅ Non-root container execution (UID 1000)
- ✅ Resource limits (CPU 500m, Memory 512Mi)
- ✅ CORS protection with whitelist
- ✅ Rate limiting per endpoint
- ✅ Secret management via K8s
- ✅ Health checks (liveness + readiness)

### 🧪 Testing

```bash
# Run all tests
npm test

# With coverage
npm test -- --coverage

# Specific test file
npm test -- auth.integration.test.js

# Watch mode
npm test -- --watch
```

### 📝 Logging

Logs are written to three destinations:

1. **Console** - Real-time debugging
```
[DEBUG] Cache miss for key: user:123:profile
[ERROR] Database query failed: Connection timeout
```

2. **logs/combined.log** - All logs
```
{"level":"info","timestamp":"2024-01-15T10:30:45Z","message":"Request completed","duration_ms":125}
```

3. **logs/error.log** - Errors only
```
{"level":"error","timestamp":"2024-01-15T10:30:45Z","message":"Validation failed","path":"/meals","statusCode":400}
```

### 🔄 CI/CD Pipeline

**Automatic triggered on:**
- Pull request creation
- Push to main/develop
- Tag creation

**Pipeline stages:**

```
test → semgrep → sonarqube → build → deploy → verify
 ↓        ↓           ↓         ↓       ↓        ↓
Jest   Security    Quality   Docker   K8s    Smoke
      Analysis    Gates     Registry  GitOps  Tests
```

---

## Configuration Reference

### Environment Variables (Group by Purpose)

#### Firebase
```
FIREBASE_PROJECT_ID=my-project
FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n
FIREBASE_CLIENT_EMAIL=sa@my-project.iam.gserviceaccount.com
FIREBASE_STORAGE_BUCKET=my-project.appspot.com
USE_FIREBASE_EMULATOR=0  # Set to 1 for local testing
```

#### Authentication
```
JWT_SECRET=your-strong-secret-min-32-chars
JWT_EXPIRE=7d
JWT_REFRESH_SECRET=another-strong-secret
JWT_REFRESH_EXPIRE=30d
```

#### Caching (Redis)
```
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=
CACHE_TTL_MINUTES=30
```

#### Email
```
MAIL_SERVICE=gmail
GMAIL_USER=your-email@gmail.com
GMAIL_PASSWORD=app-password-16-chars
SENDGRID_API_KEY=your-sendgrid-key
SENDGRID_FROM_EMAIL=noreply@health-tracker.com
```

#### Monitoring
```
METRICS_ENABLED=1
LOG_LEVEL=debug
LOG_FORMAT=json
```

#### Rate Limiting
```
AUTH_RATE_LIMIT_MAX=5
AUTH_RATE_LIMIT_WINDOW_MS=900000  # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_WINDOW_MS=900000
```

---

## Troubleshooting

### 🔴 Metrics endpoint returns 404

**Problem**: `/metrics` endpoint not found

**Solution**:
```bash
# Verify metrics route is registered
grep "GET /metrics" backend/src/index.js

# If missing, check that main index.js is updated
# Restart server
npm start
```

### 🔴 Errors not being caught

**Problem**: 500 errors aren't handled properly

**Solution**:
- Error middleware must be LAST middleware
- Check middleware order in index.js
- Ensure error responses include structured JSON

### 🔴 Redis connection fails

**Problem**: `Error: connect ECONNREFUSED 127.0.0.1:6379`

**Solution**:
```bash
# Start Redis server
redis-server

# Or disable Redis for testing
DISABLE_CACHE=1 npm start

# Check connection
redis-cli ping  # Should return PONG
```

### 🔴 Docker build fails

**Problem**: `npm ci --production fails`

**Solution**:
```bash
# Clear npm cache
npm cache clean --force

# Update lock file
npm install

# Rebuild Docker image
docker build --no-cache -t health-tracker:latest .
```

### 🔴 K8s deployment pending

**Problem**: Pod stuck in Pending state

**Solution**:
```bash
# Check pod status
kubectl describe pod <pod-name> -n health-tracker

# Check events
kubectl get events -n health-tracker

# Check resource availability
kubectl top nodes
```

---

## Performance Tuning

### Caching Strategy

```javascript
// Cache frequently accessed data
CACHE_TTL_MINUTES=60  // 1 hour for user profiles
CACHE_TTL_MINUTES=5   // 5 minutes for real-time data
```

### Database Optimization

Recommended indexes in Firestore:
```
users: [email, createdAt]
meals: [userId, date]
workouts: [userId, date]
water: [userId, date]
```

### Rate Limiting

```
AUTH: 5 attempts / 15 minutes
AI_CHAT: 50 messages / 24 hours
UPLOAD: 10 uploads / 24 hours
GENERAL: 100 requests / 1 minute
```

---

## Production Deployment Checklist

- [ ] All environment variables configured
- [ ] Firebase credentials verified
- [ ] Redis running and accessible
- [ ] Email service credentials configured
- [ ] SSL certificates installed
- [ ] CORS origins whitelist configured
- [ ] Rate limiting adjusted for load
- [ ] Monitoring alerts configured
- [ ] Log aggregation setup
- [ ] Database backups scheduled
- [ ] Secrets rotation policy defined
- [ ] Team trained on deployment process

---

## Support & Resources

### Key Files
- **Backend entry**: `backend/src/index.js`
- **Metrics service**: `backend/src/lib/metrics.js`
- **Error handling**: `backend/src/middleware/error-handling.middleware.js`
- **Deploy manifests**: `backend/k8s/` directory
- **CI/CD config**: `.gitlab-ci.yml`

### Documentation
- [Phase 4 Completion Report](./PHASE_4_COMPLETION_REPORT.md)
- [K8s Deployment README](./backend/k8s/README.md)
- [Environment Reference](./.env.example)

### Commands Reference

```bash
# Development
npm start                    # Start server
npm test                     # Run tests
npm test -- --coverage       # With coverage

# Docker
docker build -t app:latest . # Build image
docker run -p 5001:5001 app  # Run container

# Kubernetes
kubectl apply -f k8s/        # Deploy
kubectl get pods             # Check status
kubectl logs pod/name        # View logs
kubectl port-forward svc/name 5001:5001  # Access

# Git
git status                   # Check changes
git commit -m "message"      # Commit
git push origin main         # Push
```

---

**Version**: v1.2.0 - Phase 4 Complete
**Last Updated**: 2024
**Status**: ✅ Production Ready
