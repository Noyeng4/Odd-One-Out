# Impostor

A online browser-based multiplayer word and picture game powered by Node.js, Express, and Socket.IO.

## Run locally

```sh
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000). Set `PORT` to use another port.

Run the game service tests with:

```sh
npm test
```

## Project structure

The folders follow CodeIgniter 4 conventions where they fit this Node.js application. This is a Node.js project, not a PHP/CodeIgniter installation.

```text
app/
  Config/
    App.js                       # Application paths and runtime settings
  Controllers/
    GameSocketController.js      # Socket.IO event adapter
  Exceptions/
    GameError.js                 # Expected, user-facing game errors
  Models/
    GameService.js               # Room state and game rules
  Views/
    index.html                   # HTML shell returned for the home route
public/
  css/
    styles.css
  js/
    app.js
    models/
    views/
    viewmodels/
server.js                         # Node.js application entry point
tests/
  unit/
    GameService.test.js
writable/
  cache/
  debugbar/
  logs/
  session/
  uploads/
```

The frontend follows MVVM: browser-side models, views, and viewmodels stay under `public/js` because they must be served to the browser. `writable/` mirrors the usual CI4 runtime-storage area; generated files there are ignored by Git.

Dependencies remain managed by npm in `package.json` and `package-lock.json`. `node_modules/` is intentionally not rearranged; VS Code hides it from Explorer and search through `.vscode/settings.json`.
