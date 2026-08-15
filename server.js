const WebSocket = require("ws");

const port = process.env.PORT || 10000;
const wss = new WebSocket.Server({ port });

const lobbies = new Map();

function generateCode() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

    let code;

    do {
        code = "";

        for (let i = 0; i < 6; i++) {
            code += chars[Math.floor(Math.random() * chars.length)];
        }
    } while (lobbies.has(code));

    return code;
}

wss.on("connection", (socket) => {
    console.log("PLAYER CONNECTED");

    socket.on("message", (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === "create_lobby") {
                const code = generateCode();

                lobbies.set(code, {
                    host: socket,
                    players: [socket]
                });

                socket.lobbyCode = code;

                socket.send(JSON.stringify({
                    type: "lobby_created",
                    lobby_code: code
                }));

                console.log("LOBBY CREATED:", code);
            }

            if (data.type === "join_lobby") {
                const code = data.lobby_code?.toUpperCase();
                const lobby = lobbies.get(code);

                if (!lobby) {
                    socket.send(JSON.stringify({
                        type: "join_failed",
                        reason: "INVALID_CODE"
                    }));

                    return;
                }

                if (lobby.players.length >= 4) {
                    socket.send(JSON.stringify({
                        type: "join_failed",
                        reason: "LOBBY_FULL"
                    }));

                    return;
                }

                lobby.players.push(socket);
                socket.lobbyCode = code;

                // Báo cho những người đã ở trong lobby
                for (const player of lobby.players) {
                    if (player !== socket && player.readyState === WebSocket.OPEN) {
                        player.send(JSON.stringify({
                            type: "player_joined",
                            lobby_code: code,
                            player_name: data.player_name || "Player"
                        }));
                    }
                }

                // Báo cho người vừa JOIN
                socket.send(JSON.stringify({
                    type: "join_success",
                    lobby_code: code
                }));

                console.log("PLAYER JOINED:", code);
                console.log("PLAYER NAME:", data.player_name || "Player");
            }
        } catch (error) {
            console.log("INVALID MESSAGE");
        }
    });

    socket.on("close", () => {
        console.log("PLAYER DISCONNECTED");
    });
});

console.log("Lobby server running on port", port);
