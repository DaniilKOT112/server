require("dotenv").config();

const express = require('express');
const cors = require('cors');
const http = require('http')
const {initWebSocket} = require('./src/services/websocket')

const authRoutes = require('./src/routes/authRoutes');
const fundRoutes = require('./src/routes/fundRoutes');
const networkRoutes = require('./src/routes/networkRoutes');
const shelterRoutes = require('./src/routes/shelterRoutes');
const userRoutes = require('./src/routes/userRoutes');
const vaccineRoutes = require('./src/routes/vaccineRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const petsRoutes = require('./src/routes/petsRoutes');
const feedRoutes = require('./src/routes/feedRoutes');
const foundHomeRoutes = require('./src/routes/foundHomeRoutes');
const examinationRoutes = require('./src/routes/examRoutes');
const vaccinationRoutes = require('./src/routes/vaccinationRoutes');

const app = express();
app.use(express.json());
app.use(cors());

app.use('/auth', authRoutes);
app.use('/fund', fundRoutes);
app.use('/network', networkRoutes);
app.use('/shelter', shelterRoutes);
app.use('/user', userRoutes);
app.use('/vaccine', vaccineRoutes);
app.use('/admin', adminRoutes);
app.use('/pets', petsRoutes);
app.use('/feed', feedRoutes);
app.use('/home', foundHomeRoutes);
app.use('/exam', examinationRoutes);
app.use('/vaccination', vaccinationRoutes);

const server = http.createServer(app)

initWebSocket(server)

const port = process.env.PORT_SERVER;

server.listen(port, ()=> {
    console.log(`Сервер работает на порте ${port}`);
})

