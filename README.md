# SUS + SMS Platform

Production-grade demo for the Stanbic-X Unified Stablecoin account and Stanbic-X Money Structure allocation engine production grade

## What is included

- React dashboard with Context API and ethers MetaMask wallet connection
- Express API with validation, rate limiting, security headers, and ACX allocation simulation
- Prisma schema for PostgreSQL tables required by the brief
- Solidity 0.8.x contracts for SUS Core, SMS Core, mock stablecoins, and a delegatecall attacker test fixture
- Hardhat and Vitest test suites
- AI Usage Log template for documenting required model usage

## Quick start

```bash
npm install
npm run build
npm run server
npm run dev
```

Copy `.env.example` to `.env` and set `DATABASE_URL`, `INFURA_API_KEY`, and `PRIVATE_KEY` before deploying contracts.

## Supported flow

The app demonstrates Hoodi to Arbitrum Sepolia as the primary workflow and Arbitrum Sepolia to Hoodi as the alternative workflow. The ACX engine uses a 1:1 stablecoin exchange rate, no fees, no bridge, and simulated 1-2 block completion.
