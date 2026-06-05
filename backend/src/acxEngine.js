const { randomUUID } = require("crypto");
const { state } = require("./data");

function balanceKey(userId, chainId, stablecoin) {
  return `${userId}:${chainId}:${stablecoin}`;
}

function getExchangeRate() {
  return { rate: "1:1", fee: 0 };
}

function requestAllocation({ userId, amount, sourceChain, destChain, inputStablecoin, outputStablecoin }) {
  const account = state.susAccounts.get(userId);
  if (!account || account.susBalance < amount) {
    const error = new Error("Insufficient SUS balance");
    error.status = 400;
    throw error;
  }

  account.susBalance -= amount;
  account.principalStablecoin = inputStablecoin;
  account.depositChain = sourceChain;

  const id = `ACX-${randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;
  const txHash = `0x${randomUUID().replaceAll("-", "").slice(0, 32)}`;
  const allocation = {
    id,
    userId,
    amount,
    sourceChain,
    destChain,
    inputStablecoin,
    outputStablecoin,
    status: "settling",
    txHash,
    createdAt: new Date().toISOString()
  };

  state.allocations.set(id, allocation);

  setTimeout(() => {
    allocation.status = "completed";
    const key = balanceKey(userId, destChain, outputStablecoin);
    const existing = state.destinationBalances.get(key) || { userId, chainId: destChain, stablecoin: outputStablecoin, balance: 0 };
    existing.balance += amount;
    existing.updatedAt = new Date().toISOString();
    state.destinationBalances.set(key, existing);
  }, 1200);

  return allocation;
}

function getStatus(id) {
  return state.allocations.get(id) || null;
}

function getDestinationBalances(userId) {
  return [...state.destinationBalances.values()].filter((balance) => balance.userId === userId);
}

function getAllocationHistory(userId) {
  return [...state.allocations.values()]
    .filter((allocation) => allocation.userId === userId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

module.exports = {
  getAllocationHistory,
  getDestinationBalances,
  getExchangeRate,
  getStatus,
  requestAllocation
};
