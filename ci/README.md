CI variables required for secure pipeline

This repository's CI configuration (GitLab CI + GitHub Actions) expects the following variables to be
set in your project or group settings. Do NOT commit secrets into source.

─── Harbor Registry ──────────────────────────────────────────────────────────────────────────────
- HARBOR_URL          URL of the Harbor registry           e.g. harbor.example.com
- HARBOR_USER         Robot account username               e.g. robot$health-tracker+ci
- HARBOR_PASSWORD     Robot account token / password       (masked/secret)
- HARBOR_PROJECT      Harbor project name                  default: health-tracker

─── SonarQube ────────────────────────────────────────────────────────────────────────────────────
- SONAR_HOST_URL      SonarQube server URL                 e.g. https://sonar.example.com
- SONAR_TOKEN         Analysis token with execute rights   (masked)

─── Kubernetes ───────────────────────────────────────────────────────────────────────────────────
- KUBE_CONFIG         base64-encoded kubeconfig            (masked) — used by legacy deploy-k8s job only

─── ArgoCD ───────────────────────────────────────────────────────────────────────────────────────
- ARGOCD_SERVER       ArgoCD server hostname               e.g. argocd.example.com
- ARGOCD_AUTH_TOKEN   ArgoCD API token                     (masked) — scoped to proj:health-tracker

─── GitOps commit-back ───────────────────────────────────────────────────────────────────────────
GitLab CI:
- GITOPS_TOKEN        GitLab personal/project access token with api + write_repository scope (masked)
GitHub Actions:
- GITOPS_TOKEN        GitHub PAT with contents:write scope (secret)

─── Legacy GitLab container registry (optional, superseded by Harbor) ────────────────────────────
- CI_REGISTRY         e.g. registry.gitlab.com             (auto-set by GitLab)
- CI_REGISTRY_USER    push rights username                 (auto-set by GitLab)
- CI_REGISTRY_PASSWORD push token                         (auto-set by GitLab)

─── Notes ────────────────────────────────────────────────────────────────────────────────────────
- Use masked variables for all secrets; never print them in job logs.
- Prefer robot accounts or ephemeral tokens over admin credentials.
- Rotate any token that was accidentally exposed immediately.
- Add `.env` and `secrets/` to `.gitignore` — never commit them.

─── ArgoCD initial setup ─────────────────────────────────────────────────────────────────────────
1. Install ArgoCD in your cluster:
     kubectl create namespace argocd
     kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

2. Apply the AppProject and Application manifests:
     kubectl apply -f k8s/argocd/argocd-project.yaml
     kubectl apply -f k8s/argocd/backend-app.yaml
     kubectl apply -f k8s/argocd/ai-app.yaml
     kubectl apply -f k8s/argocd/backend-app-staging.yaml

3. Create an ArgoCD API token for CI (scope: proj:health-tracker):
     argocd account generate-token --account ci-deployer
   Store the token as ARGOCD_AUTH_TOKEN in CI variables.

─── Harbor initial setup ─────────────────────────────────────────────────────────────────────────
1. Create a Harbor project named `health-tracker` (or your HARBOR_PROJECT value).
2. Create a robot account with push access to the project.
3. Store robot username → HARBOR_USER, robot secret → HARBOR_PASSWORD in CI variables.

─── GitOps flow ──────────────────────────────────────────────────────────────────────────────────
Push to `develop`  →  build images  →  push to Harbor  →  update k8s/overlays/staging  →  ArgoCD syncs staging
Push to `main`     →  build images  →  push to Harbor  →  update k8s/overlays/production  →  ArgoCD syncs production
Pull request       →  test + semgrep + sonarqube + kustomize dry-run (no image push)

