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


// =========================
// GỬI DANH SÁCH LOBBY
// CHO TẤT CẢ NGƯỜI
// =========================
function broadcastLobby(lobby, code) {

    const playersList = lobby.players.map((player) => {
        return {
            name: player.name,
            role: player.role
        };
    });

    const message = JSON.stringify({
        type: "lobby_update",
        lobby_code: code,
        players: playersList
    });

    for (const player of lobby.players) {

        if (player.socket.readyState === WebSocket.OPEN) {
            player.socket.send(message);
        }

    }
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

                const playerName = data.player_name || "Player";

                lobbies.set(code, {

                    host: socket,

                    players: [
                        {
                            socket: socket,
                            name: playerName,
                            role: "HOST"
                        }
                    ]

                });

                socket.lobbyCode = code;
                socket.playerName = playerName;
                socket.role = "HOST";


                socket.send(JSON.stringify({

                    type: "lobby_created",

                    lobby_code: code,

                    player_name: playerName,

                    role: "HOST"

                }));


                console.log("LOBBY CREATED:", code);
                console.log("HOST:", playerName);

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


            // =========================
            // CHANGE ROLE
            // PLAYER <-> SPECTATOR
            // =========================
            if (data.type === "change_role") {

                const code = socket.lobbyCode;

                const lobby = lobbies.get(code);


                if (!lobby) {

                    socket.send(JSON.stringify({

                        type: "role_change_failed",

                        reason: "NOT_IN_LOBBY"

                    }));

                    return;
                }


                // =========================
                // CHỈ HOST ĐƯỢC ĐỔI ROLE
                // =========================
                if (socket !== lobby.host) {

                    socket.send(JSON.stringify({

                        type: "role_change_failed",

                        reason: "NOT_HOST"

                    }));

                    return;
                }


                const targetName = data.player_name;

                const newRole = data.role;


                // =========================
                // CHỈ CHO PHÉP 2 ROLE
                // =========================
                if (
                    newRole !== "PLAYER" &&
                    newRole !== "SPECTATOR"
                ) {

                    socket.send(JSON.stringify({

                        type: "role_change_failed",

                        reason: "INVALID_ROLE"

                    }));

                    return;
                }


                // =========================
                // TÌM NGƯỜI CẦN ĐỔI
                // =========================
                const targetPlayer = lobby.players.find(

                    (player) => player.name === targetName

                );


                if (!targetPlayer) {

                    socket.send(JSON.stringify({

                        type: "role_change_failed",

                        reason: "PLAYER_NOT_FOUND"

                    }));

                    return;
                }


                // =========================
                // KHÔNG CHO ĐỔI HOST
                // =========================
                if (targetPlayer.socket === lobby.host) {

                    socket.send(JSON.stringify({

                        type: "role_change_failed",

                        reason: "CANNOT_CHANGE_HOST"

                    }));

                    return;
                }


                // =========================
                // ĐỔI ROLE
                // =========================
                targetPlayer.role = newRole;

                targetPlayer.socket.role = newRole;


                console.log(
                    "ROLE CHANGED:",
                    targetPlayer.name,
                    "->",
                    newRole
                );


                // =========================
                // ĐỒNG BỘ CHO TẤT CẢ
                // =========================
                broadcastLobby(lobby, code);

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
