const { ethers, network } = require("hardhat");

function splitAddresses(value, name) {
  const addresses = (value || "")
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean);

  for (const address of addresses) {
    if (!ethers.isAddress(address)) {
      throw new Error(`${name} contains an invalid address: ${address}`);
    }
  }

  return addresses;
}

function requireAddress(value, name) {
  if (!value || !ethers.isAddress(value)) {
    throw new Error(`${name} must be a valid address`);
  }

  return value;
}

function ownerAddress(value, fallback) {
  if (!value) return fallback;
  return requireAddress(value, "owner");
}

async function deploySus(deployer) {
  const owner = ownerAddress(process.env.SUS_OWNER, deployer.address);
  const initialStablecoins = splitAddresses(process.env.SUS_INITIAL_STABLECOINS, "SUS_INITIAL_STABLECOINS");

  const SUSCore = await ethers.getContractFactory("SUSCore");
  const sus = await SUSCore.deploy(initialStablecoins, owner);
  await sus.waitForDeployment();

  console.log("SUSCore deployed");
  console.log("network:", network.name);
  console.log("address:", await sus.getAddress());
  console.log("owner:", owner);
  console.log("initialStablecoins:", initialStablecoins.join(",") || "(none)");
}

async function deploySms(deployer) {
  const owner = ownerAddress(process.env.SMS_OWNER, deployer.address);
  const inputStablecoin = requireAddress(process.env.SMS_INPUT_STABLECOIN, "SMS_INPUT_STABLECOIN");
  const outputStablecoins = splitAddresses(process.env.SMS_OUTPUT_STABLECOINS, "SMS_OUTPUT_STABLECOINS");

  const SMSCore = await ethers.getContractFactory("SMSCore");
  const sms = await SMSCore.deploy(inputStablecoin, outputStablecoins, owner);
  await sms.waitForDeployment();

  console.log("SMSCore deployed");
  console.log("network:", network.name);
  console.log("address:", await sms.getAddress());
  console.log("owner:", owner);
  console.log("inputStablecoin:", inputStablecoin);
  console.log("outputStablecoins:", outputStablecoins.join(",") || "(none)");
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("deployer:", deployer.address);

  if (network.name === "hoodi") {
    await deploySus(deployer);
    return;
  }

  if (network.name === "baseSepolia") {
    await deploySms(deployer);
    return;
  }

  throw new Error("Use --network hoodi for SUSCore or --network baseSepolia for SMSCore");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
