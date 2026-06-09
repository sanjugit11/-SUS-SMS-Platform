const { randomUUID } = require("crypto");
const { state } = require("./data");
const prisma = require("./db");

function balanceKey(stxId, chainId, stablecoin) {
  return `${stxId}:${chainId}:${stablecoin}`;
}

function getExchangeRate() {
  return { rate: "1:1", fee: 0 };
}

async function requestAllocation({ stxId, amount, sourceChain, destChain, inputStablecoin, outputStablecoin }) {
  if (state.killSwitch.platformPause || state.killSwitch.emergencyShutdown) {
    const error = new Error("Platform is paused");
    error.status = 423;
    throw error;
  }

  const account = await prisma.susAccount.findUnique({ where: { stxId } });
  if (!account || Number(account.susBalance) < amount) {
    const error = new Error("Insufficient SUS balance");
    error.status = 400;
    throw error;
  }

  // Update SUS account
  await prisma.susAccount.update({
    where: { stxId },
    data: {
      susBalance: { decrement: amount },
      principalStablecoin: inputStablecoin,
    }
  });

  const id = `ACX-${randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;
  const txHash = `0x${randomUUID().replaceAll("-", "").slice(0, 32)}`;
  
  const allocation = await prisma.allocation.create({
    data: {
      id,
      stxId,
      amount,
      sourceChain,
      destChain,
      inputStablecoin,
      outputStablecoin,
      status: "settling",
      txHash
    }
  });

  // Background process to settle
  setTimeout(async () => {
    await prisma.allocation.update({
      where: { id },
      data: { status: "completed" }
    });

    // Upsert destination balance
    const existing = await prisma.destinationBalance.findUnique({
      where: {
        stxId_chainId_stablecoin: {
          stxId,
          chainId: destChain,
          stablecoin: outputStablecoin
        }
      }
    });

    if (existing) {
      await prisma.destinationBalance.update({
        where: { id: existing.id },
        data: { balance: { increment: amount } }
      });
    } else {
      await prisma.destinationBalance.create({
        data: {
          stxId,
          chainId: destChain,
          stablecoin: outputStablecoin,
          balance: amount
        }
      });
    }
  }, 1200);

  return allocation;
}

async function getStatus(id) {
  return await prisma.allocation.findUnique({ where: { id } });
}

async function getDestinationBalances(stxId) {
  return await prisma.destinationBalance.findMany({
    where: { stxId }
  });
}

async function getAllocationHistory(stxId) {
  return await prisma.allocation.findMany({
    where: { stxId },
    orderBy: { createdAt: 'desc' }
  });
}

module.exports = {
  getAllocationHistory,
  getDestinationBalances,
  getExchangeRate,
  getStatus,
  requestAllocation
};
