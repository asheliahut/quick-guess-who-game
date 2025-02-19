import express from "express";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import { v4 as uuidv4 } from "uuid";

// Character interface and customizable list
interface Character {
  imageUrl: string;
  name: string;
}

// add characters via env var
const envCharacters = process.env.CHARACTERS ?? "";
const envCharactersArray = envCharacters ? JSON.parse(envCharacters) : [];
const characters = envCharactersArray.length > 0 ? envCharactersArray : [
  { imageUrl: "https://img.pokemondb.net/sprites/home/normal/bulbasaur.png", name: "Bulbasaur" },
  { imageUrl: "https://img.pokemondb.net/sprites/home/normal/charmander.png", name: "Charmander" },
  { imageUrl: "https://img.pokemondb.net/sprites/home/normal/squirtle.png", name: "Squirtle" },
  { imageUrl: "https://img.pokemondb.net/sprites/home/normal/pidgey.png", name: "Pidgey" },
  { imageUrl: "https://img.pokemondb.net/sprites/home/normal/rattata.png", name: "Rattata" }
];

// Helper function to shuffle an array (Fisher–Yates shuffle)
function shuffleArray<T>(array: T[]): T[] {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Game room interface with a roundActive flag, lastWinner property, and a names mapping.
interface GameRoom {
  roomId: string;
  players: Socket[];
  secrets: { [socketId: string]: Character };
  currentTurn: number;
  roundActive: boolean;
  lastWinner?: string;
  names: { [socketId: string]: string };
}

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*", // Allow connections from any origin (or specify your React app URL)
    methods: ["GET", "POST"]
  }
});

// Game state variables for waiting players
let waitingPlayer: Socket | null = null;
let waitingPlayerName = "";
const gameRooms: { [roomId: string]: GameRoom } = {};

io.on("connection", (socket: Socket) => {
  console.log(`New connection: ${socket.id}`);

  // Join a game with a name provided by the client.
  socket.on("joinGame", (data: { name: string }) => {
    if (waitingPlayer === null) {
      waitingPlayer = socket;
      waitingPlayerName = data.name;
      socket.emit("message", `Welcome, ${data.name}! Waiting for an opponent...`);
    } else {
      const roomId = uuidv4();
      const gameRoom: GameRoom = {
        roomId,
        players: [waitingPlayer, socket],
        secrets: {},
        currentTurn: 0,
        roundActive: true,
        names: {
          [waitingPlayer.id]: waitingPlayerName,
          [socket.id]: data.name
        }
      };

      waitingPlayer.join(roomId);
      socket.join(roomId);

      // Randomly assign secret characters for both players.
      gameRoom.secrets[waitingPlayer.id] =
        characters[Math.floor(Math.random() * characters.length)];
      gameRoom.secrets[socket.id] =
        characters[Math.floor(Math.random() * characters.length)];

      gameRooms[roomId] = gameRoom;

      // For each player, send a gameStart event with a separately shuffled board.
      gameRoom.players.forEach((player) => {
        player.emit("gameStart", {
          roomId,
          characters: shuffleArray(characters), // Unique random order per player.
          currentTurn: gameRoom.players[gameRoom.currentTurn].id,
          names: gameRoom.names
        });
      });

      // Send each player their secret character privately.
      waitingPlayer.emit("secretAssigned", gameRoom.secrets[waitingPlayer.id]);
      socket.emit("secretAssigned", gameRoom.secrets[socket.id]);

      io.to(roomId).emit("turnChange", {
        currentTurn: gameRoom.players[gameRoom.currentTurn].id
      });

      waitingPlayer = null;
      waitingPlayerName = "";
    }
  });

  // Handle a guess.
  socket.on("guess", (data: { guessedName: string; roomId: string }) => {
    const { guessedName, roomId } = data;
    const gameRoom = gameRooms[roomId];
    if (!gameRoom) return;

    // Only allow a guess if it's the player's turn.
    if (gameRoom.players[gameRoom.currentTurn].id !== socket.id) {
      socket.emit("message", "Not your turn!");
      return;
    }

    // Broadcast the guess (including the guesser's name) to both players.
    const guesserName = gameRoom.names[socket.id];
    io.to(roomId).emit("guessMade", { guesser: socket.id, guesserName, guessedName });

    // Find the opponent (the other player in the room).
    const opponent = gameRoom.players.find((player) => player.id !== socket.id);
    if (!opponent) return;
    const opponentSecret = gameRoom.secrets[opponent.id];
    const correct = opponentSecret.name === guessedName;

    if (correct) {
      // Store the winner so we can reorder players for the new round.
      gameRoom.lastWinner = socket.id;
      // Announce the win and mark the round as inactive.
      gameRoom.roundActive = false;
      io.to(roomId).emit("gameOver", { winner: socket.id, guessedName });
    } else {
      socket.emit("message", "Wrong guess! Turn passes.");
      // Change turn to the other player.
      gameRoom.currentTurn = (gameRoom.currentTurn + 1) % gameRoom.players.length;
      io.to(roomId).emit("turnChange", {
        currentTurn: gameRoom.players[gameRoom.currentTurn].id
      });
    }
  });

  // Handle new round request.
  socket.on("newRound", (data: { roomId: string }) => {
    const { roomId } = data;
    const gameRoom = gameRooms[roomId];
    if (!gameRoom) return;

    // Only start a new round if the previous round is inactive.
    if (gameRoom.roundActive) return;

    // Reorder players so that the last winner is first.
    if (gameRoom.lastWinner) {
      const winnerIndex = gameRoom.players.findIndex(
        (player) => player.id === gameRoom.lastWinner
      );
      if (winnerIndex > 0) {
        const [winner] = gameRoom.players.splice(winnerIndex, 1);
        gameRoom.players.unshift(winner);
      }
      delete gameRoom.lastWinner;
    }

    // Reassign new secret characters for each player.
    gameRoom.secrets = {};
    gameRoom.players.forEach((player) => {
      gameRoom.secrets[player.id] =
        characters[Math.floor(Math.random() * characters.length)];
    });

    // Reset current turn (now the winner is at index 0) and mark the round as active.
    gameRoom.currentTurn = 0;
    gameRoom.roundActive = true;

    // For each player, send a newRound event with a shuffled board unique to them.
    gameRoom.players.forEach((player) => {
      player.emit("newRound", {
        roomId,
        characters: shuffleArray(characters), // Unique order per player.
        currentTurn: gameRoom.players[gameRoom.currentTurn].id,
        secret: gameRoom.secrets[player.id]
      });
    });
  });

  // Clean up on disconnect.
  socket.on("disconnect", () => {
    console.log(`Socket disconnected: ${socket.id}`);
    if (waitingPlayer && waitingPlayer.id === socket.id) {
      waitingPlayer = null;
      waitingPlayerName = "";
    }
    for (const roomId in gameRooms) {
      const gameRoom = gameRooms[roomId];
      if (gameRoom.players.find((player) => player.id === socket.id)) {
        gameRoom.players.forEach((player) => {
          if (player.id !== socket.id) {
            player.emit("message", "Opponent disconnected. Game over.");
          }
        });
        delete gameRooms[roomId];
      }
    }
  });
});

const PORT = process.env.APP_PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
