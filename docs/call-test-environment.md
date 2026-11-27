# Isolated phone call test

This is a local deployment recipe for review. It defines no production changes and carries no secrets. The test interface uses the existing verified one-to-one call session and signaling handlers. It uses two synthetic accounts and does not exercise Pi sign-in, App Studio embedding, PSTN, groups, payments or mail.

## Build and service settings

Review `render.call-test.yaml` as a separate Blueprint path for two dedicated services. The proposed frontend and API origins are `https://oneconnect-verified-calls-ui.onrender.com` and `https://oneconnect-verified-calls-api.onrender.com`. Confirm the assigned origins before building and use the same reviewed source revision on both services. For a local rehearsal, use distinct loopback ports such as frontend `http://127.0.0.1:3200` and backend `http://127.0.0.1:3201`. The hosted configuration requires HTTPS and the dedicated service hostname. Open the HTTPS frontend directly in Pi Browser for device tests.

| Service | Variable | Value or purpose |
| --- | --- | --- |
| Frontend | `NEXT_PUBLIC_CALL_TEST_MODE` | `1` in the dedicated frontend build and runtime |
| Frontend | `NEXT_PUBLIC_CALL_TEST_API_URL`, `NEXT_PUBLIC_CALL_TEST_WS_URL` | Set both to the explicit test API HTTP(S) origin. Socket.IO negotiates the transport from this origin. |
| Frontend | `NEXT_PUBLIC_CALL_TEST_BUILD_ID` | Shared nonsecret build label, 8–64 letters, digits, underscores or hyphens. Use a new label for every reviewed revision. This also becomes the Next.js build ID. |
| Backend | `ONECONNECT_CALL_TEST` | `1`, with the dedicated command `node call-test-server.js` from `server` |
| Backend | `CALL_TEST_BUILD_ID` | Exactly the frontend build ID. Verify that the reviewed source revision used to build both components matches, too. |
| Backend | `CALL_TEST_FRONTEND_ORIGIN` | Exact test frontend origin, with no slash or path |
| Backend | `CALL_TEST_DATABASE` | New database name matching `oneconnect_call_test_[a-z0-9]{6,24}` |
| Backend | `CALL_TEST_MONGODB_URI` | Secret URI for a separate MongoDB deployment, with the test database in the URI path and a credential scoped to that database. Leave `MONGODB_URI` unset. |
| Backend | `CALL_TEST_CODE_A`, `CALL_TEST_CODE_B` | Two distinct 32-byte random values encoded as unpadded base64url. Generate independently and share only the corresponding code with each tester. Use accounts `calltest-a` and `calltest-b`. |
| Backend | `CLOUDFLARE_TURN_TOKEN_ID`, `CLOUDFLARE_TURN_API_TOKEN` | Dedicated Cloudflare Realtime TURN credential pair, required for hosted testing. Local tests can omit both to use STUN only. |
| Backend | `PORT` | Supplied by Render. Set explicitly for a loopback rehearsal. |

The backend exposes health, test login, logout and ICE configuration over HTTP. The Socket.IO handshake checks the exact origin and the shared build ID. Only one-to-one call events reach their handlers in test mode. Synthetic bearer tokens are issued in memory, expire after two hours and are revoked when the same account signs in again. The frontend checks health and protocol before transmitting the test code. Keep the test origin distinct so the device signing keys and verified peer codes live in separate browser storage. The shared build ID detects configuration mismatches and is not a content attestation.

The test backend opens the explicitly named database and rejects normal-service MongoDB configuration before connecting. Supply database credentials restricted to the disposable test database. Keep the test services on separate environment settings and omit Pi, Mailgun and Twilio credentials. Frontend API routes return 404 in test mode. The frontend restricts network destinations via CSP and blocks embedding. The test entry point and explicit mode are both required for synthetic login.

## Local checks

1. Install dependencies with `pnpm install --frozen-lockfile` at the root and `npm ci` under `server`. Put the backend variables in the test process environment. Use a disposable loopback MongoDB, then start the dedicated backend with `node call-test-server.js`.
2. Put the frontend variables in a separate process environment. Run `pnpm build` and `pnpm start --hostname 127.0.0.1 --port 3200`. Confirm the same build label in the UI and at the API's `/health`.
3. Run `node --test tests/*.test.cjs`. Set `ONE_CONNECT_TEST_MONGOD` to a local mongod executable to include the HTTP and Socket.IO integration fixture. The fixture starts its own loopback MongoDB and checks that its process ID matches before starting the API.

## Phone acceptance

Follow [the Android and iPhone checklist](verified-peer-calls-review.md). Sign in with the two synthetic accounts, create the device keys and verify them out of band. Run ordinary voice and video first. Next, select **Force TURN relay** on both devices before dialing and use **Read ICE statistics** during the connected call. Verify that the chosen candidate pair contains a relay candidate and that the media flows in both directions. The display excludes addresses, candidate credentials and keys. If Pi Browser does not expose a selected pair, mark TURN evidence unavailable. Passing the local fixture does not establish compatibility on Android or iPhone.

In the confirmed Android and iPhone round, the updated diagnostics showed the selected ICE pair as connected with relay candidates on both sides. The call worked across two different networks. Android sometimes needed **Play remote media** before audio started. See the [review](verified-peer-calls-review.md) for the full phone results and pending checks. Treat a nominated pair without a selected-pair reference as an unconfirmed hint.

## Original-app integration with Pi sign-in

This mode uses the original app and the regular server entry point. Use an existing, dedicated Pi Testnet app record whose verified HTTPS app URL matches the test frontend. Confirm that both testers can open it directly in Pi Browser. Until that record is confirmed, use the local fixture to verify isolation and leave the live Pi check pending.

| Process | Settings |
| --- | --- |
| Frontend build | Set `NEXT_PUBLIC_CALL_INTEGRATION_MODE=1` and set both `NEXT_PUBLIC_CALL_INTEGRATION_API_URL` and `NEXT_PUBLIC_CALL_INTEGRATION_WS_URL` to the same explicit test API HTTP(S) origin. Omit `NEXT_PUBLIC_CALL_TEST_MODE`. |
| Backend | Start `node server.js` with `ONECONNECT_CALL_INTEGRATION=1`, `CALL_TEST_FRONTEND_ORIGIN`, `CALL_TEST_DATABASE`, and `CALL_TEST_MONGODB_URI`. The URI must name the dedicated database. Omit `ONECONNECT_CALL_TEST`, `MONGODB_URI`, and both synthetic account codes. Use the existing credential scoped to the test database. |

The build embeds both API destinations and rejects ordinary service origins. The API limits HTTP and Socket.IO to the configured frontend origin and checks the database name before connecting. `GET /health` identifies the integration mode without requiring a browser origin. Synthetic login, subscriptions and payments, PSTN, and external mail are unavailable. Pi sign-in requests username access and verifies the access token through the usual `/v2/me` path. Local tests substitute Pi's response and exercise the real local HTTP, Socket.IO and MongoDB paths.

For the phone check, sign in with two real Pi accounts, open **Profile → Call safety codes**, exchange and save the device codes, then make a voice call. Confirm bidirectional audio and **Peer device verified**. Before any authorized temporary switch, record the currently deployed test revisions and settings. To revert, restore that frontend/backend pair and its settings, then verify the shared test build label. Keep the existing database credential and device keys.
