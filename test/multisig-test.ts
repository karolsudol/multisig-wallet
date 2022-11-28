import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

import { expect } from "chai";
import { ethers } from "hardhat";
import { Signer } from "ethers";

describe("MultiSigWallet", () => {
  async function deploy() {
    const MultiSigWallet = await ethers.getContractFactory("MultiSigWallet");

    let signers: Array<Signer>;
    signers = await ethers.getSigners();
    const quorum = 2;
    const owners = [
      await signers[0].getAddress(),
      await signers[1].getAddress(),
      await signers[2].getAddress(),
    ];
    const multiSigWallet = await MultiSigWallet.deploy(owners, quorum);

    return {
      multiSigWallet,
      signers,
    };
  }

  describe("receive", async function () {
    it("should emit Deposit event", async () => {
      const { multiSigWallet, signers } = await loadFixture(deploy);
      const tx = signers[0].sendTransaction({
        to: multiSigWallet.address,
        value: ethers.utils.parseEther("25"),
      });
      await expect(tx)
        .to.emit(multiSigWallet, "Deposit")
        .withArgs(
          await signers[0].getAddress(),
          ethers.utils.parseEther("25"),
          ethers.utils.parseEther("25")
        );
    });
  });

  describe("submitTransaction", async function () {
    it("should submit transaction from owner", async () => {
      const { multiSigWallet, signers } = await loadFixture(deploy);
      const numTxsBefore = await multiSigWallet.getTransactionCount();

      const to = await signers[1].getAddress();
      const value = ethers.utils.parseEther("5");
      const data = "0x00";
      const numConfirmations = 0;

      // Submit a proposal to send 5 ether to signer1's address
      const tx = await multiSigWallet
        .connect(signers[0])
        .submitTransaction(to, value, data);
      await tx.wait();

      const numTxsAfter = await multiSigWallet.getTransactionCount();
      expect(numTxsAfter).to.equal(numTxsBefore.add(1));

      const transaction = await multiSigWallet.getTransaction(0);
      expect(transaction.to).to.equal(to);
      expect(transaction.value).to.equal(value);
      expect(transaction.data).to.equal(data);
      expect(transaction.executed).to.be.false;
      expect(transaction.numConfirmations).to.equal(numConfirmations);

      await expect(tx)
        .to.emit(multiSigWallet, "SubmitTransaction")
        .withArgs(await signers[0].getAddress(), 0, to, value, data);
    });

    it("should revert for non-owner", async () => {
      const { multiSigWallet, signers } = await loadFixture(deploy);
      await expect(
        multiSigWallet
          .connect(signers[3])
          .submitTransaction(
            await signers[1].getAddress(),
            ethers.utils.parseEther("1.0"),
            "0x00"
          )
      ).to.be.revertedWith("not owner");
    });
  });

  describe("confirmTransaction", async function () {
    beforeEach(async () => {
      const { multiSigWallet, signers } = await loadFixture(deploy);
      // Submit a proposal to send 5 ether to signer1's address
      const tx = await multiSigWallet
        .connect(signers[0])
        .submitTransaction(
          await signers[3].getAddress(),
          ethers.utils.parseEther("5"),
          "0x00"
        );
      await tx.wait();
      signers[0].sendTransaction({
        to: multiSigWallet.address,
        value: ethers.utils.parseEther("25"),
      });
    });

    it("should revert for non-owner", async () => {
      const { multiSigWallet, signers } = await loadFixture(deploy);
      await expect(
        multiSigWallet.connect(signers[3]).confirmTransaction(0)
      ).to.be.revertedWith("not owner");
    });

    it("should revert for idx out of bounds", async () => {
      const { multiSigWallet, signers } = await loadFixture(deploy);
      await expect(
        multiSigWallet.connect(signers[0]).confirmTransaction(1)
      ).to.be.revertedWith("tx does not exist");
    });

    it("should revert if owner already confirmed", async () => {
      const { multiSigWallet, signers } = await loadFixture(deploy);
      const tx = await multiSigWallet.connect(signers[0]).confirmTransaction(0);
      await tx.wait();
      await expect(
        multiSigWallet.connect(signers[0]).confirmTransaction(0)
      ).to.be.revertedWith("tx already confirmed");
    });

    it("should revert if transaction already executed", async () => {
      const { multiSigWallet, signers } = await loadFixture(deploy);
      for (let i of [0, 1]) {
        const tx = await multiSigWallet
          .connect(signers[i])
          .confirmTransaction(0);
        await tx.wait();
      }
      // Execute the transaction
      const executeTx = await multiSigWallet
        .connect(signers[0])
        .executeTransaction(0);
      await executeTx.wait();

      // Shouldn't be able to reconfirm it
      await expect(
        multiSigWallet.connect(signers[2]).confirmTransaction(0)
      ).to.be.revertedWith("tx already executed");
    });

    it("should accept for owner who hasn't confirmed yet", async () => {
      const { multiSigWallet, signers } = await loadFixture(deploy);
      const tx = await multiSigWallet.connect(signers[0]).confirmTransaction(0);
      await tx.wait();

      const transaction = await multiSigWallet.getTransaction(0);
      expect(transaction.numConfirmations).to.equal(1);
      expect(await multiSigWallet.isConfirmed(0, await signers[0].getAddress()))
        .to.be.true;

      await expect(tx)
        .to.emit(multiSigWallet, "ConfirmTransaction")
        .withArgs(await signers[0].getAddress(), 0);
    });
  });

  describe("revokeConfirmation", async function () {
    beforeEach(async () => {
      const { multiSigWallet, signers } = await loadFixture(deploy);
      // Submit a proposal to send 5 ether to signer1's address
      const tx = await multiSigWallet
        .connect(signers[0])
        .submitTransaction(
          await signers[3].getAddress(),
          ethers.utils.parseEther("5"),
          "0x00"
        );
      await tx.wait();
      signers[0].sendTransaction({
        to: multiSigWallet.address,
        value: ethers.utils.parseEther("25"),
      });

      // Signer 0 confirms
      await multiSigWallet.connect(signers[0]).confirmTransaction(0);
    });

    it("should revert for non-owner", async () => {
      const { multiSigWallet, signers } = await loadFixture(deploy);
      await expect(
        multiSigWallet.connect(signers[3]).revokeConfirmation(0)
      ).to.be.revertedWith("not owner");
    });

    it("should revert if tx doesn't exist", async () => {
      const { multiSigWallet, signers } = await loadFixture(deploy);
      await expect(
        multiSigWallet.connect(signers[0]).revokeConfirmation(1)
      ).to.be.revertedWith("tx does not exist");
    });

    it("should revert if tx already executed", async () => {
      const { multiSigWallet, signers } = await loadFixture(deploy);
      // Signer 1 confirms and executes the transaction
      signers[1].sendTransaction({
        to: multiSigWallet.address,
        value: ethers.utils.parseEther("25"),
      });
      await multiSigWallet.connect(signers[1]).confirmTransaction(0);
      await multiSigWallet.executeTransaction(0);
      await expect(
        multiSigWallet.connect(signers[1]).revokeConfirmation(0)
      ).to.be.revertedWith("tx already executed");
    });

    it("should revert if not confirmed first", async () => {
      const { multiSigWallet, signers } = await loadFixture(deploy);
      await expect(
        multiSigWallet.connect(signers[1]).revokeConfirmation(0)
      ).to.be.revertedWith("tx not confirmed");
    });

    it("should succeeed for owner who has confirmed", async () => {
      const { multiSigWallet, signers } = await loadFixture(deploy);
      const tx = await multiSigWallet.connect(signers[0]).revokeConfirmation(0);
      const transaction = await multiSigWallet.getTransaction(0);
      expect(transaction.numConfirmations).to.equal(0);
      expect(await multiSigWallet.isConfirmed(0, await signers[0].getAddress()))
        .to.be.false;
      await expect(tx)
        .to.emit(multiSigWallet, "RevokeConfirmation")
        .withArgs(await signers[0].getAddress(), 0);
    });
  });

  describe("executeTransaction", async function () {
    beforeEach(async () => {
      const { multiSigWallet, signers } = await loadFixture(deploy);
      // Submit a proposal to send 5 ether to signer1's address
      await multiSigWallet
        .connect(signers[0])
        .submitTransaction(
          await signers[3].getAddress(),
          ethers.utils.parseEther("5"),
          "0x00"
        );
      signers[0].sendTransaction({
        to: multiSigWallet.address,
        value: ethers.utils.parseEther("25"),
      });

      // Signers 0 and 1 confirm, reaching the threshold
      for (let i of [0, 1]) {
        const tx = await multiSigWallet
          .connect(signers[i])
          .confirmTransaction(0);
        await tx.wait();
      }
    });

    it("should revert for non owner", async () => {
      const { multiSigWallet, signers } = await loadFixture(deploy);
      await expect(
        multiSigWallet.connect(signers[3]).executeTransaction(0)
      ).to.be.revertedWith("not owner");
    });

    it("should revert if transaction doesn't exist", async () => {
      const { multiSigWallet, signers } = await loadFixture(deploy);
      await expect(
        multiSigWallet.connect(signers[0]).executeTransaction(1)
      ).to.be.revertedWith("tx does not exist");
    });

    it("should revert if already executed", async () => {
      const { multiSigWallet, signers } = await loadFixture(deploy);
      await multiSigWallet.connect(signers[0]).executeTransaction(0);
      await expect(
        multiSigWallet.connect(signers[0]).executeTransaction(0)
      ).to.be.revertedWith("tx already executed");
    });

    it("should succeed :)", async () => {
      const { multiSigWallet, signers } = await loadFixture(deploy);
      const tx = await multiSigWallet.connect(signers[0]).executeTransaction(0);
      const transaction = await multiSigWallet.getTransaction(0);
      expect(transaction.executed).to.be.true;
      expect(tx)
        .to.emit(multiSigWallet, "ExecuteTransaction")
        .withArgs(await signers[0].getAddress(), 0);
    });
  });
});
