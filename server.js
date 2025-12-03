/* OBSIDIAN BACKEND v6.2 (Native Math) */
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

let users = {}, drivers = {}, activeRides = {};

io.on('connection', (socket) => {
    console.log(`[NET] ${socket.id}`);

    socket.on('auth_handshake', (data) => {
        users[socket.id] = { ...data, socketId: socket.id, lat: 0, lng: 0 };
        if (data.role === 'driver') { drivers[socket.id] = users[socket.id]; drivers[socket.id].status = 'offline'; }
        if (data.role === 'admin') { socket.join('admin_room'); socket.emit('admin_fleet_sync', Object.values(drivers)); }
    });

    socket.on('telemetry_update', (coords) => {
        if (users[socket.id]) {
            users[socket.id].location = coords;
            if (drivers[socket.id]) { drivers[socket.id].location = coords; drivers[socket.id].lastUpdate = Date.now(); }
            io.to('admin_room').emit('god_map_update', { id: socket.id, role: users[socket.id].role, ...coords, status: drivers[socket.id]?.status });
        }
    });

    socket.on('driver_toggle_status', (isOnline) => {
        if (drivers[socket.id]) {
            drivers[socket.id].status = isOnline ? 'online' : 'offline';
            io.to('admin_room').emit('admin_log', { time: new Date().toLocaleTimeString(), msg: `Driver ${drivers[socket.id].name} is ${drivers[socket.id].status}`, type: isOnline?'success':'warn' });
        }
    });

    socket.on('request_ride', (req) => {
        const driver = Object.values(drivers).find(d => d.status === 'online');
        if (driver) {
            const rideId = uuidv4();
            activeRides[rideId] = { id: rideId, client: socket.id, driver: driver.socketId, status: 'pending', ...req };
            io.to(driver.socketId).emit('ride_offer', { rideId: rideId, ...req });
        } else {
            socket.emit('ride_error', { msg: "Sem motoristas disponíveis." });
        }
    });

    socket.on('driver_accept_ride', (rideId) => {
        const ride = activeRides[rideId];
        if (ride) {
            ride.status = 'active';
            if(drivers[socket.id]) drivers[socket.id].status = 'busy';
            io.to(ride.client).emit('ride_matched', { driverName: drivers[socket.id].name, carModel: "BMW 320i", plate: "OBS-2024", eta: 4 });
            io.to('admin_room').emit('admin_log', { msg: `Corrida iniciada: ${drivers[socket.id].name}`, type: 'info' });
        }
    });

    socket.on('sos_alert', (data) => {
        io.to('admin_room').emit('admin_log', { msg: `ALERTA SOS: ${data.user?.name}`, type: 'error' });
    });

    socket.on('disconnect', () => {
        if (drivers[socket.id]) delete drivers[socket.id];
        delete users[socket.id];
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`>>> SERVER ONLINE PORT ${PORT}`));