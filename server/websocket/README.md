# Flip Battle WebSocket Service

This folder contains the CloudBase Run / WeChat Cloud Hosting WebSocket service for Flip Battle.

The mini game package must not include this folder. Keep `server/` in `project.config.json` pack ignores.

## Local Run

```bash
cd server/websocket
npm install
npm start
```

Health check:

```bash
curl http://127.0.0.1/health
```

Local WebSocket endpoint:

```text
ws://127.0.0.1/ws
```

If port 80 is unavailable:

```bash
set PORT=3000
npm start
```

Then use:

```text
http://127.0.0.1:3000/health
ws://127.0.0.1:3000/ws
```

## Cloud Hosting

Recommended first deployment:

1. Use the existing WeChat Cloud Hosting service or create a new service.
2. Copy this folder as the service source.
3. Deploy with Node.js 18+.
4. Keep minimum instances = 1 and maximum instances = 1 for the first version.
5. Set health check path to `/health`.
6. WebSocket path is `/ws`.

The first version stores rooms in memory. Multiple instances can split players into different processes, so do not scale out until a shared state store is added.

## Message Types

Implemented base messages:

- `hello`
- `ping` / `pong`
- `joinRoom`
- `leaveRoom`
- `playerReady`
- `difficultyChange`
- `gameStart`
- `flipCard`
- `turnResult`
- `gameStateUpdate`
- `requestSnapshot`
- `broadcast`

The current client integration keeps cloud sync as the default fallback. WebSocket mode should only be enabled by setting `SYNC_MODE` to `websocket` in `js/utils/config.js`.
