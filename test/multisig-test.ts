import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { formatEther, parseEther, parseUnits } from "ethers/lib/utils";

import { expect } from "chai";
import { ethers } from "hardhat";
import { Signer } from "ethers";

// const WeiToEther = formatEther(weiValue);
// const EtherToWei = parseUnits("0.11","ether")

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
    it("should receive correct ammount and emit deposit event", async () => {
      const { multiSigWallet, signers } = await loadFixture(deploy);

      expect(
        formatEther(await ethers.provider.getBalance(multiSigWallet.address))
      ).to.equal(formatEther("0"));

      const tx = signers[0].sendTransaction({
        to: multiSigWallet.address,
        value: parseEther("100"),
      });
      await expect(tx)
        .to.emit(multiSigWallet, "Deposit")
        .withArgs(
          await signers[0].getAddress(),
          parseEther("100"),
          parseEther("100")
        );

      expect(
        formatEther(await ethers.provider.getBalance(multiSigWallet.address))
      ).to.equal("100.0");
    });
  });

  describe("submit transaction", async function () {
    it("should submit transaction correctly", async () => {
      const { multiSigWallet, signers } = await loadFixture(deploy);
      const txCount0 = await multiSigWallet.getTransactionCount();

      const to = await signers[1].getAddress();
      const value = parseEther("10");
      const data = "0x00";

      await expect(
        multiSigWallet.connect(signers[3]).submitTransaction(to, value, data)
      ).to.be.revertedWith("not owner");

      // Submit a proposal to send 10 ether to signer1's address
      const tx = await multiSigWallet
        .connect(signers[0])
        .submitTransaction(to, value, data);
      await tx.wait();

      const txCount1 = await multiSigWallet.getTransactionCount();
      expect(txCount1).to.equal(txCount0.add(1));

      const transaction = await multiSigWallet.getTransaction(0);
      expect(transaction.to).to.equal(to);
      expect(transaction.value).to.equal(value);
      expect(transaction.data).to.equal(data);
      expect(transaction.executed).to.be.false;
      expect(transaction.numConfirmations).to.equal(0);

      await expect(tx)
        .to.emit(multiSigWallet, "SubmitTransaction")
        .withArgs(await signers[0].getAddress(), 0, to, value, data);
    });
  });

  describe("confirm transaction", async function () {
    it("should revert for non-owner correctly", async () => {
      const { multiSigWallet, signers } = await loadFixture(deploy);
      await expect(
        multiSigWallet.connect(signers[3]).confirmTransaction(0)
      ).to.be.revertedWith("not owner");
    });

    it("should revert for idx out of bounds correctl;y", async () => {
      const { multiSigWallet, signers } = await loadFixture(deploy);
      await expect(
        multiSigWallet.connect(signers[0]).confirmTransaction(1)
      ).to.be.revertedWith("tx does not exist");
    });

    it("should revert if tx has been confirmed correctly", async () => {
      const { multiSigWallet, signers } = await loadFixture(deploy);

      await multiSigWallet
        .connect(signers[0])
        .submitTransaction(
          await signers[3].getAddress(),
          ethers.utils.parseEther("10"),
          "0x00"
        );

      await signers[0].sendTransaction({
        to: multiSigWallet.address,
        value: ethers.utils.parseEther("10"),
      });

      await multiSigWallet.connect(signers[0]).confirmTransaction(0);

      await expect(
        multiSigWallet.connect(signers[0]).confirmTransaction(0)
      ).to.be.revertedWith("tx already confirmed");
    });

    it("should revert if tx executed correctly", async () => {
      const { multiSigWallet, signers } = await loadFixture(deploy);

      await multiSigWallet
        .connect(signers[0])
        .submitTransaction(
          await signers[3].getAddress(),
          ethers.utils.parseEther("10"),
          "0x00"
        );

      await signers[0].sendTransaction({
        to: multiSigWallet.address,
        value: ethers.utils.parseEther("10"),
      });

      for (let i of [0, 1]) {
        const tx = await multiSigWallet
          .connect(signers[i])
          .confirmTransaction(0);
        await tx.wait();
      }
      await multiSigWallet.connect(signers[0]).executeTransaction(0);

      await expect(
        multiSigWallet.connect(signers[2]).confirmTransaction(0)
      ).to.be.revertedWith("tx already executed");
    });

    it("should confirm tx correctly", async () => {
      const { multiSigWallet, signers } = await loadFixture(deploy);

      await multiSigWallet
        .connect(signers[0])
        .submitTransaction(
          await signers[3].getAddress(),
          ethers.utils.parseEther("10"),
          "0x00"
        );

      await signers[0].sendTransaction({
        to: multiSigWallet.address,
        value: ethers.utils.parseEther("10"),
      });

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

  describe("revoke tx confirmations", async function () {
    it("should revert for non-owner correctly", async () => {
      const { multiSigWallet, signers } = await loadFixture(deploy);
      await expect(
        multiSigWallet.connect(signers[3]).revokeConfirmation(0)
      ).to.be.revertedWith("not owner");
    });

    it("should revert if tx doesn't exist correctly", async () => {
      const { multiSigWallet, signers } = await loadFixture(deploy);
      await expect(
        multiSigWallet.connect(signers[0]).revokeConfirmation(1)
      ).to.be.revertedWith("tx does not exist");
    });

    it("should revert if tx already executed correctly", async () => {
      const { multiSigWallet, signers } = await loadFixture(deploy);

      const tx = await multiSigWallet
        .connect(signers[0])
        .submitTransaction(
          await signers[3].getAddress(),
          ethers.utils.parseEther("10"),
          "0x00"
        );
      await tx.wait();
      signers[0].sendTransaction({
        to: multiSigWallet.address,
        value: ethers.utils.parseEther("10"),
      });

      await multiSigWallet.connect(signers[0]).confirmTransaction(0);

      await signers[1].sendTransaction({
        to: multiSigWallet.address,
        value: ethers.utils.parseEther("10"),
      });
      await multiSigWallet.connect(signers[1]).confirmTransaction(0);
      await multiSigWallet.executeTransaction(0);
      await expect(
        multiSigWallet.connect(signers[1]).revokeConfirmation(0)
      ).to.be.revertedWith("tx already executed");
    });

    it("should revert if not confirmed correctly", async () => {
      const { multiSigWallet, signers } = await loadFixture(deploy);
      const tx = await multiSigWallet
        .connect(signers[0])
        .submitTransaction(
          await signers[3].getAddress(),
          ethers.utils.parseEther("10"),
          "0x00"
        );
      await tx.wait();
      signers[0].sendTransaction({
        to: multiSigWallet.address,
        value: ethers.utils.parseEther("10"),
      });

      await multiSigWallet.connect(signers[0]).confirmTransaction(0);

      await expect(
        multiSigWallet.connect(signers[1]).revokeConfirmation(0)
      ).to.be.revertedWith("tx not confirmed");
    });

    it("should revoke for owner that confirmed prior, correctly", async () => {
      const { multiSigWallet, signers } = await loadFixture(deploy);

      await multiSigWallet
        .connect(signers[0])
        .submitTransaction(
          await signers[3].getAddress(),
          ethers.utils.parseEther("10"),
          "0x00"
        );

      await signers[0].sendTransaction({
        to: multiSigWallet.address,
        value: ethers.utils.parseEther("10"),
      });

      await multiSigWallet.connect(signers[0]).confirmTransaction(0);

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

  describe("execute transactions", async function () {
    it("should revert for non owner correctly ", async () => {
      const { multiSigWallet, signers } = await loadFixture(deploy);
      await multiSigWallet
        .connect(signers[0])
        .submitTransaction(
          await signers[3].getAddress(),
          ethers.utils.parseEther("10"),
          "0x00"
        );
      await signers[0].sendTransaction({
        to: multiSigWallet.address,
        value: ethers.utils.parseEther("10"),
      });

      // quorum achived
      for (let i of [0, 1]) {
        const tx = await multiSigWallet
          .connect(signers[i])
          .confirmTransaction(0);
        await tx.wait();
      }
      await expect(
        multiSigWallet.connect(signers[3]).executeTransaction(0)
      ).to.be.revertedWith("not owner");
    });

    it("should revert if transaction doesn't exist correctly ", async () => {
      const { multiSigWallet, signers } = await loadFixture(deploy);
      await multiSigWallet
        .connect(signers[0])
        .submitTransaction(
          await signers[3].getAddress(),
          ethers.utils.parseEther("10"),
          "0x00"
        );
      await signers[0].sendTransaction({
        to: multiSigWallet.address,
        value: ethers.utils.parseEther("10"),
      });

      // quorum achived
      for (let i of [0, 1]) {
        const tx = await multiSigWallet
          .connect(signers[i])
          .confirmTransaction(0);
        await tx.wait();
      }
      await expect(
        multiSigWallet.connect(signers[0]).executeTransaction(1)
      ).to.be.revertedWith("tx does not exist");
    });

    it("should revert if tx is already executed correctly ", async () => {
      const { multiSigWallet, signers } = await loadFixture(deploy);

      await multiSigWallet
        .connect(signers[0])
        .submitTransaction(
          await signers[3].getAddress(),
          ethers.utils.parseEther("10"),
          "0x00"
        );
      await signers[0].sendTransaction({
        to: multiSigWallet.address,
        value: ethers.utils.parseEther("10"),
      });

      // quorum achived
      for (let i of [0, 1]) {
        const tx = await multiSigWallet
          .connect(signers[i])
          .confirmTransaction(0);
        await tx.wait();
      }

      await multiSigWallet.connect(signers[0]).executeTransaction(0);
      await expect(
        multiSigWallet.connect(signers[0]).executeTransaction(0)
      ).to.be.revertedWith("tx already executed");
    });

    it("tx should execute correctly", async () => {
      const { multiSigWallet, signers } = await loadFixture(deploy);

      await multiSigWallet
        .connect(signers[0])
        .submitTransaction(
          await signers[3].getAddress(),
          ethers.utils.parseEther("10"),
          "0x00"
        );
      await signers[0].sendTransaction({
        to: multiSigWallet.address,
        value: ethers.utils.parseEther("10"),
      });

      // quorum achived
      for (let i of [0, 1]) {
        const tx = await multiSigWallet
          .connect(signers[i])
          .confirmTransaction(0);
        await tx.wait();
      }

      const tx = await multiSigWallet.connect(signers[0]).executeTransaction(0);
      const transaction = await multiSigWallet.getTransaction(0);
      expect(transaction.executed).to.be.true;
      await expect(tx)
        .to.emit(multiSigWallet, "ExecuteTransaction")
        .withArgs(await signers[0].getAddress(), 0);
    });
  });
});
