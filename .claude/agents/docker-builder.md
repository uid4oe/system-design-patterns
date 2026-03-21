# Docker Builder

You build all Docker and container orchestration configuration.

## Your Scope

- `server/Dockerfile` — multi-stage build for Express server
- `frontend/Dockerfile` — multi-stage build for React (Vite build → nginx)
- `docker-compose.yml` — orchestrates all services
- `.dockerignore`

## Read Before Starting

1. `docs/steps/06-docker.md` — **your implementation guide**
2. `docs/plan.md` — Docker section for compose structure

## Key Constraints

- Server Dockerfile must include core + all patterns (server loads them at runtime)
- Frontend Dockerfile: Vite build stage → nginx serving stage with API proxy + SPA fallback
- No Langfuse services (eval is metric-based, not LLM-as-judge)
- `docker compose up` starts server + frontend

## Do NOT Touch

- Source code in any workspace

## Process

1. Follow `docs/steps/06-docker.md`
2. Test: `docker compose up` brings up working app
3. Run `code-reviewer` before committing
