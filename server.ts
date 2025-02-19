import express from "express";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import { v4 as uuidv4 } from "uuid";

// Define the character interface
interface Character {
  imageUrl: string;
  name: string;
}

// A customizable list of characters
const characters: Character[] = [
  { imageUrl: "https://via.placeholder.com/100?text=Alice", name: "Alice" },
  { imageUrl: "https://via.placeholder.com/100?text=Bob", name: "Bob" },
  { imageUrl: "https://via.placeholder.com/100?text=Charlie", name: "Charlie" },
  { imageUrl: "https://via.placeholder.com/100?text=Diana", name: "Diana" },
  // Add more characters as desired
];

// Define a game room structure
interface GameRoom {
  roomId: string;
  players: Socket[];
  secrets: { [socketId: string]: Character };
  currentTurn: number;
}

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

// Serve static files from the public directory
app.use(express.static("public"));

// For simplicity, we use a single waiting player slot.
let waitingPlayer: Socket | null = null;
// Keep track of active game rooms
const gameRooms: { [roomId: string]: GameRoom } = {};

io.on("connection", (socket: Socket) => {
  console.log(`New connection: ${socket.id}`);

  // When a player wants to join a game
  socket.on("joinGame", () => {
    if (waitingPlayer === null) {
      waitingPlayer = socket;
      socket.emit("message", "Waiting for an opponent...");
    } else {
      // Create a new game room with two players
      const roomId = uuidv4();
      const gameRoom: GameRoom = {
        roomId,
        players: [waitingPlayer, socket],
        secrets: {},
        currentTurn: 0,
      };

      // Have both players join the room
      waitingPlayer.join(roomId);
      socket.join(roomId);

      // Randomly assign each player a secret character
      gameRoom.secrets[waitingPlayer.id] =
        characters[Math.floor(Math.random() * characters.length)];
      gameRoom.secrets[socket.id] =
        characters[Math.floor(Math.random() * characters.length)];

      // Store the game room
      gameRooms[roomId] = gameRoom;

      // Inform both players that the game has started.
      // We send the board (the full characters array) and indicate whose turn it is.
      io.to(roomId).emit("gameStart", {
        roomId,
        characters,
        currentTurn: gameRoom.players[gameRoom.currentTurn].id,
      });

      // Send each player their secret character privately
      waitingPlayer.emit("secretAssigned", gameRoom.secrets[waitingPlayer.id]);
      socket.emit("secretAssigned", gameRoom.secrets[socket.id]);

      // Notify players whose turn it is
      io.to(roomId).emit("turnChange", {
        currentTurn: gameRoom.players[gameRoom.currentTurn].id,
      });

      waitingPlayer = null;
    }
  });

  // Handle a guess from a player
  socket.on("guess", (data: { guessedName: string; roomId: string }) => {
    const { guessedName, roomId } = data;
    const gameRoom = gameRooms[roomId];
    if (!gameRoom) {
      return;
    }
    // Only allow a guess if it's the player's turn
    if (gameRoom.players[gameRoom.currentTurn].id !== socket.id) {
      socket.emit("message", "Not your turn!");
      return;
    }
    // Find the opponent (the other player in the room)
    const opponent = gameRoom.players.find((player) => player.id !== socket.id);
    if (!opponent) return;
    const opponentSecret = gameRoom.secrets[opponent.id];
    const correct = opponentSecret.name === guessedName;

    if (correct) {
      // Announce the win and end the game
      io.to(roomId).emit("gameOver", { winner: socket.id, guessedName });
      delete gameRooms[roomId];
    } else {
      socket.emit("message", "Wrong guess! Turn passes.");
      // Change turn to the other player
      gameRoom.currentTurn = (gameRoom.currentTurn + 1) % gameRoom.players.length;
      io.to(roomId).emit("turnChange", {
        currentTurn: gameRoom.players[gameRoom.currentTurn].id,
      });
    }
  });

  // Clean up when a player disconnects
  socket.on("disconnect", () => {
    console.log(`Socket disconnected: ${socket.id}`);
    if (waitingPlayer && waitingPlayer.id === socket.id) {
      waitingPlayer = null;
    }
    // If the player was in an active game, notify the opponent and remove the room.
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

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
