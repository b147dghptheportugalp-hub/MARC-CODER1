# SHOOTER FPS multiplayer server

## 1. Install
Open PowerShell in this folder and run:

```powershell
npm install
```

## 2. Start the server

```powershell
npm start
```

The game is served at `http://localhost:3000`.

## 3. Configure ngrok once
If this is your first time using ngrok on this computer, save your authtoken:

```powershell
ngrok config add-authtoken YOUR_AUTHTOKEN
```

Run that command in PowerShell and replace `YOUR_AUTHTOKEN` with the token from your ngrok dashboard. Do not commit the token or put it in this repository.

## 4. Expose it with ngrok
Double-click `start-ngrok.bat`, or run it from PowerShell:

```powershell
./start-ngrok.bat
```

The launcher installs dependencies if needed, starts the Node server, waits for `/health`, and then starts ngrok on port `3000`. Use the HTTPS forwarding URL shown by ngrok. The included game automatically uses `wss://` when loaded through HTTPS, so other players can connect to the same server.

## 5. Host it permanently
The included `render.yaml` can deploy this server to Render so your laptop does not need to stay on. In Render, choose **New +**, **Blueprint**, and select the GitHub repository containing this project. Render will use the `poxel-io` folder, run `npm install`, and start the server with `npm start`.

After deployment, replace the Poxel button URL in the main arcade `index.html` with the Render URL. Render's free service may sleep when unused; an always-on service may require a paid plan.

If the arcade stays on Cloudflare Pages, keep the button pointing to `poxel-io/index.html` and add the Render server URL as a `server` query parameter, for example:

```html
<a href="poxel-io/index.html?server=https%3A%2F%2Fyour-service.onrender.com">Play shooter fps</a>
```

Both players must use that same backend URL and join the same mode and map to see each other.

## What this server does
- Serves the supplied `index.html`.
- WebSocket multiplayer on the same port.
- FFA and Team Deathmatch rooms.
- Map-specific rooms.
- Player position/rotation synchronization.
- Server-side player health, damage, kills, deaths and respawns.
- Basic server-side fire-rate and hit validation.
- 32-player server cap.
- `/health` and `/api/status` endpoints.

This is a starter multiplayer server: the original game still handles its local bots, rendering, movement/collision and effects. The server handles real players and PvP state.
