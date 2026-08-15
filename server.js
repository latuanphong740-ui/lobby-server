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

            // =========================
            // CREATE LOBBY
            // =========================
            if (data.type === "create_lobby") {
                const code = generateCode();

                lobbies.set(code, {
                    host: socket,

                    players: [
                        {
                            socket: socket,
                            name: data.player_name || "Player",
                            role: "HOST"
                        }
                    ]
                });

                socket.lobbyCode = code;
                socket.playerName = data.player_name || "Player";
                socket.role = "HOST";

                socket.send(JSON.stringify({
                    type: "lobby_created",
                    lobby_code: code,
                    player_name: socket.playerName,
                    role: "HOST"
                }));

                console.log("LOBBY CREATED:", code);
                console.log("HOST:", socket.playerName);
            }


            // =========================
            // JOIN LOBBY
            // =========================
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

                const playerName = data.player_name || "Player";

                // =========================
                // THÊM PLAYER
                // =========================
                lobby.players.push({
                    socket: socket,
                    name: playerName,
                    role: "PLAYER"
                });

                socket.lobbyCode = code;
                socket.playerName = playerName;
                socket.role = "PLAYER";


                // =========================
                // BÁO CHO NGƯỜI ĐÃ Ở TRONG LOBBY
                // =========================
                for (const player of lobby.players) {
                    if (
                        player.socket !== socket &&
                        player.socket.readyState === WebSocket.OPEN
                    ) {
                        player.socket.send(JSON.stringify({
                            type: "player_joined",
                            lobby_code: code,
                            player_name: playerName,
                            role: "PLAYER"
                        }));
                    }
                }


                // =========================
                // GỬI DANH SÁCH CHO NGƯỜI VỪA JOIN
                // =========================
                const playersList = lobby.players.map((player) => {
                    return {
                        name: player.name,
                        role: player.role
                    };
                });

                socket.send(JSON.stringify({
                    type: "join_success",
                    lobby_code: code,
                    players: playersList
                }));

                console.log("PLAYER JOINED:", code);
                console.log("PLAYER NAME:", playerName);
            }
        } catch (error) {
            console.log("INVALID MESSAGE");
            console.log(error);
        }
    });


    // =========================
    // DISCONNECT
    // =========================
    socket.on("close", () => {
        console.log("PLAYER DISCONNECTED");
    });
});

console.log("Lobby server running on port", port);
