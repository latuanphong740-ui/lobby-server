```javascript
const WebSocket = require("ws");

const port = process.env.PORT || 10000;
const wss = new WebSocket.Server({ port });

const lobbies = new Map();


// ==================================================
// GENERATE LOBBY CODE
// ==================================================

function generateCode() {

    const chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

    let code;

    do {

        code = "";

        for (let i = 0; i < 6; i++) {

            code += chars[
                Math.floor(
                    Math.random() * chars.length
                )
            ];

        }

    } while (lobbies.has(code));

    return code;
}


// ==================================================
// BROADCAST LOBBY
// ==================================================

function broadcastLobby(lobby, code) {

    const playersList =
        lobby.players.map((player) => {

            return {

                name: player.name,

                role: player.role,

                is_host: player.is_host

            };

        });


    const message =
        JSON.stringify({

            type: "lobby_update",

            lobby_code: code,

            players: playersList

        });


    for (const player of lobby.players) {

        if (
            player.socket.readyState ===
            WebSocket.OPEN
        ) {

            player.socket.send(message);

        }

    }

}


// ==================================================
// CONNECTION
// ==================================================

wss.on("connection", (socket) => {

    console.log(
        "PLAYER CONNECTED"
    );


    // ==================================================
    // MESSAGE
    // ==================================================

    socket.on("message", (message) => {

        try {

            const data =
                JSON.parse(message);


            // ==================================================
            // CREATE LOBBY
            // ==================================================

            if (
                data.type ===
                "create_lobby"
            ) {

                const code =
                    generateCode();


                const playerName =
                    data.player_name ||
                    "Player";


                const hostPlayer = {

                    socket: socket,

                    name: playerName,

                    role: "PLAYER",

                    is_host: true

                };


                lobbies.set(
                    code,
                    {

                        host: socket,

                        players: [
                            hostPlayer
                        ]

                    }
                );


                socket.lobbyCode =
                    code;

                socket.playerName =
                    playerName;

                socket.role =
                    "PLAYER";

                socket.isHost =
                    true;


                socket.send(
                    JSON.stringify({

                        type:
                            "lobby_created",

                        lobby_code:
                            code,

                        player_name:
                            playerName,

                        role:
                            "PLAYER",

                        is_host:
                            true

                    })
                );


                console.log(
                    "LOBBY CREATED:",
                    code
                );

                console.log(
                    "HOST:",
                    playerName
                );

            }


            // ==================================================
            // JOIN LOBBY
            // ==================================================

            if (
                data.type ===
                "join_lobby"
            ) {

                const code =
                    data.lobby_code
                        ?.toUpperCase();


                const lobby =
                    lobbies.get(code);


                // ------------------------------
                // INVALID CODE
                // ------------------------------

                if (!lobby) {

                    socket.send(
                        JSON.stringify({

                            type:
                                "join_failed",

                            reason:
                                "INVALID_CODE"

                        })
                    );

                    return;

                }


                // ------------------------------
                // LOBBY FULL
                // ------------------------------

                if (
                    lobby.players.length >=
                    4
                ) {

                    socket.send(
                        JSON.stringify({

                            type:
                                "join_failed",

                            reason:
                                "LOBBY_FULL"

                        })
                    );

                    return;

                }


                const playerName =
                    data.player_name ||
                    "Player";


                const newPlayer = {

                    socket: socket,

                    name: playerName,

                    role: "PLAYER",

                    is_host: false

                };


                lobby.players.push(
                    newPlayer
                );


                socket.lobbyCode =
                    code;

                socket.playerName =
                    playerName;

                socket.role =
                    "PLAYER";

                socket.isHost =
                    false;


                // ------------------------------
                // BÁO PLAYER JOIN
                // ------------------------------

                for (
                    const player
                    of lobby.players
                ) {

                    if (
                        player.socket !==
                        socket &&
                        player.socket.readyState ===
                        WebSocket.OPEN
                    ) {

                        player.socket.send(
                            JSON.stringify({

                                type:
                                    "player_joined",

                                lobby_code:
                                    code,

                                player_name:
                                    playerName,

                                role:
                                    "PLAYER",

                                is_host:
                                    false

                            })
                        );

                    }

                }


                // ------------------------------
                // GỬI DANH SÁCH
                // ------------------------------

                const playersList =
                    lobby.players.map(
                        (player) => {

                            return {

                                name:
                                    player.name,

                                role:
                                    player.role,

                                is_host:
                                    player.is_host

                            };

                        }
                    );


                socket.send(
                    JSON.stringify({

                        type:
                            "join_success",

                        lobby_code:
                            code,

                        players:
                            playersList

                    })
                );


                console.log(
                    "PLAYER JOINED:",
                    code
                );

                console.log(
                    "PLAYER NAME:",
                    playerName
                );


                broadcastLobby(
                    lobby,
                    code
                );

            }


            // ==================================================
            // CHANGE ROLE
            // HOST CÓ THỂ ĐỔI BẤT KỲ AI
            // KỂ CẢ CHÍNH HOST
            // ==================================================

            if (
                data.type ===
                "change_role"
            ) {

                const code =
                    socket.lobbyCode;


                const lobby =
                    lobbies.get(code);


                if (!lobby) {

                    socket.send(
                        JSON.stringify({

                            type:
                                "role_change_failed",

                            reason:
                                "NOT_IN_LOBBY"

                        })
                    );

                    return;

                }


                // ------------------------------
                // CHỈ HOST
                // ------------------------------

                if (
                    socket !==
                    lobby.host
                ) {

                    socket.send(
                        JSON.stringify({

                            type:
                                "role_change_failed",

                            reason:
                                "NOT_HOST"

                        })
                    );

                    return;

                }


                const targetName =
                    data.player_name;


                const newRole =
                    data.role;


                // ------------------------------
                // KIỂM TRA ROLE
                // ------------------------------

                if (
                    newRole !== "PLAYER" &&
                    newRole !== "SPECTATOR"
                ) {

                    socket.send(
                        JSON.stringify({

                            type:
                                "role_change_failed",

                            reason:
                                "INVALID_ROLE"

                        })
                    );

                    return;

                }


                // ------------------------------
                // TÌM PLAYER
                // ------------------------------

                const targetPlayer =
                    lobby.players.find(
                        (player) =>
                            player.name ===
                            targetName
                    );


                if (!targetPlayer) {

                    socket.send(
                        JSON.stringify({

                            type:
                                "role_change_failed",

                            reason:
                                "PLAYER_NOT_FOUND"

                        })
                    );

                    return;

                }


                // ------------------------------
                // ĐỔI ROLE
                // ------------------------------

                targetPlayer.role =
                    newRole;


                targetPlayer.socket.role =
                    newRole;


                console.log(
                    "ROLE CHANGED:",
                    targetPlayer.name,
                    "->",
                    newRole
                );


                broadcastLobby(
                    lobby,
                    code
                );

            }


            // ==================================================
            // KICK PLAYER
            //
            // HOST ĐƯỢC KICK:
            //
            // - PLAYER
            // - SPECTATOR
            // - CHÍNH HOST
            // ==================================================

            if (
                data.type ===
                "kick_player"
            ) {

                const code =
                    socket.lobbyCode;


                const lobby =
                    lobbies.get(code);


                // ------------------------------
                // KHÔNG CÓ LOBBY
                // ------------------------------

                if (!lobby) {

                    socket.send(
                        JSON.stringify({

                            type:
                                "kick_failed",

                            reason:
                                "NOT_IN_LOBBY"

                        })
                    );

                    return;

                }


                // ------------------------------
                // CHỈ HOST ĐƯỢC KICK
                // ------------------------------

                if (
                    socket !==
                    lobby.host
                ) {

                    socket.send(
                        JSON.stringify({

                            type:
                                "kick_failed",

                            reason:
                                "NOT_HOST"

                        })
                    );

                    return;

                }


                const targetName =
                    data.player_name;


                // ------------------------------
                // TÌM NGƯỜI BỊ KICK
                // ------------------------------

                const targetPlayer =
                    lobby.players.find(
                        (player) =>
                            player.name ===
                            targetName
                    );


                if (!targetPlayer) {

                    socket.send(
                        JSON.stringify({

                            type:
                                "kick_failed",

                            reason:
                                "PLAYER_NOT_FOUND"

                        })
                    );

                    return;

                }


                const targetSocket =
                    targetPlayer.socket;


                const targetIsHost =
                    targetSocket ===
                    lobby.host;


                console.log(
                    "KICK REQUEST:",
                    targetPlayer.name
                );


                // ==================================================
                // HOST KICK CHÍNH MÌNH
                // ==================================================

                if (targetIsHost) {

                    console.log(
                        "HOST IS KICKING HIMSELF"
                    );


                    // Xóa Host cũ khỏi danh sách

                    lobby.players =
                        lobby.players.filter(
                            (player) =>
                                player.socket !==
                                targetSocket
                        );


                    // ------------------------------------------------
                    // CÒN NGƯỜI -> CHUYỂN HOST
                    // ------------------------------------------------

                    if (
                        lobby.players.length >
                        0
                    ) {

                        const newHost =
                            lobby.players[0];


                        // Host mới

                        newHost.is_host =
                            true;


                        newHost.socket.isHost =
                            true;


                        lobby.host =
                            newHost.socket;


                        console.log(
                            "NEW HOST:",
                            newHost.name
                        );


                        // ------------------------------
                        // GỬI CHO HOST CŨ
                        // ------------------------------

                        if (
                            targetSocket.readyState ===
                            WebSocket.OPEN
                        ) {

                            targetSocket.send(
                                JSON.stringify({

                                    type:
                                        "kicked_from_lobby",

                                    reason:
                                        "HOST_LEFT"

                                })
                            );

                        }


                        // Xóa thông tin lobby
                        // khỏi socket cũ

                        targetSocket.lobbyCode =
                            null;

                        targetSocket.isHost =
                            false;


                        // ------------------------------
                        // GỬI UPDATE
                        // ------------------------------

                        broadcastLobby(
                            lobby,
                            code
                        );

                    }


                    // ------------------------------------------------
                    // KHÔNG CÒN AI -> XÓA LOBBY
                    // ------------------------------------------------

                    else {

                        lobbies.delete(
                            code
                        );


                        if (
                            targetSocket.readyState ===
                            WebSocket.OPEN
                        ) {

                            targetSocket.send(
                                JSON.stringify({

                                    type:
                                        "kicked_from_lobby",

                                    reason:
                                        "LOBBY_EMPTY"

                                })
                            );

                        }


                        targetSocket.lobbyCode =
                            null;

                        targetSocket.isHost =
                            false;


                        console.log(
                            "LOBBY DELETED:",
                            code
                        );

                    }


                    return;

                }


                // ==================================================
                // KICK NGƯỜI KHÁC
                // ==================================================

                lobby.players =
                    lobby.players.filter(
                        (player) =>
                            player.socket !==
                            targetSocket
                    );


                // ------------------------------
                // GỬI KICKED
                // ------------------------------

                if (
                    targetSocket.readyState ===
                    WebSocket.OPEN
                ) {

                    targetSocket.send(
                        JSON.stringify({

                            type:
                                "kicked_from_lobby",

                            reason:
                                "KICKED_BY_HOST"

                        })
                    );

                }


                targetSocket.lobbyCode =
                    null;

                targetSocket.isHost =
                    false;


                // ------------------------------
                // UPDATE CHO NGƯỜI CÒN LẠI
                // ------------------------------

                broadcastLobby(
                    lobby,
                    code
                );


                console.log(
                    "PLAYER KICKED:",
                    targetPlayer.name
                );

            }

        }

        catch (error) {

            console.log(
                "INVALID MESSAGE"
            );

            console.log(error);

        }

    });


    // ==================================================
    // DISCONNECT
    // ==================================================

    socket.on("close", () => {

        console.log(
            "PLAYER DISCONNECTED"
        );


        const code =
            socket.lobbyCode;


        if (!code) {

            return;

        }


        const lobby =
            lobbies.get(code);


        if (!lobby) {

            return;

        }


        // ==================================================
        // HOST DISCONNECT
        // ==================================================

        if (
            lobby.host ===
            socket
        ) {

            // Nếu Host tự đóng kết nối,
            // chuyển Host cho người đầu tiên còn lại.

            lobby.players =
                lobby.players.filter(
                    (player) =>
                        player.socket !==
                        socket
                );


            if (
                lobby.players.length >
                0
            ) {

                const newHost =
                    lobby.players[0];


                newHost.is_host =
                    true;


                newHost.socket.isHost =
                    true;


                lobby.host =
                    newHost.socket;


                console.log(
                    "HOST DISCONNECTED."
                );

                console.log(
                    "NEW HOST:",
                    newHost.name
                );


                broadcastLobby(
                    lobby,
                    code
                );

            }

            else {

                lobbies.delete(
                    code
                );


                console.log(
                    "LOBBY DELETED:",
                    code
                );

            }


            return;

        }


        // ==================================================
        // PLAYER / SPECTATOR DISCONNECT
        // ==================================================

        lobby.players =
            lobby.players.filter(
                (player) =>
                    player.socket !==
                    socket
            );


        broadcastLobby(
            lobby,
            code
        );

    });

});


console.log(
    "Lobby server running on port",
    port
);
```
