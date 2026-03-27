require("@nomiclabs/hardhat-ethers");
require("dotenv").config();

const networks = {
  hardhat: {
    chainId: 31337,
  },
  localhost: {
    url: process.env.LOCALHOST_RPC_URL || "http://127.0.0.1:8545",
    chainId: 31337,
  },
};

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks,
};