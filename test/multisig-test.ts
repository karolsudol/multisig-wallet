import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("MultiSigWallet", function () {
  async function deploy() {
    const [owner, acc1, acc2, acc3, acc4] = await ethers.getSigners();

    const owners = [acc1.address, acc2.address, acc3.address];

    const MultiSigWallet = await ethers.getContractFactory("MultiSigWallet");
    const multiSigWallet = await MultiSigWallet.deploy(owners, 2);

    return {
      owner,
      owners,
      acc1,
      acc2,
      acc3,
      acc4,
      multiSigWallet,
    };
  }

  describe("transactions", function () {
    it("Should receive deposit correctly", async function () {
      const { acc1, multiSigWallet } = await loadFixture(deploy);
      const ten = "10";

      await expect(
        acc1.sendTransaction({
          to: multiSigWallet.address,
          value: ethers.utils.parseEther(ten),
        })
      )
        .to.emit(multiSigWallet, "Deposit")
        .withArgs(
          await acc1.getAddress(),
          ethers.utils.parseEther(ten),
          ethers.utils.parseEther(ten)
        );
    });

    it("Should submit transaction correctly", async function () {
      const { acc1, multiSigWallet } = await loadFixture(deploy);
      const numTxsBefore = await multiSigWallet.getTransactionCount();

      const to = await acc1.getAddress();
      const value = ethers.utils.parseEther("15");
      const data = "0x00";
      const numConfirmations = 0;

      // Submit a proposal to send 15 ether to signer1's address
      const tx = await multiSigWallet
        .connect(acc1)
        .submitTransaction(to, value, data);

      await tx.wait();

      expect(await multiSigWallet.getTransactionCount()).to.equal(
        numTxsBefore.add(1)
      );

      const transaction = await multiSigWallet.getTransaction(0);
      expect(transaction.to).to.equal(to);
      expect(transaction.value).to.equal(value);
      expect(transaction.data).to.equal(data);
      expect(transaction.executed).to.be.false;

      expect(transaction.numConfirmations).to.equal(numConfirmations);
      await expect(tx)
        .to.emit(multiSigWallet, "SubmitTransaction")
        .withArgs(await acc1.getAddress(), 0, to, value, data);
    });

    it("Should transaction correctly", async function () {
      const { owner, acc1, acc2, acc3, acc4, multiSigWallet } =
        await loadFixture(deploy);

      await expect(
        multiSigWallet
          .connect(acc4)
          .submitTransaction(
            await acc1.getAddress(),
            ethers.utils.parseEther("1.0"),
            "0x00"
          )
      ).to.be.revertedWith("not owner");
    });
  });

  describe("confirmations", async function () {
    const { owners, acc1, acc4, multiSigWallet } = await loadFixture(deploy);
    it("Should revert for non-owner", async function () {
      await expect(
        multiSigWallet.connect(acc4).confirmTransaction(0)
      ).to.be.revertedWith("not owner");
    });

    it("should revert for idx out of bounds", async () => {
      await expect(
        multiSigWallet.connect(acc4).confirmTransaction(1)
      ).to.be.revertedWith("tx does not exist");
    });

    it("should revert if owner already confirmed", async () => {
      const tx = await multiSigWallet.connect(acc1).confirmTransaction(0);
      await tx.wait();
      await expect(
        multiSigWallet.connect(acc1).confirmTransaction(0)
      ).to.be.revertedWith("tx already confirmed");
    });

    it("should revert if transaction already executed", async () => {
      for (let i of [0, 1]) {
        const tx = await multiSigWallet
          .connect(owners[i])
          .confirmTransaction(0);
        await tx.wait();
      }
      // Execute the transaction
      const executeTx = await multiSigWallet
        .connect(owners[0])
        .executeTransaction(0);
      await executeTx.wait();

      // Shouldn't be able to reconfirm it
      await expect(
        multiSigWallet.connect(owners[2]).confirmTransaction(0)
      ).to.be.revertedWith("tx already executed");
    });

    it("should accept for owner who hasn't confirmed yet", async () => {
      const tx = await multiSigWallet.connect(acc1).confirmTransaction(0);
      await tx.wait();

      const transaction = await multiSigWallet.getTransaction(0);
      expect(transaction.numConfirmations).to.equal(1);
      expect(await multiSigWallet.isConfirmed(0, await acc1.getAddress())).to.be
        .true;

      await expect(tx)
        .to.emit(multiSigWallet, "ConfirmTransaction")
        .withArgs(await acc1.getAddress(), 0);
    });
  });

  describe("revokeConfirmation", async function () {
    const { owners, acc1, acc2, acc3, acc4, multiSigWallet } =
      await loadFixture(deploy);
    beforeEach(async function () {
      // Submit a proposal to send 5 ether to signer1's address
      const tx = await multiSigWallet
        .connect(acc1)
        .submitTransaction(
          await acc4.getAddress(),
          ethers.utils.parseEther("5"),
          "0x00"
        );
      await tx.wait();
      await acc3.sendTransaction({
        to: multiSigWallet.address,
        value: ethers.utils.parseEther("25"),
      });
      // Signer 0 confirms
      await multiSigWallet.connect(acc1).confirmTransaction(0);
    });

    it("should revert for non-owner", async () => {
      await expect(
        multiSigWallet.connect(acc1).revokeConfirmation(0)
      ).to.be.revertedWith("not owner");
    });

    it("should revert if tx doesn't exist", async () => {
      await expect(
        multiSigWallet.connect(acc1).revokeConfirmation(1)
      ).to.be.revertedWith("tx does not exist");
    });

    it("should revert if tx already executed", async () => {
      // Signer 1 confirms and executes the transaction
      await acc1.sendTransaction({
        to: multiSigWallet.address,
        value: ethers.utils.parseEther("25"),
      });
      await multiSigWallet.connect(acc1).confirmTransaction(0);
      await multiSigWallet.executeTransaction(0);
      await expect(
        multiSigWallet.connect(acc1).revokeConfirmation(0)
      ).to.be.revertedWith("tx already executed");
    });

    it("should revert if not confirmed first", async () => {
      await expect(
        multiSigWallet.connect(acc1).revokeConfirmation(0)
      ).to.be.revertedWith("tx not confirmed");
    });

    it("should succeeed for owner who has confirmed", async () => {
      const tx = await multiSigWallet.connect(acc1).revokeConfirmation(0);
      const transaction = await multiSigWallet.getTransaction(0);
      expect(transaction.numConfirmations).to.equal(0);
      expect(await multiSigWallet.isConfirmed(0, await acc1.getAddress())).to.be
        .false;
      await expect(tx)
        .to.emit(multiSigWallet, "RevokeConfirmation")
        .withArgs(await acc1.getAddress(), 0);
    });
  });

  describe("execute transaction", async function () {
    const { owners, acc1, acc2, acc3, acc4, multiSigWallet } =
      await loadFixture(deploy);
    beforeEach(async function () {
      await multiSigWallet
        .connect(acc1)
        .submitTransaction(
          await acc3.getAddress(),
          ethers.utils.parseEther("5"),
          "0x00"
        );

      acc1.sendTransaction({
        to: multiSigWallet.address,
        value: ethers.utils.parseEther("25"),
      });

      // Signers 0 and 1 confirm, reaching the threshold
      for (let i of [0, 1]) {
        const tx = await multiSigWallet
          .connect(owners[i])
          .confirmTransaction(0);
        await tx.wait();
      }
    });

    it("should revert for non-owner", async () => {});
  });

  // describe("executeTransaction", async function () {
  //   const { owners, acc1, acc2, acc3, acc4, multiSigWallet } =
  //     await loadFixture(deploy);

  //   beforeEach(async function () {

  //     // Submit a proposal to send 5 ether to signer1's address
  //     await multiSigWallet
  //       .connect(acc1)
  //       .submitTransaction(
  //         await acc3.getAddress(),
  //         ethers.utils.parseEther("5"),
  //         "0x00"
  //       );
  //     await acc1.sendTransaction({
  //       to: multiSigWallet.address,
  //       value: ethers.utils.parseEther("25"),
  //     });

  //     // Signers 0 and 1 confirm, reaching the threshold
  //     for (let i of [0, 1]) {
  //       const tx = await multiSigWallet
  //         .connect(owners[i])
  //         .confirmTransaction(0);
  //       await tx.wait();
  //     }
  //   });

  //   it("should revert for non owner", async () => {
  //     await expect(
  //       multiSigWallet.connect(acc3).executeTransaction(0)
  //     ).to.be.revertedWith("not owner");
  //   });

  //   it("should revert if transaction doesn't exist", async () => {
  //     await expect(
  //       multiSigWallet.connect(acc1).executeTransaction(1)
  //     ).to.be.revertedWith("tx does not exist");
  //   });

  //   it("should revert if already executed", async () => {
  //     await multiSigWallet.connect(acc1).executeTransaction(0);
  //     await expect(
  //       multiSigWallet.connect(acc1).executeTransaction(0)
  //     ).to.be.revertedWith("tx already executed");
  //   });

  //   it("should succeed :)", async () => {
  //     const tx = await multiSigWallet.connect(acc1).executeTransaction(0);
  //     const transaction = await multiSigWallet.getTransaction(0);
  //     expect(transaction.executed).to.be.true;
  //     await expect(tx)
  //       .to.emit(multiSigWallet, "ExecuteTransaction")
  //       .withArgs(await acc1.getAddress(), 0);
  //   });
  // });
});
