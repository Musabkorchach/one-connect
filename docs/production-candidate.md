# One Connect Production candidate

Production uses two Render services from this repository: a Next.js frontend and a separate process running the existing Express/Socket.IO server. The existing Testnet process keeps its current origin, database, sessions and settings. Production deliberately uses a dedicated MongoDB credential and the `oneconnect_production` database, with no Testnet data imported.

| Service | Root | Build | Start |
| --- | --- | --- | --- |
| Production frontend | Repository root | `pnpm install --frozen-lockfile && pnpm build` | `pnpm start --hostname 0.0.0.0 --port $PORT` |
| Production API and Socket.IO | Repository root | `pnpm install --prod --frozen-lockfile && npm --prefix server ci --omit=dev` | `cd server && node server.js` |

The API build installs from both lockfiles. Startup loads `server/pstn-config.js`, which imports `lib/connect/pstn-phone.js`. That shared module resolves `libphonenumber-js` from the repository root even when PSTN routes are disabled. Starting with the `server` directory as the service root and running only `npm ci` omits the root dependency.

Frontend variables: `NEXT_PUBLIC_ONECONNECT_DEPLOYMENT=production-review`, `NEXT_PUBLIC_ONECONNECT_API_URL` and `NEXT_PUBLIC_ONECONNECT_WS_URL` set to the dedicated Production backend HTTPS origin, and `ONECONNECT_PRODUCTION_VALIDATION_KEY` set on the frontend service from the Production Console entry. Backend variables: `NODE_ENV=production`, `ONECONNECT_DEPLOYMENT=production`, `ONECONNECT_PRODUCTION_ORIGIN` set to the frontend's exact HTTPS origin, and `ONECONNECT_PRODUCTION_MONGODB_URI` set to credentials restricted to the Production database. Render supplies `PORT`. Use a MongoDB deployment that supports transactions for group ownership and account deletion. Leave Testnet subscription, payment, external mail and PSTN credentials unset.

To test TURN relay, set both `CLOUDFLARE_TURN_TOKEN_ID` and `CLOUDFLARE_TURN_API_TOKEN` on the API service using the dedicated TURN credential pair. The browser obtains short-lived ICE credentials through the authenticated API. Keep the provider token out of the frontend environment.

Render Starter compute for both services starts at USD 14 per month (USD 7 per service), excluding MongoDB, potential TURN usage and any Render usage above included quotas. See [Render pricing](https://render.com/pricing). This is a deployment proposal, and no resources have been created.

The public Pi `/v2/me` response verifies the user's UID but does not document proof that the token belongs to the specific Production app record. Local fixture tests cover session and data isolation, not Pi token provenance.

## Two-phone Pi Browser acceptance plan

Use the same candidate commit on both services and disposable Production test users A and B. Use separate Pi Browser sessions, first on the same network, then with one device on mobile data. Keep a separate Testnet session for comparison.

The combined candidate preserves the Production account routes from PR #57 and adds the verified peer-call protocol from PR #58 on `/calls`. Mainnet sharing uses `https://oneconnect5891.pinet.com`. The verified hosting address remains `https://oneconnect-production-ui.onrender.com`. When either of those exact origins is configured as `ONECONNECT_PRODUCTION_ORIGIN`, the API accepts both for Production HTTP and Socket.IO. Other configured origins, including local test fixtures, remain exact-origin only. The MongoDB URI must explicitly name `oneconnect_production`. The public `/privacy` and `/terms` pages can be opened before signing in.

Both registered Production frontend origins select the original app, isolated account routes and the dedicated Production API even if the frontend build-time review flag is missing. Keep the documented frontend variables for consistent builds and local rehearsals.

1. Verify `GET` and `HEAD /validation-key.txt` on the Production frontend, complete ownership verification on the existing Production record, and open the resulting PiNet link on both devices. Sign in as A and B. Confirm each displayed `@username`, and that profiles, chats, mail and drafts from Testnet are absent.
2. In a private chat from A to B, send text and a small attachment. On both devices, open **Profile → Call safety codes**, show or create the device code, exchange it out of band, and save the other device's code. Place a voice call and confirm **Peer device verified**, audio in both directions, mute/unmute, and hang-up. Place a video call in the opposite direction and check both cameras, camera switching, and cleanup on hang-up. Repeat cross-network to exercise TURN and test a denied microphone/camera permission. Check that a mismatched safety code ends the call before the remote description is applied or outgoing media is attached.
3. Create a group as A and invite B. Before acceptance, verify B cannot read messages or download a copied attachment link. Accept, exchange text and one image/voice/file attachment, verify live updates and download, then transfer ownership to B. Verify A loses owner controls. Remove A as B; verify A loses write and attachment access and stops receiving group events. Test invitation decline and revocation with a second group.
4. Send internal mail, save a test invoice draft and reload both apps. Verify the data stays with its owner. Confirm external mail, PSTN, group calls, Mainnet payment and subscription actions are unavailable.
5. In Production, delete disposable user A using the existing confirmation flow. Verify canceled confirmation preserves the account; on confirmation check Pi reauthentication, immediate session and socket revocation, and that signing in again after cleanup starts with no old private data. Confirm B's group and the separate Testnet account remain intact.

Record device, network, candidate SHA and actual results. Local signaling tests do not certify audio/video capture, rendering or TURN traversal inside Pi Browser.

See the [optional Testnet data migration proposal](production-data-migration.md) for eligibility and rehearsal requirements.
