# Step 6: Docker

**Agent:** `docker-builder`
**Depends on:** Steps 1-5

## Overview

Containerize the server and frontend with multi-stage Docker builds. Same approach as agent-orchestration-patterns but simpler (no Langfuse services needed).

## Implementation Order

### 6.1 Server Dockerfile (multi-stage: alpine build → slim runtime)
### 6.2 Frontend Dockerfile (multi-stage: alpine build → nginx serve)
### 6.3 docker-compose.yml (server + frontend)
### 6.4 nginx.conf (API proxy + SPA fallback + SSE support)

## Done When
- [ ] `docker compose up` starts both services
- [ ] Frontend at :3000 proxies API calls to server at :3001
- [ ] SSE streaming works through nginx proxy
