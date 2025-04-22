const WebSocket = require("ws");

const wss = new WebSocket.Server({port:8080});

wss.on('connection', (ws) => {
    console.log('Установлено новое соединение!');

    ws.on('message', (message) => {
        console.log(`Получено новое сообщение!', ${message}`);
    })

    ws.on('close', () => {
        console.log('Соединение закрыто!');
    })
})

const broadcast = (data) => {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    })
}

module.exports = {broadcast};