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
// SET HOST
// ==================================================

function setHost(lobby, newHost) {

    if (!newHost) {
        return;
    }

    lobby.host = newHost.socket;

    for (const player of lobby.players) {

        const isHost =
            player.socket === newHost.socket;

        player.is_host = isHost;
        player.socket.isHost = isHost;
    }

    console.log(
        "HOST UPDATED:",
        newHost.name
    );
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
                // GỬI DANH SÁCH CHO NGƯỜI JOIN
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
                    lobby.host !==
                    socket
                ) {

                    console.log(
                        "CHANGE ROLE DENIED:",
                        socket.playerName,
                        "IS NOT HOST"
                    );

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
                // HOST KHÔNG MẤT QUYỀN HOST
                // ------------------------------

                if (
                    targetPlayer.socket ===
                    lobby.host &&
                    newRole === "SPECTATOR"
                ) {

                    console.log(
                        "HOST CANNOT BECOME SPECTATOR"
                    );

                    socket.send(
                        JSON.stringify({

                            type:
                                "role_change_failed",

                            reason:
                                "HOST_CANNOT_BE_SPECTATOR"

                        })
                    );

                    return;
                }


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
            // ==================================================

            if (
                data.type ===
                "kick_player"
            ) {

                const code =
                    socket.lobbyCode;


                const lobby =
                    lobbies.get(code);


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


                // ==================================================
                // KIỂM TRA HOST THỰC TẾ
                // ==================================================

                if (
                    lobby.host !==
                    socket
                ) {

                    console.log(
                        "KICK DENIED:",
                        socket.playerName,
                        "IS NOT CURRENT HOST"
                    );

                    console.log(
                        "CURRENT HOST:",
                        lobby.host
                            ? lobby.host.playerName
                            : "NONE"
                    );

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


                // ==================================================
                // HOST KHÔNG ĐƯỢC KICK CHÍNH MÌNH
                // ==================================================

                if (
                    targetSocket ===
                    lobby.host
                ) {

                    socket.send(
                        JSON.stringify({

                            type:
                                "kick_failed",

                            reason:
                                "CANNOT_KICK_HOST"

                        })
                    );

                    return;
                }


                console.log(
                    "KICK REQUEST:",
                    socket.playerName,
                    "->",
                    targetPlayer.name
                );


                // ==================================================
                // XÓA PLAYER
                // ==================================================

                lobby.players =
                    lobby.players.filter(
                        (player) =>
                            player.socket !==
                            targetSocket
                    );


                // ==================================================
                // XÓA THÔNG TIN TARGET
                // ==================================================

                targetSocket.lobbyCode =
                    null;

                targetSocket.isHost =
                    false;

                targetSocket.role =
                    "PLAYER";


                // ==================================================
                // GỬI KICKED
                // ==================================================

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


                // ==================================================
                // BÁO HOST
                // ==================================================

                if (
                    socket.readyState ===
                    WebSocket.OPEN
                ) {

                    socket.send(
                        JSON.stringify({

                            type:
                                "kick_success",

                            player_name:
                                targetPlayer.name

                        })
                    );

                }


                // ==================================================
                // UPDATE
                // ==================================================

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

            console.log(
                error
            );

        }

    });


    // ==================================================
    // DISCONNECT
    // ==================================================

    socket.on("close", () => {

        console.log(
            "PLAYER DISCONNECTED:",
            socket.playerName
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

            console.log(
                "CURRENT HOST LEFT:",
                socket.playerName
            );


            lobby.players =
                lobby.players.filter(
                    (player) =>
                        player.socket !==
                        socket
                );


            socket.lobbyCode =
                null;

            socket.isHost =
                false;


            // ==================================================
            // CÒN NGƯỜI -> CHỌN HOST MỚI
            // ==================================================

            if (
                lobby.players.length >
                0
            ) {

                const newHost =
                    lobby.players[0];


                setHost(
                    lobby,
                    newHost
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


            // ==================================================
            // KHÔNG CÒN AI
            // ==================================================

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


        socket.lobbyCode =
            null;

        socket.isHost =
            false;


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
