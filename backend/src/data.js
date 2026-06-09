const chains = [
  { id: "hoodi", name: "Hoodi", chainId: 560048, role: "Primary L1 testnet", endOfLife: "2027+" },
  { id: "base-sepolia", name: "Base Sepolia", chainId: 84532, role: "Secondary L2 testnet", endOfLife: "Stable" }
];

const stablecoins = [
  { symbol: "USDC", name: "USD Coin", decimals: 6 },
  { symbol: "USDT", name: "Tether", decimals: 6 },
  { symbol: "DAI", name: "Dai", decimals: 18 },
  { symbol: "EURC", name: "Euro Coin", decimals: 6 }
];

const superAdmins = [
  "0xAdmin000000000000000000000000000000000001",
  "0xAdmin000000000000000000000000000000000002",
  "0xAdmin000000000000000000000000000000000003"
];

// Killswitch and Alerts can be kept in-memory since they are global platform state 
// and the requirements didn't explicitly ask for them to be in the database, 
// though Admin Actions and Pending Operations go to DB.
const state = {
  securityAlerts: [
    { id: "ALERT-BOOT", level: "info", message: "Security Controller whitelist verified", createdAt: new Date().toISOString() }
  ],
  killSwitch: {
    platformPause: false,
    emergencyShutdown: false,
    revokedStxIds: new Set(),
    frozenImtIds: new Set(),
    autoShutdown: false,
    updatedAt: new Date().toISOString()
  }
};

module.exports = {
  chains,
  stablecoins,
  superAdmins,
  state
};
