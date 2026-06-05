require("dotenv").config();

const cors = require("cors");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { chains, stablecoins, state } = require("./data");
const { allocationBody, depositBody, userQuery, validate } = require("./validation");
const { getAllocationHistory, getDestinationBalances, getExchangeRate, getStatus, requestAllocation } = require("./acxEngine");

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(rateLimit({ windowMs: 60 * 1000, max: 120 }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "sus-sms-api" });
});

app.get("/api/sus/balance", validate(userQuery, "query"), (req, res) => {
  const account = state.susAccounts.get(req.query.userId) || {
    userId: req.query.userId,
    principalStablecoin: "USDC",
    susBalance: 0,
    depositChain: "hoodi"
  };
  res.json(account);
});

app.post("/api/sus/deposit", validate(depositBody), (req, res) => {
  const { userId, stablecoin, amount, depositChain } = req.body;
  const account = state.susAccounts.get(userId) || { userId, principalStablecoin: stablecoin, susBalance: 0, depositChain };
  account.principalStablecoin = stablecoin;
  account.depositChain = depositChain;
  account.susBalance += amount;
  state.susAccounts.set(userId, account);
  res.status(201).json({
    account,
    transaction: {
      to: "SUS_CORE_CONTRACT",
      method: "deposit(address,uint256)",
      stablecoin,
      amount
    }
  });
});

app.post("/api/sms/allocate", validate(allocationBody), (req, res, next) => {
  try {
    const allocation = requestAllocation(req.body);
    res.status(202).json({ allocation, exchangeRate: getExchangeRate(req.body.inputStablecoin, req.body.outputStablecoin) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/sms/status/:id", (req, res) => {
  const allocation = getStatus(req.params.id);
  if (!allocation) return res.status(404).json({ error: "Allocation not found" });
  return res.json(allocation);
});

app.get("/api/sms/history", validate(userQuery, "query"), (req, res) => {
  res.json(getAllocationHistory(req.query.userId));
});

app.get("/api/sms/balances", validate(userQuery, "query"), (req, res) => {
  res.json(getDestinationBalances(req.query.userId));
});

app.get("/api/supported/chains", (_req, res) => {
  res.json(chains);
});

app.get("/api/supported/stablecoins", (_req, res) => {
  res.json(stablecoins);
});

app.use((error, _req, res, _next) => {
  res.status(error.status || 500).json({ error: error.message || "Internal server error" });
});

if (require.main === module) {
  const port = process.env.PORT || 4000;
  app.listen(port, () => {
    console.log(`SUS/SMS API listening on ${port}`);
  });
}

module.exports = app;
