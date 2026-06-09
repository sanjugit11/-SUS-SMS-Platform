const request = require("supertest");
const app = require("../src/server");
const { resetState } = require("../src/data");

describe("SUS/SMS API", () => {
  beforeEach(() => {
    resetState();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns health and supported chain metadata", async () => {
    const health = await request(app).get("/api/health");
    const chains = await request(app).get("/api/supported/chains");

    expect(health.status).toBe(200);
    expect(health.body.ok).toBe(true);
    expect(chains.status).toBe(200);
    expect(chains.body.map((chain) => chain.id)).toEqual(expect.arrayContaining(["hoodi", "base-sepolia"]));
  });

  it("lists supported stablecoins", async () => {
    const res = await request(app).get("/api/supported/stablecoins");

    expect(res.status).toBe(200);
    expect(res.body.map((coin) => coin.symbol)).toEqual(expect.arrayContaining(["USDC", "USDT", "DAI", "EURC"]));
  });

  it("deposits principal stablecoin into the SUS account", async () => {
    const res = await request(app).post("/api/sus/deposit").send({
      userId: "alice",
      stablecoin: "USDT",
      amount: 1200,
      depositChain: "hoodi"
    });

    expect(res.status).toBe(201);
    expect(res.body.account).toMatchObject({
      userId: "alice",
      principalStablecoin: "USDT",
      susBalance: 1200,
      depositChain: "hoodi"
    });
    expect(res.body.transaction.method).toBe("deposit(address,uint256)");
  });

  it("returns the current SUS balance for a user", async () => {
    await request(app).post("/api/sus/deposit").send({
      userId: "alice",
      stablecoin: "USDC",
      amount: 400,
      depositChain: "hoodi"
    });

    const res = await request(app).get("/api/sus/balance").query({ userId: "alice" });

    expect(res.status).toBe(200);
    expect(res.body.susBalance).toBe(400);
    expect(res.body.depositChain).toBe("hoodi");
  });

  it("accepts allocations and exposes allocation history", async () => {
    vi.useFakeTimers();
    await request(app).post("/api/sus/deposit").send({
      userId: "alice",
      stablecoin: "USDC",
      amount: 900,
      depositChain: "hoodi"
    });

    const allocate = await request(app).post("/api/sms/allocate").send({
      userId: "alice",
      amount: 500,
      sourceChain: "hoodi",
      destChain: "base-sepolia",
      inputStablecoin: "USDC",
      outputStablecoin: "DAI"
    });
    const history = await request(app).get("/api/sms/history").query({ userId: "alice" });

    expect(allocate.status).toBe(202);
    expect(allocate.body.allocation.status).toBe("settling");
    expect(allocate.body.exchangeRate.rate).toBe("1:1");
    expect(history.body[0]).toMatchObject({ id: allocate.body.allocation.id, outputStablecoin: "DAI" });
  });

  it("updates status and destination balances when ACX settlement completes", async () => {
    vi.useFakeTimers();
    await request(app).post("/api/sus/deposit").send({
      userId: "alice",
      stablecoin: "USDC",
      amount: 900,
      depositChain: "hoodi"
    });
    const allocate = await request(app).post("/api/sms/allocate").send({
      userId: "alice",
      amount: 500,
      sourceChain: "hoodi",
      destChain: "base-sepolia",
      inputStablecoin: "USDC",
      outputStablecoin: "DAI"
    });

    await vi.advanceTimersByTimeAsync(1300);
    const status = await request(app).get(`/api/sms/status/${allocate.body.allocation.id}`);
    const balances = await request(app).get("/api/sms/balances").query({ userId: "alice" });

    expect(status.body.status).toBe("completed");
    expect(balances.body).toContainEqual(expect.objectContaining({
      chainId: "base-sepolia",
      stablecoin: "DAI",
      balance: 500
    }));
  });

  it("rejects invalid routes and over-balance allocations", async () => {
    const invalidRoute = await request(app).post("/api/sms/allocate").send({
      userId: "demo-user",
      amount: 10,
      sourceChain: "hoodi",
      destChain: "hoodi",
      inputStablecoin: "USDC",
      outputStablecoin: "DAI"
    });
    const overBalance = await request(app).post("/api/sms/allocate").send({
      userId: "demo-user",
      amount: 200000,
      sourceChain: "hoodi",
      destChain: "base-sepolia",
      inputStablecoin: "USDC",
      outputStablecoin: "DAI"
    });

    expect(invalidRoute.status).toBe(400);
    expect(overBalance.status).toBe(400);
    expect(overBalance.body.error).toBe("Insufficient SUS balance");
  });
});
