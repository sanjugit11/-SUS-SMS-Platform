require("dotenv").config();

const cors = require("cors");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { randomUUID } = require("crypto");
const prisma = require("./db");
const { chains, stablecoins, state, superAdmins } = require("./data");
const {
  adminApprovalBody,
  allocationBody,
  depositBody,
  killSwitchBody,
  proposeOperationBody,
  registrationBody,
  stxQuery,
  validate,
  withdrawBody
} = require("./validation");
const { getAllocationHistory, getDestinationBalances, getExchangeRate, getStatus, requestAllocation } = require("./acxEngine");

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(rateLimit({ windowMs: 60 * 1000, max: 120 }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "sus-sms-api" });
});

function now() {
  return new Date().toISOString();
}

function shortId(prefix) {
  return `${prefix}-${randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`;
}

function isAdmin(wallet) {
  return superAdmins.includes(wallet);
}

function assertAdmin(wallet) {
  if (!isAdmin(wallet)) {
    const error = new Error("Unknown super admin wallet");
    error.status = 403;
    throw error;
  }
}

async function recordAdminAction(adminWallet, actionType, details = {}) {
  const action = await prisma.adminAction.create({
    data: {
      id: shortId("ADM"),
      adminWallet,
      actionType,
      details
    }
  });
  return action;
}

function addAlert(level, message, details = {}) {
  const alert = { id: shortId("ALERT"), level, message, details, createdAt: now() };
  state.securityAlerts.unshift(alert);
  return alert;
}

async function requireActiveUser(stxId) {
  const user = await prisma.user.findUnique({ where: { stxId } });
  if (!user) {
    const error = new Error("STX-ID not registered");
    error.status = 404;
    throw error;
  }
  if (state.killSwitch.emergencyShutdown || state.killSwitch.revokedStxIds.has(stxId) || state.killSwitch.frozenImtIds.has(user.imtId)) {
    const error = new Error("STX-ID access is blocked by security controls");
    error.status = 423;
    throw error;
  }
  return user;
}

async function executeOperation(operation) {
  await prisma.pendingOperation.update({
    where: { id: operation.id },
    data: { status: "executed" }
  });

  if (operation.operationType === "kill_switch_deactivation") {
    state.killSwitch[operation.details.switchType] = false;
    state.killSwitch.updatedAt = now();
  }

  addAlert("info", `Admin operation executed: ${operation.operationType}`, { operationId: operation.id });
}

app.post("/api/stx/register", validate(registrationBody), async (req, res, next) => {
  try {
    const stxId = shortId("STX");
    const imtId = shortId("IMT");
    const user = await prisma.user.create({
      data: {
        stxId,
        imtId,
        walletAddress: req.body.walletAddress,
        biometricEnrolled: req.body.biometricEnrolled,
      }
    });

    const account = await prisma.susAccount.create({
      data: {
        stxId,
        principalStablecoin: "USDC",
        susBalance: 0
      }
    });

    addAlert("info", "Atomic STX registration completed", { stxId, imtId });
    res.status(201).json({ user, account });
  } catch (error) {
    next(error);
  }
});

app.get("/api/stx/profile", validate(stxQuery, "query"), async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { stxId: req.query.stxId } });
    if (!user) return res.status(404).json({ error: "STX-ID not registered" });
    res.json(user);
  } catch (error) {
    next(error);
  }
});

app.get("/api/sus/balance", validate(stxQuery, "query"), async (req, res, next) => {
  try {
    let account = await prisma.susAccount.findUnique({ where: { stxId: req.query.stxId } });
    if (!account) {
      // Mock account if not found for frontend to still show 0
      account = {
        stxId: req.query.stxId,
        principalStablecoin: "USDC",
        susBalance: 0,
      };
    }
    res.json(account);
  } catch (error) {
    next(error);
  }
});

app.post("/api/sus/deposit", validate(depositBody), async (req, res, next) => {
  try {
    const { stxId, stablecoin, amount, depositChain } = req.body;
    await requireActiveUser(stxId);
    if (state.killSwitch.platformPause) return res.status(423).json({ error: "Platform is paused" });
    
    let account = await prisma.susAccount.findUnique({ where: { stxId } });
    if (account) {
      account = await prisma.susAccount.update({
        where: { stxId },
        data: {
          principalStablecoin: stablecoin,
          susBalance: { increment: amount }
        }
      });
    } else {
      account = await prisma.susAccount.create({
        data: {
          stxId,
          principalStablecoin: stablecoin,
          susBalance: amount
        }
      });
    }

    res.status(201).json({
      account,
      transaction: {
        to: "SUS_CORE_CONTRACT",
        method: "deposit(address,uint256)",
        stablecoin,
        amount
      }
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/sus/withdraw", validate(withdrawBody), async (req, res, next) => {
  try {
    await requireActiveUser(req.body.stxId);
    const account = await prisma.susAccount.findUnique({ where: { stxId: req.body.stxId } });
    if (!account || Number(account.susBalance) < req.body.amount) return res.status(400).json({ error: "Insufficient SUS balance" });
    
    const updated = await prisma.susAccount.update({
      where: { stxId: req.body.stxId },
      data: {
        susBalance: { decrement: req.body.amount }
      }
    });

    res.json({
      account: updated,
      transaction: {
        to: "SUS_CORE_CONTRACT",
        method: "withdraw(uint256)",
        amount: req.body.amount
      }
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/sms/allocate", validate(allocationBody), async (req, res, next) => {
  try {
    await requireActiveUser(req.body.stxId);
    const allocation = await requestAllocation(req.body);
    res.status(202).json({ allocation, exchangeRate: getExchangeRate(req.body.inputStablecoin, req.body.outputStablecoin) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/sms/status/:id", async (req, res, next) => {
  try {
    const allocation = await getStatus(req.params.id);
    if (!allocation) return res.status(404).json({ error: "Allocation not found" });
    return res.json(allocation);
  } catch (error) {
    next(error);
  }
});

app.get("/api/sms/history", validate(stxQuery, "query"), async (req, res, next) => {
  try {
    res.json(await getAllocationHistory(req.query.stxId));
  } catch (error) {
    next(error);
  }
});

app.get("/api/sms/balances", validate(stxQuery, "query"), async (req, res, next) => {
  try {
    res.json(await getDestinationBalances(req.query.stxId));
  } catch (error) {
    next(error);
  }
});

app.get("/api/supported/chains", (_req, res) => {
  res.json(chains);
});

app.get("/api/supported/stablecoins", (_req, res) => {
  res.json(stablecoins);
});

app.get("/api/admin/pending", async (_req, res, next) => {
  try {
    const pendingOperations = await prisma.pendingOperation.findMany({ where: { status: "pending" } });
    const adminActions = await prisma.adminAction.findMany({ orderBy: { timestamp: 'desc' }, take: 50 });
    res.json({
      superAdmins,
      pendingOperations,
      adminActions
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/propose", validate(proposeOperationBody), async (req, res, next) => {
  try {
    assertAdmin(req.body.adminWallet);
    const operation = await prisma.pendingOperation.create({
      data: {
        id: shortId("OP"),
        operationType: req.body.operationType,
        details: req.body.details,
        approvals: [],
        status: "pending"
      }
    });
    await recordAdminAction(req.body.adminWallet, "propose_operation", { operationId: operation.id, operationType: operation.operationType });
    res.status(201).json({ operation });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/approve", validate(adminApprovalBody), async (req, res, next) => {
  try {
    assertAdmin(req.body.adminWallet);
    const operation = await prisma.pendingOperation.findUnique({ where: { id: req.body.operationId } });
    if (!operation) return res.status(404).json({ error: "Operation not found" });
    if (operation.status === "executed") return res.json({ operation });

    let approvals = operation.approvals || [];
    if (!approvals.some((approval) => approval.adminWallet === req.body.adminWallet)) {
      approvals.push({ adminWallet: req.body.adminWallet, signature: req.body.signature, approvedAt: now() });
      
      await prisma.pendingOperation.update({
        where: { id: operation.id },
        data: { approvals }
      });
      await recordAdminAction(req.body.adminWallet, "approve_operation", { operationId: operation.id });
    }

    if (approvals.length >= 3) {
      await executeOperation(operation);
    }

    res.json({ operation: await prisma.pendingOperation.findUnique({ where: { id: operation.id } }) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/security/status", (_req, res) => {
  res.json({
    killSwitch: {
      ...state.killSwitch,
      revokedStxIds: [...state.killSwitch.revokedStxIds],
      frozenImtIds: [...state.killSwitch.frozenImtIds]
    },
    alerts: state.securityAlerts.slice(0, 50)
  });
});

app.post("/api/security/kill-switch", validate(killSwitchBody), async (req, res, next) => {
  try {
    assertAdmin(req.body.adminWallet);
    const { switchType, action } = req.body;

    if (action === "activate") {
      if (switchType === "userRevocation") {
        if (!req.body.stxId) return res.status(400).json({ error: "stxId is required for user revocation" });
        state.killSwitch.revokedStxIds.add(req.body.stxId);
      } else if (switchType === "globalFreeze") {
        if (!req.body.imtId) return res.status(400).json({ error: "imtId is required for global freeze" });
        state.killSwitch.frozenImtIds.add(req.body.imtId);
      } else {
        state.killSwitch[switchType] = true;
      }
      state.killSwitch.autoShutdown = switchType === "emergencyShutdown" || state.killSwitch.autoShutdown;
      state.killSwitch.updatedAt = now();
      await recordAdminAction(req.body.adminWallet, "activate_kill_switch", { switchType });
      addAlert("critical", `Kill switch activated: ${switchType}`, { adminWallet: req.body.adminWallet });
      return res.status(202).json({ killSwitch: state.killSwitch });
    }

    const operation = await prisma.pendingOperation.create({
      data: {
        id: shortId("OP"),
        operationType: "kill_switch_deactivation",
        details: { switchType },
        approvals: [{ adminWallet: req.body.adminWallet, signature: req.body.signature, approvedAt: now() }],
        status: "pending"
      }
    });
    
    await recordAdminAction(req.body.adminWallet, "request_kill_switch_deactivation", { operationId: operation.id, switchType });
    res.status(202).json({ operation });
  } catch (error) {
    next(error);
  }
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
