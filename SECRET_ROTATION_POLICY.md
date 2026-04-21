# Secret Rotation Policy - Health Tracker App

**Document Status:** ✅ ACTIVE  
**Last Updated:** April 21, 2026  
**Review Frequency:** Every 90 days

---

## 1. Overview

This document defines the secret rotation policy for the Health Tracker App production environment. All secrets (API keys, passwords, tokens, database credentials) must be rotated on a regular schedule to minimize blast radius in case of compromise.

---

## 2. Rotation Schedule

| Secret Type | Rotation Interval | Risk Level | Notes |
|-------------|------------------|-----------|-------|
| Database Passwords | Every 90 days | HIGH | Coordinates with DB team |
| API Keys (Third-party) | Every 180 days | HIGH | SendGrid, Google Cloud, etc. |
| JWT_SECRET | Every 90 days | CRITICAL | Force re-auth after rotation |
| JWT_REFRESH_SECRET | Every 90 days | CRITICAL | Force logout after rotation |
| Firebase Service Account Key | Every 90 days | HIGH | Regenerate and deploy |
| OAuth Credentials (Google/Facebook) | Every 180 days | MEDIUM | From OAuth provider dashboards |
| AI_API_KEY | Every 90 days | HIGH | Regenerate and update |
| Encryption Keys | Every 180 days | CRITICAL | Archive old keys, never delete |
| SSL/TLS Certificates | 30 days before expiry | MEDIUM | Set alerts for 60 days before |
| GitHub Deploy Tokens | Every 90 days | HIGH | Used for CI/CD automation |

---

## 3. Rotation Procedures

### 3.1 JWT Secrets (JWT_SECRET, JWT_REFRESH_SECRET)

**Procedure:**
```bash
# 1. Generate new secrets
openssl rand -base64 32 > /tmp/new_jwt_secret.txt
openssl rand -base64 32 > /tmp/new_jwt_refresh_secret.txt

# 2. Update .env file in k8s secrets
kubectl edit secret health-api-secrets -n production
# Replace:
# JWT_SECRET: <NEW_VALUE>
# JWT_REFRESH_SECRET: <NEW_VALUE>

# 3. Restart pods to pick up new secrets
kubectl rollout restart deployment/health-api -n production
kubectl rollout status deployment/health-api -n production

# 4. Monitor for errors (users will need to re-login)
kubectl logs -f deployment/health-api -n production

# 5. Notify users (if needed) of forced logout
```

**Impact:** Users will experience forced logout and need to login again. Schedule during low-traffic hours.

---

### 3.2 Database Credentials

**Procedure:**
```bash
# 1. Generate new password
openssl rand -base64 24 > /tmp/new_db_password.txt

# 2. Update Firebase/database credentials
# (This varies by provider - Firebase uses Google Cloud IAM)

#3. Update backend secrets
kubectl edit secret health-api-secrets -n production
# Update DB_PASSWORD or relevant credentials

# 4. Verify backend can connect
kubectl rollout restart deployment/health-api -n production
kubectl logs -f deployment/health-api -n production | grep -i connected

# 5. Revoke old credentials after verification
```

---

### 3.3 API Keys (SendGrid, Google Cloud, AI Service)

**Procedure:**
```bash
# 1. Generate new key in provider dashboard (AWS, Google Cloud Console, SendGrid, etc.)
# 2. Store securely in secrets manager (AWS Secrets Manager, HashiCorp Vault, K8s Secret)
# 3. Update kubernetes secrets:

kubectl set env deployment/health-api \
  SENDGRID_API_KEY="sk-new-key..." \
  -n production

# 4. Restart pods
kubectl rollout restart deployment/health-api -n production

# 5. Test the service (send test email, make API call, etc.)
# 6. After 24h verification period, deactivate OLD key in provider dashboard
# 7. Document: date, service, old key ID (masked), new key ID (masked)
```

---

### 3.4 Firebase Service Account Key

**Procedure:**
```bash
# 1. Generate new key in Google Cloud Console
#    Project Settings → Service Accounts → (Select service account) → Keys → Create New
#    Format: JSON

# 2. Encode new key as base64
cat firebase-key-new.json | base64 -w 0 > /tmp/firebase_key_b64.txt

# 3. Update K8s secret
kubectl patch secret health-api-secrets -n production \
  -p='{"data":{"FIREBASE_PRIVATE_KEY":"<BASE64_ENCODED_KEY>"}}'

# 4. Restart pods
kubectl rollout restart deployment/health-api -n production

# 5. Monitor logs for connectivity issues
kubectl logs -f deployment/health-api -n production | grep -i firebase

# 6. After 24h verification, delete OLD key from Google Cloud Console
```

---

### 3.5 SSL/TLS Certificates

**Procedure:**
```bash
# 1. Set up certificate renewal automation (Let's Encrypt with cert-manager recommended)
# 2. OR manually:

# Generate new certificate
certbot certonly --standalone -d api.health-tracker.com

# 3. Update K8s secret
kubectl create secret tls api-tls-cert \
  --cert=./fullchain.pem \
  --key=./privkey.pem \
  --dry-run=client -o yaml | kubectl apply -f -

# 4. Restart ingress
kubectl rollout restart deployment/ingress-nginx -n ingress-nginx

# 5. Test: curl -v https://api.health-tracker.com/health
```

---

## 4. Secrets Storage & Access Control

### 4.1 AWS Secrets Manager (Recommended for Production)

```bash
# Store secrets in AWS Secrets Manager
aws secretsmanager create-secret \
  --name health-tracker/production/jwt-secret \
  --description "JWT signing secret" \
  --secret-string "$(openssl rand -base64 32)" \
  --tags Key=Environment,Value=production Key=Service,Value=health-api

# Rotate secret automatically
aws secretsmanager rotate-secret \
  --secret-id health-tracker/production/jwt-secret \
  --rotation-rules AutomaticallyAfterDays=90
```

### 4.2 HashiCorp Vault (Enterprise Option)

```bash
vault secrets enable -version=2 kv

vault kv put secret/health-tracker/production/database \
  username=dbuser \
  password=$(openssl rand -base64 24)

# Enable auto-rotation
vault write secret/metadata/health-tracker/production/database \
  max_versions=10 \
  custom_metadata=rotation_enabled=true rotation_interval=90day
```

### 4.3 Kubernetes Secrets (Development - NOT for Production)

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: health-api-secrets
  namespace: production
  labels:
    rotation-date: "2026-04-21"
    rotation-interval: "90days"
type: Opaque
data:
  JWT_SECRET: <base64_encoded>
  JWT_REFRESH_SECRET: <base64_encoded>
  DATABASE_PASSWORD: <base64_encoded>
  # ... other secrets
```

---

## 5. Access Control & Audit Logging

### 5.1 Who Can Rotate Secrets?

- ✅ **Allowed:** DevOps engineers with k8s admin access
- ✅ **Allowed:** Cloud infrastructure team
- ❌ **Not Allowed:** Application developers (unless emergency)
- ❌ **Not Allowed:** Other team members

### 5.2 Audit Logging

All secret rotations must be logged:

```bash
# Enable audit logging in K8s
apiVersion: audit.k8s.io/v1
kind: Policy
rules:
  - level: RequestResponse
    omitStages:
      - RequestReceived
    resources:
      - group: ""
        resources: ["secrets"]
    namespaces: ["production"]

# Check audit logs
kubectl logs -n kube-system -l component=kube-apiserver | grep Secret
```

---

## 6. Emergency Secret Rotation

**If a secret is compromised:**

1. **Immediate Actions** (Within 5 minutes)
   - Revoke the compromised secret in provider dashboard
   - Alert security team
   - Create incident ticket

2. **Urgent Actions** (Within 30 minutes)
   - Generate new secret
   - Deploy new secret to staging
   - Run smoke tests

3. **Production** (Within 1 hour)
   - Deploy new secret to production
   - Monitor logs and alerts
   - Send incident report

---

## 7. Monitoring & Automation

### 7.1 Secret Expiry Alerts

```bash
# Set up monitoring/alerting for expiring secrets
# In Prometheus:
cert_expiry_days < 30  # Alert if cert expires in < 30 days
api_key_age_days > 85  # Alert if API key not rotated in 85+ days
db_password_age > 85   # Alert if DB password not rotated in 85+ days

# In CloudWatch/DataDog: Create Dashboard with secret ages
```

### 7.2 Automated Rotation (CI/CD)

```yaml
# GitHub Actions workflow for automatic rotation
name: Rotate Secrets
on:
  schedule:
    - cron: '0 0 21 * *'  # Monthly on the 21st

jobs:
  rotate:
    runs-on: ubuntu-latest
    steps:
      - name: Rotate JWT Secrets
        run: |
          NEW_SECRET=$(openssl rand -base64 32)
          kubectl patch secret health-api-secrets \
            -p='{"data":{"JWT_SECRET":"'$(echo -n $NEW_SECRET | base64 -w 0)'"}}'
          
      - name: Run Smoke Tests
        run: |
          npm test
      
      - name: Notify Slack
        run: |
          curl -X POST $SLACK_WEBHOOK \
            -d '{"text":"Secret rotation completed successfully"}'
```

---

## 8. Backup & Recovery

### 8.1 Secrets Backup

```bash
# Backup secrets before rotation
kubectl get secret health-api-secrets -n production -o yaml \
  | gpg --encrypt --armor --recipient ops-team@company.com \
  > health-api-secrets-backup-2026-04-21.gpg

# Store backup in secure location (AWS S3, encrypted drive, etc.)
```

### 8.2 Recovery Procedure

```bash
# If rotation fails and you need to revert
gpg --decrypt health-api-secrets-backup-2026-04-21.gpg | kubernetes apply -f -

# Verify
kubectl get secret health-api-secrets -n production -o yaml
```

---

## 9. Documentation & Change Log

### 9.1 Template for Each Rotation

```markdown
## Secret Rotation - [SECRET_NAME] - [DATE]

**Rotated By:** [Name]  
**Date:** [Date]  
**Time:** [Time UTC]  
**Duration:** [Minutes]  

### Changes
- [ ] Secret updated in Secrets Manager
- [ ] K8s secret patched
- [ ] Pods restarted
- [ ] Smoke tests passed
- [ ] Old secret revoked
- [ ] Incident ticket closed

### Impact
- Users experiencing this: [If any]
- Services affected: [List]
- Downtime: [Duration]

### Verification
- Log snippet: [Grep from logs showing success]
- Test results: [Pass/Fail]
```

### 9.2 Change Log
| Date | Secret | Rotated By | Status | Notes |
|------|--------|-----------|--------|-------|
| 2026-04-21 | JWT_SECRET | DevOps Team | ✅ Complete | Quarterly rotation |
| ... | ... | ... | ... | ... |

---

## 10. Contact & Escalation

- **Primary Contact:** DevOps Lead (ops-lead@company.com)
- **Secondary Contact:** Senior SRE (sre@company.com)
- **Emergency Escalation:** Incident Commander on-call
- **Security Escalation:** Security Team (security@company.com)

---

## 11. References

- [OWASP Secret Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [AWS Secrets Manager Best Practices](https://docs.aws.amazon.com/secretsmanager/latest/userguide/best-practices.html)
- [Kubernetes Security Best Practices](https://kubernetes.io/docs/concepts/security/secrets/)
- [CIS Kubernetes Benchmark](https://www.cisecurity.org/benchmark/kubernetes)

---

**Approval:** ✅ DevOps Lead | ✅ Security Lead | ✅ Engineering Manager

**Policy Effective Date:** April 21, 2026  
**Next Review Date:** July 21, 2026
