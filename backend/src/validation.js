const { z } = require("zod");
const { chains, stablecoins } = require("./data");

const chainIds = chains.map((chain) => chain.id);
const stablecoinSymbols = stablecoins.map((coin) => coin.symbol);

const userQuery = z.object({
  userId: z.string().min(1).default("demo-user")
});

const depositBody = z.object({
  userId: z.string().min(1).default("demo-user"),
  stablecoin: z.enum(stablecoinSymbols),
  amount: z.number().positive(),
  depositChain: z.enum(chainIds)
});

const allocationBody = z.object({
  userId: z.string().min(1).default("demo-user"),
  amount: z.number().positive(),
  sourceChain: z.enum(chainIds),
  destChain: z.enum(chainIds),
  inputStablecoin: z.enum(stablecoinSymbols),
  outputStablecoin: z.enum(stablecoinSymbols)
}).refine((value) => value.sourceChain !== value.destChain, {
  message: "Destination chain must be the opposite chain",
  path: ["destChain"]
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
  allocationBody,
  depositBody,
  userQuery,
  validate
};
