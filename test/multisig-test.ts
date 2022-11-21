import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("MultiSigWallet", function () {
  async function deploy() {
    const [owner, acc1, acc2, acc3] = await ethers.getSigners();

    // 2 out of 3 multisig required
    const args = [[acc1, acc2, acc3], 2];

    const MultiSigWallet = await ethers.getContractFactory("MultiSigWallet");
    const multiSigWallet = await MultiSigWallet.deploy(owner, args);

    return {
      owner,
      acc1,
      acc2,
      acc3,
      multiSigWallet,
    };
  }

  describe("swap", function () {
    it("Should swap and redeem correctly", async function () {});
  });
});
