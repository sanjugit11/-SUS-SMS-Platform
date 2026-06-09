require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");
require("solidity-coverage");
require("dotenv").config({ path: require('path').resolve(__dirname, '.env') });

try {
  require("@nomicfoundation/hardhat-verify");
} catch (error) {
  if (process.env.REQUIRE_HARDHAT_VERIFY === "true") {
    throw error;
  }
}

const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
console.log("Using PRIVATE_KEY:", PRIVATE_KEY ? "****" + PRIVATE_KEY.slice(-4) : "(none)");
const HOODI_RPC_URL = process.env.HOODI_RPC_URL || "https://rpc.hoodi.ethpandaops.io";
const BASE_SEPOLIA_RPC_URL = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";
console.log("Using HOODI_RPC_URL:", HOODI_RPC_URL);
console.log("Using BASE_SEPOLIA_RPC_URL:", BASE_SEPOLIA_RPC_URL);
console.log("Using ETHERSCAN_API_KEY:", ETHERSCAN_API_KEY);
function accounts() {
  if (!PRIVATE_KEY) return [];
  return [PRIVATE_KEY.startsWith("0x") ? PRIVATE_KEY : `0x${PRIVATE_KEY}`];
}

module.exports = {
  paths: {
    sources: "./blockchain/contracts",
    tests: "./blockchain/test",
    cache: "./blockchain/cache",
    artifacts: "./blockchain/artifacts"
  },
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    hoodi: {
      url: HOODI_RPC_URL || "http://127.0.0.1:8545",
      chainId: 560048,
      accounts: accounts()
    },
    baseSepolia: {
      url: BASE_SEPOLIA_RPC_URL || "http://127.0.0.1:8545",
      chainId: 84532,
      accounts: accounts()
    }
  },
  etherscan: {
    apiKey: {
      hoodi: process.env.HOODI_ETHERSCAN_API_KEY || process.env.ETHERSCAN_API_KEY || "",
      baseSepolia: process.env.BASESCAN_API_KEY || process.env.ETHERSCAN_API_KEY || ""
    },
    customChains: [
      {
        network: "hoodi",
        chainId: 560048,
        urls: {
          apiURL: "https://explorer.hoodi.ethpandaops.io/api",
          browserURL: "https://explorer.hoodi.ethpandaops.io"
        }
      },
      {
        network: "baseSepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api-sepolia.basescan.org/api",
          browserURL: "https://sepolia.basescan.org"
        }
      }
    ]
  }
};
