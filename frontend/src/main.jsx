import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from "react";
import { createRoot } from "react-dom/client";
import { ethers } from "ethers";
import {
  ArrowDownToLine,
  ArrowRightLeft,
  Banknote,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Database,
  Landmark,
  LockKeyhole,
  Network,
  RefreshCcw,
  ShieldCheck,
  Wallet
} from "lucide-react";
import "./styles.css";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";
const DEMO_USER = "demo-user";

const CHAIN_PARAMS = {
  hoodi: {
    chainId: "0x88bb0",
    chainName: "Hoodi",
    nativeCurrency: { name: "Hoodi Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://rpc.hoodi.ethpandaops.io"],
    blockExplorerUrls: ["https://hoodi.ethpandaops.io"]
  },
  "arbitrum-sepolia": {
    chainId: "0x66eee",
    chainName: "Arbitrum Sepolia",
    nativeCurrency: { name: "Arbitrum Sepolia Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://sepolia-rollup.arbitrum.io/rpc"],
    blockExplorerUrls: ["https://sepolia.arbiscan.io"]
  }
};

const FALLBACK_CHAINS = [
  { id: "hoodi", name: "Hoodi", chainId: 560048, role: "Destination primary", endOfLife: "2028-09" },
  { id: "arbitrum-sepolia", name: "Arbitrum Sepolia", chainId: 421614, role: "Deposit / destination alternative", endOfLife: "2026-09" }
];

const FALLBACK_STABLECOINS = [
  { symbol: "USDC", name: "USD Coin", decimals: 6, color: "#2563eb" },
  { symbol: "USDT", name: "Tether", decimals: 6, color: "#059669" },
  { symbol: "DAI", name: "Dai", decimals: 18, color: "#d97706" },
  { symbol: "EURC", name: "Euro Coin", decimals: 6, color: "#7c3aed" }
];

const initialState = {
  wallet: "",
  connectedChainId: "",
  chains: FALLBACK_CHAINS,
  stablecoins: FALLBACK_STABLECOINS,
  account: { userId: DEMO_USER, principalStablecoin: "USDC", susBalance: 100000, depositChain: "hoodi" },
  depositChain: "hoodi",
  principalStablecoin: "USDC",
  depositAmount: 25000,
  allocationAmount: 50000,
  outputStablecoin: "DAI",
  allocations: [],
  destinationBalances: [],
  loading: false,
  error: "",
  lastUpdated: ""
};

const PlatformContext = createContext(null);

function otherChain(chainId) {
  return chainId === "hoodi" ? "arbitrum-sepolia" : "hoodi";
}

function normalizeCoin(coin) {
  const palette = { USDC: "#2563eb", USDT: "#059669", DAI: "#d97706", EURC: "#7c3aed" };
  return { ...coin, color: coin.color || palette[coin.symbol] || "#0b3b57" };
}

function chainName(chains, chainId) {
  return chains.find((chain) => chain.id === chainId)?.name || chainId;
}

function userIdFor(wallet) {
  return wallet || DEMO_USER;
}

async function api(path, options) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
    ...options
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "API request failed");
  return body;
}

function reducer(state, action) {
  switch (action.type) {
    case "hydrate":
      return {
        ...state,
        ...action.payload,
        stablecoins: (action.payload.stablecoins || state.stablecoins).map(normalizeCoin),
        error: "",
        lastUpdated: new Date().toLocaleTimeString()
      };
    case "loading":
      return { ...state, loading: action.value };
    case "error":
      return { ...state, error: action.message, loading: false };
    case "wallet":
      return { ...state, wallet: action.wallet, connectedChainId: action.connectedChainId || state.connectedChainId };
    case "chain":
      return { ...state, connectedChainId: action.connectedChainId };
    case "field":
      return { ...state, [action.name]: action.value };
    case "account":
      return {
        ...state,
        account: action.account,
        depositChain: action.account.depositChain,
        principalStablecoin: action.account.principalStablecoin,
        allocationAmount: Math.min(Number(state.allocationAmount || 0), action.account.susBalance)
      };
    case "allocation":
      return { ...state, allocations: [action.allocation, ...state.allocations.filter((item) => item.id !== action.allocation.id)] };
    default:
      return state;
  }
}

function PlatformProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const userId = userIdFor(state.wallet);

  const refresh = useCallback(async () => {
    try {
      const query = `userId=${encodeURIComponent(userId)}`;
      const [chains, stablecoins, account, allocations, destinationBalances] = await Promise.all([
        api("/api/supported/chains"),
        api("/api/supported/stablecoins"),
        api(`/api/sus/balance?${query}`),
        api(`/api/sms/history?${query}`),
        api(`/api/sms/balances?${query}`)
      ]);
      dispatch({ type: "hydrate", payload: { chains, stablecoins, account, allocations, destinationBalances } });
    } catch (error) {
      dispatch({ type: "error", message: error.message });
    }
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const hasOpenAllocation = state.allocations.some((allocation) => allocation.status !== "completed");
    if (!hasOpenAllocation) return undefined;
    const interval = window.setInterval(refresh, 900);
    return () => window.clearInterval(interval);
  }, [refresh, state.allocations]);

  const deposit = useCallback(async () => {
    dispatch({ type: "loading", value: true });
    try {
      const response = await api("/api/sus/deposit", {
        method: "POST",
        body: JSON.stringify({
          userId,
          stablecoin: state.principalStablecoin,
          amount: Number(state.depositAmount),
          depositChain: state.depositChain
        })
      });
      dispatch({ type: "account", account: response.account });
      await refresh();
    } catch (error) {
      dispatch({ type: "error", message: error.message });
    } finally {
      dispatch({ type: "loading", value: false });
    }
  }, [refresh, state.depositAmount, state.depositChain, state.principalStablecoin, userId]);

  const allocate = useCallback(async () => {
    dispatch({ type: "loading", value: true });
    try {
      const response = await api("/api/sms/allocate", {
        method: "POST",
        body: JSON.stringify({
          userId,
          amount: Number(state.allocationAmount),
          sourceChain: state.depositChain,
          destChain: otherChain(state.depositChain),
          inputStablecoin: state.principalStablecoin,
          outputStablecoin: state.outputStablecoin
        })
      });
      dispatch({ type: "allocation", allocation: response.allocation });
      await refresh();
    } catch (error) {
      dispatch({ type: "error", message: error.message });
    } finally {
      dispatch({ type: "loading", value: false });
    }
  }, [refresh, state.allocationAmount, state.depositChain, state.outputStablecoin, state.principalStablecoin, userId]);

  const value = useMemo(() => ({ allocate, deposit, dispatch, refresh, state, userId }), [allocate, deposit, refresh, state, userId]);
  return <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>;
}

function usePlatform() {
  return useContext(PlatformContext);
}

function formatAmount(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Number(value || 0));
}

function shortHash(value) {
  if (!value) return "pending";
  return value.length > 14 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
}

function Stat({ icon: Icon, label, value, detail }) {
  return (
    <section className="stat-card">
      <div className="icon-frame"><Icon size={19} /></div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <span>{detail}</span>
      </div>
    </section>
  );
}

function ChainSwitchButton({ chainId }) {
  const { dispatch, state } = usePlatform();
  const chain = state.chains.find((item) => item.id === chainId);

  async function switchChain() {
    const params = CHAIN_PARAMS[chainId];
    if (!window.ethereum || !params) {
      dispatch({ type: "chain", connectedChainId: chainId });
      return;
    }

    try {
      await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: params.chainId }] });
    } catch (error) {
      if (error.code === 4902) {
        await window.ethereum.request({ method: "wallet_addEthereumChain", params: [params] });
      } else {
        throw error;
      }
    }
    dispatch({ type: "chain", connectedChainId: chainId });
  }

  return (
    <button className="chain-button" onClick={switchChain}>
      <Network size={16} />
      {chain?.name || chainId}
    </button>
  );
}

function WalletButton() {
  const { dispatch, state } = usePlatform();

  async function connect() {
    if (window.ethereum) {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      const network = await provider.getNetwork();
      dispatch({ type: "wallet", wallet: accounts[0], connectedChainId: network.chainId.toString() });
    } else {
      dispatch({ type: "wallet", wallet: "0xDemo6E4f9b11" });
    }
  }

  return (
    <button className="wallet-button" onClick={connect}>
      <Wallet size={18} />
      {state.wallet ? `${state.wallet.slice(0, 8)}...${state.wallet.slice(-4)}` : "Connect MetaMask"}
    </button>
  );
}

function Header() {
  return (
    <header className="topbar">
      <div className="brand-block">
        <div className="brand-mark">ACX</div>
        <div>
          <p>Cross-Chain Exchange Engine</p>
          <h1>SUS + SMS Stablecoin Operations</h1>
        </div>
      </div>
      <div className="wallet-cluster">
        <ChainSwitchButton chainId="hoodi" />
        <ChainSwitchButton chainId="arbitrum-sepolia" />
        <WalletButton />
      </div>
    </header>
  );
}

function HeroPanel() {
  const { state } = usePlatform();
  const destChain = otherChain(state.depositChain);
  return (
    <section className="hero-panel">
      <div className="hero-copy">
        <span className="eyebrow">Hoodi and Arbitrum Sepolia</span>
        <h2>ACX moves stablecoin intent while SUS keeps the principal ledger clear.</h2>
        <p>
          Connect MetaMask, deposit principal stablecoin on Hoodi or Arbitrum Sepolia, then allocate output
          liquidity to the opposite chain with live status updates from the backend engine.
        </p>
      </div>
      <div className="chain-visual" aria-label="Current ACX allocation route">
        <div className="chain-node hoodi-node">
          <Landmark size={22} />
          <strong>{chainName(state.chains, state.depositChain)}</strong>
          <span>SUS principal balance</span>
        </div>
        <div className="flow-line">
          <span>ACX</span>
        </div>
        <div className="chain-node arb-node">
          <Network size={22} />
          <strong>{chainName(state.chains, destChain)}</strong>
          <span>Destination balances</span>
        </div>
      </div>
    </section>
  );
}

function Dashboard() {
  const { allocate, deposit, dispatch, refresh, state } = usePlatform();
  const destChain = otherChain(state.depositChain);
  const openCount = state.allocations.filter((allocation) => allocation.status !== "completed").length;

  return (
    <main>
      <HeroPanel />
      {state.error ? <div className="notice">{state.error}</div> : null}
      <section className="stats-grid">
        <Stat icon={CircleDollarSign} label="SUS balance" value={`${formatAmount(state.account.susBalance)} ${state.account.principalStablecoin}`} detail={chainName(state.chains, state.account.depositChain)} />
        <Stat icon={ArrowRightLeft} label="Destination" value={chainName(state.chains, destChain)} detail={`${state.principalStablecoin} to ${state.outputStablecoin}`} />
        <Stat icon={Clock3} label="Live allocations" value={openCount} detail={state.lastUpdated ? `Updated ${state.lastUpdated}` : "Waiting for API"} />
        <Stat icon={ShieldCheck} label="Exchange rate" value="1:1" detail="Backend ACX quote" />
      </section>

      <section className="workspace-grid">
        <div className="panel">
          <div className="panel-heading">
            <div>
              <p>SUS Dashboard</p>
              <h3>Principal stablecoin account</h3>
            </div>
            <Banknote size={20} />
          </div>
          <label>
            Deposit chain
            <select value={state.depositChain} onChange={(event) => dispatch({ type: "field", name: "depositChain", value: event.target.value })}>
              {state.chains.map((chain) => <option value={chain.id} key={chain.id}>{chain.name}</option>)}
            </select>
          </label>
          <label>
            Principal stablecoin
            <select value={state.principalStablecoin} onChange={(event) => dispatch({ type: "field", name: "principalStablecoin", value: event.target.value })}>
              {state.stablecoins.map((coin) => <option value={coin.symbol} key={coin.symbol}>{coin.symbol} - {coin.name}</option>)}
            </select>
          </label>
          <label>
            Deposit amount
            <input type="number" min="0" value={state.depositAmount} onChange={(event) => dispatch({ type: "field", name: "depositAmount", value: event.target.value })} />
          </label>
          <button className="primary-action" disabled={state.loading} onClick={deposit}>
            <ArrowDownToLine size={18} />
            Deposit to SUS
          </button>
        </div>

        <div className="panel accent-panel">
          <div className="panel-heading">
            <div>
              <p>Allocation Interface</p>
              <h3>Deliver output stablecoin</h3>
            </div>
            <ArrowRightLeft size={20} />
          </div>
          <div className="route-strip">
            <span>{chainName(state.chains, state.depositChain)}</span>
            <ArrowRightLeft size={16} />
            <span>{chainName(state.chains, destChain)}</span>
          </div>
          <label>
            Destination chain
            <select value={destChain} onChange={(event) => dispatch({ type: "field", name: "depositChain", value: otherChain(event.target.value) })}>
              {state.chains.map((chain) => <option value={chain.id} key={chain.id}>{chain.name}</option>)}
            </select>
          </label>
          <label>
            Output stablecoin
            <select value={state.outputStablecoin} onChange={(event) => dispatch({ type: "field", name: "outputStablecoin", value: event.target.value })}>
              {state.stablecoins.map((coin) => <option value={coin.symbol} key={coin.symbol}>{coin.symbol} - {coin.name}</option>)}
            </select>
          </label>
          <label>
            Allocation amount
            <input type="number" min="0" max={state.account.susBalance} value={state.allocationAmount} onChange={(event) => dispatch({ type: "field", name: "allocationAmount", value: event.target.value })} />
          </label>
          <button className="primary-action dark" disabled={state.loading} onClick={allocate}>
            <CheckCircle2 size={18} />
            Allocate through ACX
          </button>
        </div>
      </section>

      <section className="lower-grid">
        <AllocationHistory />
        <DestinationBalances />
        <SupportedAssets />
      </section>
      <button className="refresh-button" onClick={refresh}>
        <RefreshCcw size={16} />
        Refresh
      </button>
    </main>
  );
}

function AllocationHistory() {
  const { state } = usePlatform();
  return (
    <section className="panel wide-panel">
      <div className="panel-heading">
        <div>
          <p>Allocation History</p>
          <h3>ACX requests</h3>
        </div>
        <Database size={20} />
      </div>
      <div className="table-list">
        {state.allocations.length === 0 ? <div className="empty-state">No allocations for this wallet yet.</div> : null}
        {state.allocations.map((item) => (
          <article className="allocation-row" key={item.id}>
            <div>
              <strong>{item.id}</strong>
              <span>{chainName(state.chains, item.sourceChain)} to {chainName(state.chains, item.destChain)}</span>
            </div>
            <div>{formatAmount(item.amount)} {item.inputStablecoin} to {item.outputStablecoin}</div>
            <div className={`status-pill ${item.status}`}>{item.status}</div>
            <code>{shortHash(item.txHash)}</code>
          </article>
        ))}
      </div>
    </section>
  );
}

function DestinationBalances() {
  const { state } = usePlatform();
  const grouped = state.chains.map((chain) => ({
    ...chain,
    balances: state.stablecoins.map((coin) => ({
      ...coin,
      balance: state.destinationBalances.find((item) => item.chainId === chain.id && item.stablecoin === coin.symbol)?.balance || 0
    }))
  }));

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p>Destination Balances</p>
          <h3>Per stablecoin</h3>
        </div>
        <LockKeyhole size={20} />
      </div>
      {grouped.map((chain) => (
        <div className="balance-cluster" key={chain.id}>
          <strong>{chain.name}</strong>
          {chain.balances.map((coin) => (
            <div className="balance-line" key={coin.symbol}>
              <span>{coin.symbol}</span>
              <span>{formatAmount(coin.balance)}</span>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}

function SupportedAssets() {
  const { state } = usePlatform();
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p>Supported Assets</p>
          <h3>Chains and stablecoins</h3>
        </div>
        <Network size={20} />
      </div>
      <div className="asset-list">
        {state.chains.map((chain) => (
          <article className="asset-row" key={chain.id}>
            <span>{chain.name}</span>
            <small>{chain.role} | EOL {chain.endOfLife}</small>
          </article>
        ))}
      </div>
      <div className="coin-grid">
        {state.stablecoins.map((coin) => (
          <span className="coin-pill" key={coin.symbol} style={{ "--coin": coin.color }}>{coin.symbol}</span>
        ))}
      </div>
    </section>
  );
}

function App() {
  return (
    <PlatformProvider>
      <div className="app-shell">
        <Header />
        <Dashboard />
      </div>
    </PlatformProvider>
  );
}

createRoot(document.getElementById("root")).render(<App />);
