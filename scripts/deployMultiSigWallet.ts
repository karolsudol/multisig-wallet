import { ethers } from "hardhat";

const OWNER_ADDRESS = process.env.OWNER_ADDRESS!;

async function main() {
  console.log(
    "Deploying MultiSigWallet contract with the account:",
    OWNER_ADDRESS
  );

  const Wallet = await ethers.getContractFactory("MultiSigWallet");
  const wallet = await Wallet.deploy(["add1", "addr2", "addr3"], 3);

  await wallet.deployed();
  console.log("Token contract deployed to:", wallet.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
