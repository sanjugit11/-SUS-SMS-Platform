const { ethers, network, run } = require("hardhat");

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

async function verify(address, constructorArguments, contract) {
  await run("verify:verify", {
    address,
    constructorArguments,
    contract
  });
}

async function main() {
  const [deployer] = await ethers.getSigners();

  if (network.name === "hoodi") {
    const address = requireAddress(process.env.SUS_CONTRACT_ADDRESS, "SUS_CONTRACT_ADDRESS");
    const owner = ownerAddress(process.env.SUS_OWNER, deployer.address);
    const initialStablecoins = splitAddresses(process.env.SUS_INITIAL_STABLECOINS, "SUS_INITIAL_STABLECOINS");

    await verify(address, [initialStablecoins, owner], "blockchain/contracts/SUSCore.sol:SUSCore");
    console.log("SUSCore verified:", address);
    return;
  }

  if (network.name === "baseSepolia") {
    const address = requireAddress(process.env.SMS_CONTRACT_ADDRESS, "SMS_CONTRACT_ADDRESS");
    const owner = ownerAddress(process.env.SMS_OWNER, deployer.address);
    const inputStablecoin = requireAddress(process.env.SMS_INPUT_STABLECOIN, "SMS_INPUT_STABLECOIN");
    const outputStablecoins = splitAddresses(process.env.SMS_OUTPUT_STABLECOINS, "SMS_OUTPUT_STABLECOINS");

    await verify(address, [inputStablecoin, outputStablecoins, owner], "blockchain/contracts/SMSCore.sol:SMSCore");
    console.log("SMSCore verified:", address);
    return;
  }

  throw new Error("Use --network hoodi for SUSCore or --network baseSepolia for SMSCore");
}

main().catch((error) => {
  const message = String(error && error.message ? error.message : error);

  if (message.includes("Unrecognized task verify:verify")) {
    console.error("Install @nomicfoundation/hardhat-verify before running this script.");
  }

  console.error(error);
  process.exitCode = 1;
});
