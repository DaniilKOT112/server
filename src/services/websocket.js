const WebSocket = require("ws");

let wss;

function initWebSocket(server) {
    wss = new WebSocket.Server({server})

    wss.on('connection', (ws) => {
        console.log('Установлено новое соединение!');

        ws.on('message', (message) => {
            console.log(`Получено новое сообщение!', ${message}`);
        })

        ws.on('close', () => {
            console.log('Соединение закрыто!');
        })
    })
}

function broadcast(data){
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    })
}

module.exports = {initWebSocket, broadcast};