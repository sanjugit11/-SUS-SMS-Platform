import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from "react";
import { createRoot } from "react-dom/client";
import { ethers } from "ethers";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowRightLeft,
  Banknote,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Database,
  Fingerprint,
  Landmark,
  LockKeyhole,
  Network,
  PowerOff,
  RefreshCcw,
  ShieldCheck,
  UserCheck,
  Wallet
} from "lucide-react";
import "./styles.css";

const API_BASE = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE || "http://localhost:4000";
const SOURCE_CHAIN = "hoodi";
const DESTINATION_CHAIN = "base-sepolia";

const CHAIN_PARAMS = {
  hoodi: {
    chainId: "0x88bb0",
    chainName: "Hoodi",
    nativeCurrency: { name: "Hoodi Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://rpc.hoodi.ethpandaops.io"],
    blockExplorerUrls: ["https://explorer.hoodi.ethpandaops.io"]
  },
  "base-sepolia": {
    chainId: "0x14a34",
    chainName: "Base Sepolia",
    nativeCurrency: { name: "Base Sepolia Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://sepolia.base.org"],
    blockExplorerUrls: ["https://sepolia.basescan.org"]
  }
};

const FALLBACK_CHAINS = [
  { id: "hoodi", name: "Hoodi", chainId: 560048, role: "Primary L1 testnet", endOfLife: "2027+" },
  { id: "base-sepolia", name: "Base Sepolia", chainId: 84532, role: "Secondary L2 testnet", endOfLife: "Stable" }
];

const FALLBACK_STABLECOINS = [
  { symbol: "USDC", name: "USD Coin", decimals: 6, color: "#2563eb" },
  { symbol: "USDT", name: "Tether", decimals: 6, color: "#059669" },
  { symbol: "DAI", name: "Dai", decimals: 18, color: "#d97706" },
  { symbol: "EURC", name: "Euro Coin", decimals: 6, color: "#7c3aed" }
];

const initialState = {
  wallet: "",
  stxProfile: null,
  connectedChainId: "",
  chains: FALLBACK_CHAINS,
  stablecoins: FALLBACK_STABLECOINS,
  account: { stxId: "", principalStablecoin: "USDC", susBalance: 0, depositChain: "hoodi" },
  depositChain: SOURCE_CHAIN,
  principalStablecoin: "USDC",
  depositAmount: 25000,
  allocationAmount: 50000,
  outputStablecoin: "DAI",
  allocations: [],
  destinationBalances: [],
  adminPending: [],
  adminActions: [],
  securityAlerts: [],
  killSwitch: {},
  loading: false,
  error: "",
  lastUpdated: ""
};

const PlatformContext = createContext(null);

function normalizeCoin(coin) {
  const palette = { USDC: "#2563eb", USDT: "#059669", DAI: "#d97706", EURC: "#7c3aed" };
  return { ...coin, color: coin.color || palette[coin.symbol] || "#0b3b57" };
}

function chainName(chains, chainId) {
  return chains.find((chain) => chain.id === chainId)?.name || chainId;
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
    case "admin_hydrate":
      return { ...state, ...action.payload };
    case "loading":
      return { ...state, loading: action.value };
    case "error":
      return { ...state, error: action.message, loading: false };
    case "wallet":
      return { ...state, wallet: action.wallet, connectedChainId: action.connectedChainId || state.connectedChainId };
    case "chain":
      return { ...state, connectedChainId: action.connectedChainId };
    case "profile":
      return { ...state, stxProfile: action.profile };
    case "field":
      return { ...state, [action.name]: action.value };
    case "account":
      return {
        ...state,
        account: action.account,
        depositChain: action.account.depositChain || state.depositChain,
        principalStablecoin: action.account.principalStablecoin || state.principalStablecoin,
        allocationAmount: Math.min(Number(state.allocationAmount || 0), action.account.susBalance)
      };
    case "allocation":
      return { ...state, allocations: [action.allocation, ...state.allocations.filter((item) => item.id !== action.allocation.id)] };
    case "logout":
      return { ...initialState };
    default:
      return state;
  }
}

function PlatformProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const stxId = state.stxProfile?.stxId;

  const refreshAdmin = useCallback(async () => {
    try {
      const [pending, status] = await Promise.all([
        api("/api/admin/pending"),
        api("/api/security/status")
      ]);
      dispatch({ type: "admin_hydrate", payload: {
        adminPending: pending.pendingOperations,
        adminActions: pending.adminActions,
        securityAlerts: status.alerts,
        killSwitch: status.killSwitch
      }});
    } catch (e) {
      console.warn("Admin fetch failed", e);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const p1 = api("/api/supported/chains");
      const p2 = api("/api/supported/stablecoins");
      let chains, stablecoins, account = state.account, allocations = [], destinationBalances = [];
      
      if (stxId) {
        const query = `stxId=${encodeURIComponent(stxId)}`;
        [chains, stablecoins, account, allocations, destinationBalances] = await Promise.all([
          p1, p2,
          api(`/api/sus/balance?${query}`),
          api(`/api/sms/history?${query}`),
          api(`/api/sms/balances?${query}`)
        ]);
      } else {
        [chains, stablecoins] = await Promise.all([p1, p2]);
      }
      
      dispatch({ type: "hydrate", payload: { chains, stablecoins, account, allocations, destinationBalances } });
      await refreshAdmin();
    } catch (error) {
      dispatch({ type: "error", message: error.message });
    }
  }, [stxId, state.account, refreshAdmin]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const hasOpenAllocation = state.allocations.some((allocation) => allocation.status !== "completed");
    if (!hasOpenAllocation) return undefined;
    const interval = window.setInterval(refresh, 1500);
    return () => window.clearInterval(interval);
  }, [refresh, state.allocations]);

  const deposit = useCallback(async () => {
    dispatch({ type: "loading", value: true });
    try {
      const response = await api("/api/sus/deposit", {
        method: "POST",
        body: JSON.stringify({
          stxId,
          stablecoin: state.principalStablecoin,
          amount: Number(state.depositAmount),
          depositChain: state.depositChain,
          walletSignature: "mock-signature"
        })
      });
      dispatch({ type: "account", account: response.account });
      await refresh();
    } catch (error) {
      dispatch({ type: "error", message: error.message });
    } finally {
      dispatch({ type: "loading", value: false });
    }
  }, [refresh, state.depositAmount, state.depositChain, state.principalStablecoin, stxId]);

  const withdraw = useCallback(async () => {
    dispatch({ type: "loading", value: true });
    try {
      const response = await api("/api/sus/withdraw", {
        method: "POST",
        body: JSON.stringify({
          stxId,
          amount: Number(state.depositAmount),
          walletSignature: "mock-signature"
        })
      });
      dispatch({ type: "account", account: response.account });
      await refresh();
    } catch (error) {
      dispatch({ type: "error", message: error.message });
    } finally {
      dispatch({ type: "loading", value: false });
    }
  }, [refresh, state.depositAmount, stxId]);

  const allocate = useCallback(async () => {
    dispatch({ type: "loading", value: true });
    try {
      const response = await api("/api/sms/allocate", {
        method: "POST",
        body: JSON.stringify({
          stxId,
          amount: Number(state.allocationAmount),
          sourceChain: state.depositChain,
          destChain: DESTINATION_CHAIN,
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
  }, [refresh, state.allocationAmount, state.depositChain, state.outputStablecoin, state.principalStablecoin, stxId]);

  const value = useMemo(() => ({ allocate, deposit, withdraw, dispatch, refresh, refreshAdmin, state, stxId }), [allocate, deposit, withdraw, refresh, refreshAdmin, state, stxId]);
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
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const accounts = await provider.send("eth_requestAccounts", []);
        const network = await provider.getNetwork();
        dispatch({ type: "wallet", wallet: accounts[0], connectedChainId: network.chainId.toString() });
      } catch (error) {
        console.error("MetaMask connection error:", error);
      }
    } else {
      alert("Please install MetaMask to connect your wallet.");
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
  const { dispatch, state } = usePlatform();
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
        <ChainSwitchButton chainId="base-sepolia" />
        <WalletButton />
        {state.wallet && (
          <button className="chain-button" onClick={() => dispatch({type: "logout"})}>
            <PowerOff size={16} /> Logout
          </button>
        )}
      </div>
    </header>
  );
}

function RegistrationPanel() {
  const { state, dispatch } = usePlatform();
  const [loading, setLoading] = React.useState(false);

  const register = async () => {
    setLoading(true);
    try {
      const res = await api("/api/stx/register", {
        method: "POST",
        body: JSON.stringify({
          walletAddress: state.wallet,
          biometricEnrolled: true,
          passcode: "12345678",
          totpCode: "123456",
          signature: "mock-signature"
        })
      });
      dispatch({ type: "profile", profile: res.user });
    } catch(e) {
      dispatch({ type: "error", message: e.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-overlay">
      <div className="auth-modal">
        <Fingerprint size={48} className="auth-icon" />
        <h2>STX Authentication</h2>
        <p>Your wallet is connected, but you need to register for an STX-ID to use the platform.</p>
        <ul className="auth-checklist">
          <li><CheckCircle2 size={16}/> Wallet connection verified</li>
          <li><AlertTriangle size={16}/> Biometric enrollment required</li>
          <li><AlertTriangle size={16}/> Passcode & TOTP required</li>
        </ul>
        {state.error ? <div className="notice" style={{marginBottom: "15px"}}>{state.error}</div> : null}
        <button className="primary-action dark" onClick={register} disabled={loading}>
          {loading ? "Registering..." : "Complete Registration"}
        </button>
      </div>
    </div>
  );
}


function Dashboard() {
  const { allocate, deposit, withdraw, dispatch, refresh, state } = usePlatform();
  const destChain = DESTINATION_CHAIN;
  const openCount = state.allocations.filter((allocation) => allocation.status !== "completed").length;

  if (!state.wallet) {
    return (
      <main>
        <div className="hero-panel" style={{textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center"}}>
          <ShieldCheck size={64} style={{color: "#2563eb", marginBottom: "1rem"}}/>
          <h2>Welcome to SUS-SMS Platform</h2>
          <p>Please connect your wallet to proceed.</p>
        </div>
      </main>
    );
  }

  if (state.wallet && !state.stxProfile) {
    return (
      <main>
        <RegistrationPanel />
      </main>
    );
  }

  return (
    <main>
      {state.error ? <div className="notice">{state.error}</div> : null}
      
      <section className="stats-grid">
        <Stat icon={UserCheck} label="STX ID" value={state.stxProfile.stxId} detail="Authenticated" />
        <Stat icon={CircleDollarSign} label="SUS balance" value={`${formatAmount(state.account.susBalance)} ${state.account.principalStablecoin}`} detail={chainName(state.chains, state.account.depositChain)} />
        <Stat icon={ArrowRightLeft} label="Destination" value={chainName(state.chains, destChain)} detail={`${state.principalStablecoin} to ${state.outputStablecoin}`} />
        <Stat icon={Clock3} label="Live allocations" value={openCount} detail={state.lastUpdated ? `Updated ${state.lastUpdated}` : "Waiting for API"} />
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
              {state.chains.filter((chain) => chain.id === SOURCE_CHAIN).map((chain) => <option value={chain.id} key={chain.id}>{chain.name}</option>)}
            </select>
          </label>
          <label>
            Principal stablecoin
            <select value={state.principalStablecoin} onChange={(event) => dispatch({ type: "field", name: "principalStablecoin", value: event.target.value })}>
              {state.stablecoins.map((coin) => <option value={coin.symbol} key={coin.symbol}>{coin.symbol} - {coin.name}</option>)}
            </select>
          </label>
          <label>
            Amount
            <input type="number" min="0" value={state.depositAmount} onChange={(event) => dispatch({ type: "field", name: "depositAmount", value: event.target.value })} />
          </label>
          <div style={{display: 'flex', gap: '10px'}}>
            <button className="primary-action" disabled={state.loading} onClick={deposit} style={{flex: 1}}>
              <ArrowDownToLine size={18} /> Deposit
            </button>
            <button className="primary-action outline" disabled={state.loading} onClick={withdraw} style={{flex: 1, backgroundColor: 'transparent', border: '1px solid #ccc', color: '#333'}}>
              Withdraw
            </button>
          </div>
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
            <select value={destChain} disabled>
              {state.chains.filter((chain) => chain.id === DESTINATION_CHAIN).map((chain) => <option value={chain.id} key={chain.id}>{chain.name}</option>)}
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

      <section className="lower-grid" style={{gridTemplateColumns: "1fr 1fr"}}>
        <AllocationHistory />
        <DestinationBalances />
      </section>
      
      <hr style={{margin: '40px 0', borderColor: '#eee'}} />
      <h2 style={{marginBottom: '20px'}}>Super Admin Controls</h2>
      
      <section className="lower-grid" style={{gridTemplateColumns: "1fr 1fr"}}>
        <AdminDashboard />
        <SecurityDashboard />
      </section>

      <button className="refresh-button" onClick={refresh}>
        <RefreshCcw size={16} />
        Refresh
      </button>
    </main>
  );
}

function AdminDashboard() {
  const { state, refreshAdmin } = usePlatform();
  const pending = state.adminPending || [];
  
  const approve = async (id) => {
    try {
      await api("/api/admin/approve", {
        method: "POST",
        body: JSON.stringify({
          adminWallet: "0xAdmin000000000000000000000000000000000001",
          operationId: id,
          signature: "mock-sig"
        })
      });
      refreshAdmin();
    } catch(e) { alert(e.message) }
  };

  const proposePause = async () => {
    try {
      await api("/api/security/kill-switch", {
        method: "POST",
        body: JSON.stringify({
          adminWallet: "0xAdmin000000000000000000000000000000000001",
          switchType: "platformPause",
          action: "activate",
          signature: "mock-signature"
        })
      });
      refreshAdmin();
    } catch(e) { alert(e.message) }
  }

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p>Admin Dashboard</p>
          <h3>Pending 3-of-3 approvals</h3>
        </div>
        <ShieldCheck size={20} />
      </div>
      <div className="table-list" style={{maxHeight: "300px", overflowY: "auto"}}>
        {pending.length === 0 ? <div className="empty-state">No pending operations.</div> : null}
        {pending.map(op => (
          <article className="allocation-row" key={op.id}>
            <div>
              <strong>{op.operationType}</strong>
            </div>
            <div>{op.approvals.length} / 3 Approvals</div>
            <button className="primary-action dark" style={{padding: '5px 10px', width: 'auto'}} onClick={() => approve(op.id)}>Approve</button>
          </article>
        ))}
      </div>
      <div style={{marginTop: '15px'}}>
        <button className="primary-action" style={{background: '#ef4444'}} onClick={proposePause}>
          <PowerOff size={16}/> Activate Kill Switch (Pause)
        </button>
      </div>
    </section>
  );
}

function SecurityDashboard() {
  const { state } = usePlatform();
  const alerts = state.securityAlerts || [];
  return (
    <section className="panel wide-panel">
      <div className="panel-heading">
        <div>
          <p>Security Dashboard</p>
          <h3>Alert history & Auto-shutdown</h3>
        </div>
        <AlertTriangle size={20} />
      </div>
      <div style={{padding: '10px 0', marginBottom: '10px', borderBottom: '1px solid #eee'}}>
        <strong>Kill Switch Status: </strong> 
        <span className={`status-pill ${state.killSwitch?.platformPause ? 'error' : 'completed'}`}>
          {state.killSwitch?.platformPause ? 'PAUSED' : 'ACTIVE'}
        </span>
      </div>
      <div className="table-list" style={{maxHeight: "250px", overflowY: "auto"}}>
        {alerts.length === 0 ? <div className="empty-state">No alerts.</div> : null}
        {alerts.map(a => (
          <article className="allocation-row" key={a.id}>
            <div>
              <span style={{color: a.level === 'critical' ? 'red' : 'inherit'}}>{a.message}</span>
            </div>
            <small>{new Date(a.createdAt).toLocaleString()}</small>
          </article>
        ))}
      </div>
    </section>
  );
}


function AllocationHistory() {
  const { state } = usePlatform();
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p>Allocation History</p>
          <h3>ACX requests</h3>
        </div>
        <Database size={20} />
      </div>
      <div className="table-list" style={{maxHeight: "300px", overflowY: "auto"}}>
        {state.allocations.length === 0 ? <div className="empty-state">No allocations yet.</div> : null}
        {state.allocations.map((item) => (
          <article className="allocation-row" key={item.id}>
            <div>
              <strong>{item.id}</strong>
              <span>{chainName(state.chains, item.sourceChain)} to {chainName(state.chains, item.destChain)}</span>
            </div>
            <div>{formatAmount(item.amount)} {item.inputStablecoin} to {item.outputStablecoin}</div>
            <div className={`status-pill ${item.status}`}>{item.status}</div>
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
