const chains = [
  { id: "hoodi", name: "Hoodi", chainId: 560048, role: "Destination primary", endOfLife: "2028-09" },
  { id: "arbitrum-sepolia", name: "Arbitrum Sepolia", chainId: 421614, role: "Deposit / destination alternative", endOfLife: "2026-09" }
];

const stablecoins = [
  { symbol: "USDC", name: "USD Coin", decimals: 6 },
  { symbol: "USDT", name: "Tether", decimals: 6 },
  { symbol: "DAI", name: "Dai", decimals: 18 },
  { symbol: "EURC", name: "Euro Coin", decimals: 6 }
];

function createInitialState() {
  return {
    susAccounts: new Map([
      ["demo-user", { userId: "demo-user", principalStablecoin: "USDC", susBalance: 100000, depositChain: "hoodi" }]
    ]),
    allocations: new Map(),
    destinationBalances: new Map([
      ["demo-user:arbitrum-sepolia:DAI", { userId: "demo-user", chainId: "arbitrum-sepolia", stablecoin: "DAI", balance: 100000 }]
    ])
  };
}

const state = createInitialState();

function resetState() {
  const fresh = createInitialState();
  state.susAccounts = fresh.susAccounts;
  state.allocations = fresh.allocations;
  state.destinationBalances = fresh.destinationBalances;
}

module.exports = {
  chains,
  resetState,
  stablecoins,
  state
};
