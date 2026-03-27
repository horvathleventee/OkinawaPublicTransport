const hre = require("hardhat");
require("dotenv").config();

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  const oracleAddress = process.env.ORACLE_ADDRESS || deployer.address;

  console.log("Deploying with:", deployer.address);
  console.log("Oracle address:", oracleAddress);
  console.log("Network:", hre.network.name);

  const Token = await hre.ethers.getContractFactory("GreenCommuteToken");
  const token = await Token.deploy(oracleAddress);

  await token.deployed();

  console.log("GreenCommuteToken deployed to:", token.address);
  console.log("Chain ID:", hre.network.config.chainId);

  console.log("\nPut these into green-api/.env:");
  console.log(`GCT_CONTRACT_ADDRESS=${token.address}`);
  console.log(`GCT_CHAIN_ID=${hre.network.config.chainId || 31337}`);
  console.log(`GCT_ORACLE_ADDRESS=${oracleAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});