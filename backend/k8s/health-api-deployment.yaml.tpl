apiVersion: apps/v1
kind: Deployment
metadata:
  name: health-api
  labels:
    app: health-api
spec:
  replicas: 1
  selector:
    matchLabels:
      app: health-api
  template:
    metadata:
      labels:
        app: health-api
    spec:
      # ✅ SECURITY: Run as non-root user
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        fsGroup: 1000
      
      containers:
        - name: health-api
          image: ${IMAGE_TAG}
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 5001
          envFrom:
            - secretRef:
                name: health-api-secrets
            - configMapRef:
                name: health-api-config
          
          # ✅ SECURITY: Resource limits prevent resource starvation and excessive node memory usage
          resources:
            requests:
              cpu: "100m"         # Minimum CPU required (0.1 CPU core)
              memory: "128Mi"     # Minimum memory required (128 MB)
            limits:
              cpu: "500m"         # Maximum CPU allowed (0.5 CPU core)
              memory: "512Mi"     # Maximum memory allowed (512 MB)
          
          # ✅ SECURITY: Probes detect unhealthy pods
          livenessProbe:
            httpGet:
              path: /api/health
              port: 5001
            initialDelaySeconds: 20
            periodSeconds: 15
            timeoutSeconds: 5
            failureThreshold: 3
          
          readinessProbe:
            httpGet:
              path: /api/health
              port: 5001
            initialDelaySeconds: 10
            periodSeconds: 10
            timeoutSeconds: 5
            failureThreshold: 2
