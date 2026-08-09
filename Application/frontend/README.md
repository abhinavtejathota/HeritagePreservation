# Frontend (Vite)

Fast Vite build replaces Create React App (`react-scripts`).

```bash
npm install
npm start          # Vite dev server
npm run build      # → build/ (served by Express on :8175)
```

Env (`.env` / `.env.example`): `REACT_APP_API_URL`, `REACT_APP_CHA_URL`, `REACT_APP_SIM_URL`.

Production output directory stays `build/` so `Application/backend/server` does not need path changes.
