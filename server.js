const express = require('express');
const http = require('node:http');
const { Server } = require('socket.io');
const appConfig = require('./app/Config/App');
const GameService = require('./app/Models/GameService');
const GameSocketController = require('./app/Controllers/GameSocketController');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 6e6 });

app.use(express.static(appConfig.publicDirectory));
app.get('/', (req, res) => res.sendFile(appConfig.indexView));

new GameSocketController(io, new GameService()).register();

server.listen(appConfig.port, () => console.log(`Impostor game running on port ${appConfig.port}`));
