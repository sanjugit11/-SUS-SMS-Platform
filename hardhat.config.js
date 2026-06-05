require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");
require("solidity-coverage");
require("dotenv").config();

const INFURA_API_KEY = process.env.INFURA_API_KEY || "";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";

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
      url: INFURA_API_KEY ? `https://hoodi.infura.io/v3/${INFURA_API_KEY}` : "http://127.0.0.1:8545",
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : []
    },
    arbitrumSepolia: {
      url: INFURA_API_KEY ? `https://arbitrum-sepolia.infura.io/v3/${INFURA_API_KEY}` : "http://127.0.0.1:8545",
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : []
    }
  }
};
