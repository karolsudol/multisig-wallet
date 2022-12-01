import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { formatEther, parseEther, parseUnits } from "ethers/lib/utils";
import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { MultiSigWallet } from "../src/typechain-types/MultiSigWallet";

import { expect } from "chai";
import { ethers } from "hardhat";

describe("MultiSigWallet", () => {
  let multiSigWallet: MultiSigWallet;
  let owner: SignerWithAddress;
  let addr1: SignerWithAddress;
  let addr2: SignerWithAddress;
  let addr3: SignerWithAddress;
  let addr4: SignerWithAddress;

  beforeEach(async function () {
    [owner, addr1, addr2, addr3, addr4] = await ethers.getSigners();
    const MultiSigWallet = await ethers.getContractFactory("MultiSigWallet");
    const quorum = 2;
    // const web3 = MultiSigWallet.web3;

    multiSigWallet = await MultiSigWallet.deploy(
      [addr1.address, addr2.address, addr3.address],
      quorum
    );
    await multiSigWallet.deployed();
  });

  describe("deposit and receive", async function () {
    it("should receive correct ammount and emit deposit event", async () => {
      expect(
        formatEther(await ethers.provider.getBalance(multiSigWallet.address))
      ).to.equal(formatEther("0"));

      const tx = addr1.sendTransaction({
        to: multiSigWallet.address,
        value: parseEther("100"),
      });
      await expect(tx)
        .to.emit(multiSigWallet, "Deposit")
        .withArgs(
          await addr1.getAddress(),
          parseEther("100"),
          parseEther("100")
        );

      expect(
        formatEther(await ethers.provider.getBalance(multiSigWallet.address))
      ).to.equal("100.0");
    });
  });

  describe("submit transaction", async function () {
    it("should revert submiting transaction", async () => {
      const to = addr1.address;
      const value = parseEther("10");
      const data = "0x00";

      await expect(
        multiSigWallet.connect(addr4).submitTransaction(to, value, data)
      ).to.be.revertedWith("not owner");
    });

    it("should submit transaction", async () => {
      const txCount0 = await multiSigWallet.getTransactionCount();

      const to = addr4.address;
      const value = parseEther("10");
      const data = "0x00";

      // Submit a proposal to send 10 ether to acc4
      const tx = await multiSigWallet
        .connect(addr1)
        .submitTransaction(to, value, data);
      await tx.wait();

      expect(await multiSigWallet.getTransactionCount()).to.equal(
        txCount0.add(1)
      );

      const transaction = await multiSigWallet.getTransaction(0);
      expect(transaction.to).to.equal(to);
      expect(transaction.value).to.equal(value);
      expect(transaction.data).to.equal(data);
      expect(transaction.executed).to.be.false;
      expect(transaction.numConfirmations).to.equal(0);

      await expect(tx)
        .to.emit(multiSigWallet, "SubmitTransaction")
        .withArgs(addr1.address, 0, to, value, data);
    });
  });

  describe("update owners ", async function () {
    it("should revoke adding owner", async () => {
      await expect(
        multiSigWallet.connect(addr4).addOwner(addr4.getAddress())
      ).to.be.revertedWith("only wallet");

      // await expect(
      //   multiSigWallet
      //     .connect(multiSigWallet.address)
      //     .addOwner(signers[4].getAddress())
      // ).to.be.revertedWith("only wallet");

      // await expect(
      //   multiSigWallet.addOwner(signers[3].getAddress())
      // ).to.be.revertedWith("only wallet");

      // await expect(
      //   await multiSigWallet.addOwner(signers[0].getAddress())
      // ).to.be.revertedWith("only wallet");
    });
    it("should add owner", async () => {
      expect((await multiSigWallet.getOwners()).length).equal(3);

      // await expect(multiSigWallet.addOwner(signers[3].getAddress()))
      //   .to.emit(multiSigWallet, "OwnerAddition")
      //   .withArgs(await signers[3].getAddress());

      // expect((await multiSigWallet.getOwners()).length).equal(4);
    });

    it("should remove owner", async () => {});
  });

  describe("revoke tx confirmations", async function () {
    it("should revert for non-owner", async () => {
      await expect(
        multiSigWallet.connect(addr4).revokeConfirmation(0)
      ).to.be.revertedWith("not owner");
    });

    it("should revert if tx doesn't exist", async () => {
      await expect(
        multiSigWallet.connect(addr1).revokeConfirmation(1)
      ).to.be.revertedWith("tx does not exist");
    });

    it("should revert if not enough confirmation to execute", async () => {
      const to = addr4.address;
      const value = parseEther("10");
      const data = "0x00";

      await multiSigWallet.connect(addr1).submitTransaction(to, value, data);

      await addr1.sendTransaction({
        to: multiSigWallet.address,
        value: value,
      });

      await multiSigWallet.connect(addr1).confirmTransaction(0);

      await expect(
        multiSigWallet.connect(addr1).executeTransaction(0)
      ).to.be.revertedWith("not enough confirmation to execute");
    });

    it("should revert if tx already executed", async () => {
      const to = addr4.address;
      const value = parseEther("10");
      const data = "0x00";

      await multiSigWallet.connect(addr1).submitTransaction(to, value, data);

      await addr1.sendTransaction({
        to: multiSigWallet.address,
        value: value,
      });

      await multiSigWallet.connect(addr1).confirmTransaction(0);
      await multiSigWallet.connect(addr2).confirmTransaction(0);
      await multiSigWallet.connect(addr1).executeTransaction(0);

      await expect(
        multiSigWallet.connect(addr3).executeTransaction(0)
      ).to.be.revertedWith("tx already executed");
    });

    it("should revoke for owner that confirmed prior", async () => {
      const to = addr2.address;
      const value = parseEther("10");
      const data = "0x00";

      await multiSigWallet.connect(addr1).submitTransaction(to, value, data);

      await addr1.sendTransaction({
        to: multiSigWallet.address,
        value: value,
      });

      await multiSigWallet.connect(addr1).confirmTransaction(0);

      const tx = await multiSigWallet.connect(addr1).revokeConfirmation(0);
      const transaction = await multiSigWallet.getTransaction(0);
      expect(transaction.numConfirmations).to.equal(0);
      expect(await multiSigWallet.isConfirmed(0, addr1.address)).to.be.false;
      await expect(tx)
        .to.emit(multiSigWallet, "RevokeConfirmation")
        .withArgs(addr1.address, 0);
    });
  });

  describe("execute transactions", async function () {
    it("should revert for non owner ", async () => {
      const to = addr2.address;
      const value = parseEther("10");
      const data = "0x00";

      await multiSigWallet.connect(addr1).submitTransaction(to, value, data);
      await addr1.sendTransaction({
        to: multiSigWallet.address,
        value: value,
      });

      // quorum achived
      await multiSigWallet.connect(addr1).confirmTransaction(0);
      await multiSigWallet.connect(addr2).confirmTransaction(0);

      await expect(
        multiSigWallet.connect(addr4).executeTransaction(0)
      ).to.be.revertedWith("not owner");
    });

    it("tx should execute correctly", async () => {
      const to = addr2.address;
      const value = parseEther("10");
      const data = "0x00";

      await multiSigWallet.connect(addr1).submitTransaction(to, value, data);
      await addr1.sendTransaction({
        to: multiSigWallet.address,
        value: value,
      });

      // quorum achived
      await multiSigWallet.connect(addr1).confirmTransaction(0);
      await multiSigWallet.connect(addr2).confirmTransaction(0);

      const tx = await multiSigWallet.connect(addr1).executeTransaction(0);
      const transaction = await multiSigWallet.getTransaction(0);
      expect(transaction.executed).to.be.true;
      await expect(tx)
        .to.emit(multiSigWallet, "ExecuteTransaction")
        .withArgs(await addr1.getAddress(), 0);
    });
  });
});
