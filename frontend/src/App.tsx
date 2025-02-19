import React, { useEffect, useState, useRef } from "react";
import { io, Socket } from "socket.io-client";

interface Character {
  imageUrl: string;
  name: string;
}

interface GameStartData {
  roomId: string;
  characters: Character[];
  currentTurn: string;
  names: { [socketId: string]: string };
}

/**
 * New round data includes the new secret for the player.
 */
interface NewRoundData extends GameStartData {
  secret: Character;
}

// Connect to your backend server (adjust URL/port as needed)
const socket: Socket = io(import.meta.env.VITE_BACKEND_SOCKET_URL);

const App: React.FC = () => {
  const [connected, setConnected] = useState(false);
  const [playerName, setPlayerName] = useState("");
  const [nameSubmitted, setNameSubmitted] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [mySecret, setMySecret] = useState<Character | null>(null);
  const [currentTurn, setCurrentTurn] = useState<string | null>(null);
  const [messages, setMessages] = useState<string[]>([]);
  const [disableMode, setDisableMode] = useState(false);
  const [eliminated, setEliminated] = useState<{ [key: string]: boolean }>({});
  const [winnerScreen, setWinnerScreen] = useState<string | null>(null);

  // Ref for the messages container
  const messagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    socket.on("connect", () => {
      console.log("Connected with id:", socket.id);
      setConnected(true);
    });

    socket.on("message", (msg: string) => {
      addMessage(msg);
    });

    socket.on("gameStart", (data: GameStartData) => {
      setRoomId(data.roomId);
      setCharacters(data.characters);
      addMessage("Game started!");
      setCurrentTurn(data.currentTurn);
      setEliminated({});
      // Show opponent name to the player.
      const opponentEntry = Object.entries(data.names).find(
        ([id]) => id !== socket.id
      );
      if (opponentEntry) {
        addMessage(`You joined a room with ${opponentEntry[1]}`);
      }
    });

    socket.on("secretAssigned", (secret: Character) => {
      setMySecret(secret);
      addMessage(`Your secret character is: ${secret.name}`);
    });

    socket.on("turnChange", (data: { currentTurn: string }) => {
      setCurrentTurn(data.currentTurn);
      if (socket.id === data.currentTurn) {
        addMessage("It's your turn! Make a guess by clicking a character.");
      } else {
        addMessage("Waiting for opponent's move...");
      }
    });

    // When a new round begins, update the board and secret.
    socket.on("newRound", (data: NewRoundData) => {
      setCharacters(data.characters);
      setCurrentTurn(data.currentTurn);
      setMySecret(data.secret);
      addMessage("New round started!");
      setEliminated({});
      setMessages([]);
    });

    socket.on("gameOver", (data: { winner: string; guessedName: string }) => {
      if (data.winner === socket.id) {
        setWinnerScreen(
          `🎉 Congratulations! You won by guessing ${data.guessedName} 🎉`
        );
      } else {
        setWinnerScreen(
          `😞 You lost! Opponent guessed your secret character: ${data.guessedName}`
        );
      }
      // After 5 seconds, clear the overlay and request a new round.
      setTimeout(() => {
        setWinnerScreen(null);
        setEliminated({});
        if (roomId) {
          socket.emit("newRound", { roomId });
        }
      }, 5000);
    });

    // Listen for guessMade event to display what was guessed.
    socket.on(
      "guessMade",
      (data: { guesser: string; guesserName: string; guessedName: string }) => {
        if (data.guesser === socket.id) {
          addMessage(`You guessed: ${data.guessedName}`);
        } else {
          addMessage(`${data.guesserName} guessed: ${data.guessedName}`);
        }
      }
    );

    // Cleanup listeners on unmount.
    return () => {
      socket.off("connect");
      socket.off("message");
      socket.off("gameStart");
      socket.off("secretAssigned");
      socket.off("turnChange");
      socket.off("newRound");
      socket.off("gameOver");
      socket.off("guessMade");
    };
  }, [roomId]);

  // Whenever messages change, scroll to the bottom of the messages container.
  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages]);

  const addMessage = (msg: string) => {
    setMessages((prev) => [...prev, msg]);
  };

  const handleJoin = () => {
    if (!playerName.trim()) {
      addMessage("Please enter a valid name.");
      return;
    }
    socket.emit("joinGame", { name: playerName });
    setNameSubmitted(true);
    addMessage(`Joining game as "${playerName}"...`);
  };

  // In guess mode, clicking a card will emit a guess (unless it’s disabled)
  const handleGuess = (character: Character) => {
    if (eliminated[character.name]) {
      addMessage("This character is disabled. Re-enable it before guessing.");
      return;
    }
    if (socket.id === currentTurn && roomId) {
      socket.emit("guess", { guessedName: character.name, roomId });
    } else {
      addMessage("Not your turn!");
    }
  };

  // Toggle the disabled (eliminated) state for a character.
  const toggleDisabled = (characterName: string) => {
    setEliminated((prev) => ({
      ...prev,
      [characterName]: !prev[characterName],
    }));
  };

  return (
    <div style={{ padding: "20px", position: "relative" }}>
      <h1>Guess Who Pokemon Edition</h1>
      {/* If player name is not submitted, show the input form */}
      {!nameSubmitted && (
        <div style={{ marginBottom: "20px", textAlign: "center" }}>
          <input
            type="text"
            placeholder="Enter your name..."
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            style={{ padding: "10px", fontSize: "1rem", width: "250px" }}
          />
          <button onClick={handleJoin} style={{ marginLeft: "10px" }}>
            Join Game
          </button>
        </div>
      )}
      {/* Only show game controls once name is set and player has joined a room */}
      {nameSubmitted && (
        <div style={{ display: "flex", gap: "10px", marginBottom: "10px" }}>
          {roomId ? null : null}
          <button onClick={() => setDisableMode((prev) => !prev)}>
            {disableMode ? "Exit Disable Mode" : "Enter Disable Mode"}
          </button>
        </div>
      )}

      {mySecret && (
        <div className="secret-info">
          Your secret character is: <strong>{mySecret.name}</strong>
          {currentTurn && (
            <span
              className={`turn-indicator ${
                socket.id === currentTurn ? "your-turn" : "opponents-turn"
              }`}
            >
              {socket.id === currentTurn ? " - Your turn!" : " - Opponent's turn"}
            </span>
          )}
        </div>
      )}

      <div style={{ marginTop: "20px" }}>
        {roomId && <p>Room: {roomId}</p>}
        <div className="game-board">
          {characters.map((char, index) => (
            <div
              key={index}
              className={`character-card ${eliminated[char.name] ? "disabled" : ""}`}
              onClick={() => {
                if (disableMode) {
                  toggleDisabled(char.name);
                } else {
                  handleGuess(char);
                }
              }}
            >
              <img src={char.imageUrl} alt={char.name} />
              <p>{char.name}</p>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: "20px" }}>
        <h3>Messages:</h3>
        <div className="messages" ref={messagesRef}>
          {messages.map((msg, idx) => (
            <p key={idx}>{msg}</p>
          ))}
        </div>
      </div>

      {winnerScreen && (
        <div className="winner-overlay">
          <div className="winner-message">{winnerScreen}</div>
        </div>
      )}
    </div>
  );
};

export default App;
