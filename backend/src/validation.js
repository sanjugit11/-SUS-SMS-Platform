const { z } = require("zod");
const { chains, stablecoins } = require("./data");

const chainIds = chains.map((chain) => chain.id);
const stablecoinSymbols = stablecoins.map((coin) => coin.symbol);
const SOURCE_CHAIN = "hoodi";
const DESTINATION_CHAIN = "base-sepolia";

const stxQuery = z.object({
  stxId: z.string().min(1).default("STX-DEMO-USER")
});

const registrationBody = z.object({
  walletAddress: z.string().min(1),
  biometricEnrolled: z.boolean().default(false),
  passcode: z.string().min(8).max(16),
  totpCode: z.string().min(6).max(8),
  signature: z.string().min(1)
});

const depositBody = z.object({
  stxId: z.string().min(1).default("STX-DEMO-USER"),
  stablecoin: z.enum(stablecoinSymbols),
  amount: z.number().positive(),
  depositChain: z.enum(chainIds),
  walletSignature: z.string().min(1)
}).refine((value) => value.depositChain === SOURCE_CHAIN, {
  message: "SUS deposits must originate on Hoodi",
  path: ["depositChain"]
});

const withdrawBody = z.object({
  stxId: z.string().min(1).default("STX-DEMO-USER"),
  amount: z.number().positive(),
  walletSignature: z.string().min(1)
});

const allocationBody = z.object({
  stxId: z.string().min(1).default("STX-DEMO-USER"),
  amount: z.number().positive(),
  sourceChain: z.enum(chainIds),
  destChain: z.enum(chainIds),
  inputStablecoin: z.enum(stablecoinSymbols),
  outputStablecoin: z.enum(stablecoinSymbols)
}).refine((value) => value.sourceChain === SOURCE_CHAIN, {
  message: "Allocation source chain must be Hoodi",
  path: ["sourceChain"]
}).refine((value) => value.destChain === DESTINATION_CHAIN, {
  message: "Allocation destination chain must be Base Sepolia",
  path: ["destChain"]
});

const proposeOperationBody = z.object({
  adminWallet: z.string().min(1),
  operationType: z.string().min(1),
  details: z.record(z.any()).default({})
});

const adminApprovalBody = z.object({
  operationId: z.string().min(1),
  adminWallet: z.string().min(1),
  signature: z.string().min(1)
});

const killSwitchBody = z.object({
  adminWallet: z.string().min(1),
  switchType: z.enum(["platformPause", "emergencyShutdown", "userRevocation", "globalFreeze"]),
  action: z.enum(["activate", "deactivate"]),
  stxId: z.string().optional(),
  imtId: z.string().optional(),
  signature: z.string().min(1)
});

function validate(schema, target = "body") {
  return (req, res, next) => {
    const parsed = schema.safeParse(req[target]);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    }
    req[target] = parsed.data;
    return next();
  };
}

module.exports = {
  adminApprovalBody,
  allocationBody,
  depositBody,
  killSwitchBody,
  proposeOperationBody,
  registrationBody,
  stxQuery,
  withdrawBody,
  validate
};
