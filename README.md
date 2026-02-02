# Pick'em

An AI agent that watches Twitch livestreams and automatically creates short-term prediction markets from live in-game events using privacy-focused tokens.

[Demo](https://x.com/sonhavietnamese/status/2018008773357711654) |
[Deck](https://drive.google.com/file/d/1wF6XG9Pcl6kFs_T8qDKIvuOWJEf8sVxS/view?usp=sharing)

## Features

- Automatically creates prediction markets from live in-game events
- Uses privacy-focused tokens to create markets

## Tech Stack

- Solana
- Python
- Ollama
- FastAPI
- Encore.dev
- PNPExchange

## Run your own

### Prerequisites

- [Ollama](https://ollama.com/install)
- [uv](https://docs.astral.sh/uv/)
- [Bun](https://bun.sh/docs/installation)

### Setup

1. Prepare a Solana (devnet) wallet with some [USDC-Dev](https://spl-token-faucet.com/?token-name=USDC-Dev) and [SOL](https://faucet.solana.com/) tokens
2. Register a Ollama account and run it locally
3. Register a [Helius](https://helius.dev/) account and get the devnet RPC

### Run the application

1. Clone the repository
2. Run service

```bash
cd demo/services
cp .env.example .env # then paste your Helius devnet RPC and private key
bun install # install dependencies
bun run dev # run the service
```

3. Run Agents

Go to [Twitch](https://www.twitch.tv/directory/category/counter-strike) and get the streamer username, ex: dorozea

```bash
cd demo/agents
uv install
cd watcher && uv run main.py <streamer_username> # run the watcher agent
cd ui && uv run main.py <streamer_username> # run the UI
cd creator && uv run main.py <streamer_username> # run the creator agent
cd decider && uv run main.py <streamer_username> # run the decider agent
```
