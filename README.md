npm run dev
# Informix Database REST API Service

Node.js REST API for IBM Informix using JDBC, packaged with Docker.

## Quick start

1) Configure environment
```
cp .env.example .env
# fill DB_* values and INFORMIX_SERVICE_PORT (host port, default 4000)
```

2) Run with Docker
```
docker-compose up -d        # start
docker-compose logs -f      # tail logs
docker-compose down         # stop
```

3) Smoke test (host port defaults to 4000)
```
curl http://localhost:4000/api/health
curl http://localhost:4000/api/tables
curl -X POST http://localhost:4000/api/query \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT FIRST 5 * FROM systables"}'
```

## API

- GET /api/health
- GET /api/stats
- POST /api/query (SELECT only)
- POST /api/query/one
- GET /api/tables
- GET /api/tables/:table/columns
- GET /api/data/:table?limit&offset
- POST /api/cache/clear

## Client usage (Node.js)

```
const { InformixClient } = require('./src/client/InformixClient');
const client = new InformixClient({ baseUrl: 'http://localhost:4000' });

const tables = await client.getTables();
const rows = await client.query('SELECT FIRST 10 * FROM your_table');
```

## Env vars

- INFORMIX_HOST / INFORMIX_PORT / INFORMIX_DATABASE / INFORMIX_USER / INFORMIX_PASSWORD / INFORMIX_SERVER
- INFORMIX_SERVICE_PORT (host port, maps to container 3000)
- PORT (container port, default 3000) | HOST (default 0.0.0.0)

## Project layout

- src/server.js — Express server
- src/routes/api.js — API routes
- src/services/DatabaseService.js — service layer + cache
- src/db/connection.js — JDBC bridge
- src/client/InformixClient.js — HTTP client helper
