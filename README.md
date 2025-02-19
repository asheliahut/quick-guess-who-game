# Guess Who Game

A multiplayer web-based version of the classic Guess Who game built with React, Socket.IO, and Bun.

## Prerequisites

- [Bun](https://bun.sh/) installed on your system
- Node.js and npm (comes with Bun)

## Project Structure

- `frontend/` - React frontend application
- `backend/` - Socket.IO server
- Root directory contains workspace configuration

## Installation

1. Clone the repository:

   ```sh
   git clone https://github.com/yourusername/guesswho.git
   cd guesswho
   ```

2. Install dependencies:

   ```sh
   bun install
   ```

## Configuration

1. Copy the environment files:

   ```sh
   cp backend/.env.example backend/.env
   cp frontend/.env.example frontend/.env
   ```

## Running the Application

1. Start both frontend and backend:

   ```sh
   bun start
   ```

2. Or run them separately:

   ```sh
   # Start backend
   bun start:backend

   # Start frontend
   bun start:frontend
   ```

## Game Access

- Frontend: http://localhost:5173
- Backend: http://localhost:5000

## How to Play

1. Open the game in two different browser windows
2. Enter your name and join a game room
3. Each player gets assigned a random character
4. Take turns asking yes/no questions about your opponent's character
5. Mark eliminated characters using "Disable Mode"
6. Make a guess when you think you know the character

## Development Commands

- `bun run dev` - Run in development mode
- `bun run build` - Build for production
- `bun run test` - Run tests
- `bun run lint` - Lint code