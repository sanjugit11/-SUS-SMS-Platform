const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SUS + SMS contracts", function () {
  async function deployFixture() {
    const [owner, user, other] = await ethers.getSigners();
    const MockStablecoin = await ethers.getContractFactory("MockStablecoin");
    const usdc = await MockStablecoin.deploy("USD Coin", "USDC", 6);
    const usdt = await MockStablecoin.deploy("Tether", "USDT", 6);
    const dai = await MockStablecoin.deploy("Dai", "DAI", 18);
    const unsupported = await MockStablecoin.deploy("Unsupported", "BAD", 6);

    const amount = ethers.parseUnits("100000", 6);
    await usdc.mint(user.address, amount);
    await usdt.mint(user.address, amount);
    await unsupported.mint(user.address, amount);

    const SUSCore = await ethers.getContractFactory("SUSCore");
    const sus = await SUSCore.deploy([await usdc.getAddress(), await usdt.getAddress(), await dai.getAddress()], owner.address);

    const SMSCore = await ethers.getContractFactory("SMSCore");
    const sms = await SMSCore.deploy(await usdc.getAddress(), [await usdc.getAddress(), await usdt.getAddress(), await dai.getAddress()], owner.address);
    await dai.mint(await sms.getAddress(), ethers.parseEther("100000"));

    return { owner, user, other, usdc, usdt, dai, unsupported, sus, sms, amount };
  }

  async function depositFixture() {
    const fixture = await deployFixture();
    await fixture.usdc.connect(fixture.user).approve(await fixture.sus.getAddress(), fixture.amount);
    await fixture.sus.connect(fixture.user).deposit(await fixture.usdc.getAddress(), fixture.amount);
    return fixture;
  }

  describe("SUSCore", function () {
    it("deposits principal stablecoin and returns user balance", async function () {
      const { user, usdc, sus, amount } = await deployFixture();
      await usdc.connect(user).approve(await sus.getAddress(), amount);
      await expect(sus.connect(user).deposit(await usdc.getAddress(), amount))
        .to.emit(sus, "Deposited")
        .withArgs(user.address, await usdc.getAddress(), amount);

      const [balance, stablecoin] = await sus.getBalance(user.address);
      expect(balance).to.equal(amount);
      expect(stablecoin).to.equal(await usdc.getAddress());
    });

    it("withdraws principal stablecoin back to the original chain account", async function () {
      const { user, sus, amount } = await depositFixture();
      await expect(sus.connect(user).withdraw(amount)).to.emit(sus, "Withdrawn").withArgs(user.address, amount);
      const [balance] = await sus.getBalance(user.address);
      expect(balance).to.equal(0);
    });

    it("rejects unsupported deposits and principal stablecoin changes while funded", async function () {
      const { user, usdc, usdt, unsupported, sus, amount } = await deployFixture();
      await unsupported.connect(user).approve(await sus.getAddress(), amount);
      await expect(sus.connect(user).deposit(await unsupported.getAddress(), amount))
        .to.be.revertedWithCustomError(sus, "UnsupportedStablecoin")
        .withArgs(await unsupported.getAddress());

      await usdc.connect(user).approve(await sus.getAddress(), amount);
      await sus.connect(user).deposit(await usdc.getAddress(), amount);
      await usdt.connect(user).approve(await sus.getAddress(), amount);
      await expect(sus.connect(user).deposit(await usdt.getAddress(), 1))
        .to.be.revertedWithCustomError(sus, "PrincipalStablecoinLocked")
        .withArgs(await usdc.getAddress());
    });

    it("allows repeated deposits with the same principal stablecoin", async function () {
      const { user, usdc, sus, amount } = await deployFixture();
      await usdc.connect(user).approve(await sus.getAddress(), amount);
      await sus.connect(user).deposit(await usdc.getAddress(), amount / 2n);
      await sus.connect(user).deposit(await usdc.getAddress(), amount / 2n);

      const [balance, stablecoin] = await sus.getBalance(user.address);
      expect(balance).to.equal(amount);
      expect(stablecoin).to.equal(await usdc.getAddress());
    });

    it("rejects over-withdraws and owner debits over the available allocation balance", async function () {
      const { owner, user, sus, amount } = await depositFixture();
      await expect(sus.connect(user).withdraw(amount + 1n))
        .to.be.revertedWithCustomError(sus, "InsufficientBalance")
        .withArgs(amount + 1n, amount);

      await expect(sus.connect(owner).debitForAllocation(user.address, amount + 1n))
        .to.be.revertedWithCustomError(sus, "InsufficientBalance")
        .withArgs(amount + 1n, amount);
    });

    it("lets only the owner debit balances for allocation", async function () {
      const { other, user, sus, amount } = await depositFixture();
      await expect(sus.connect(other).debitForAllocation(user.address, 1))
        .to.be.revertedWithCustomError(sus, "OwnableUnauthorizedAccount")
        .withArgs(other.address);

      await sus.debitForAllocation(user.address, amount / 2n);
      const [balance] = await sus.getBalance(user.address);
      expect(balance).to.equal(amount / 2n);
    });

    it("pauses deposits, withdrawals, and allocation debits", async function () {
      const { owner, user, usdc, sus, amount } = await deployFixture();
      await sus.connect(owner).pause();
      await usdc.connect(user).approve(await sus.getAddress(), amount);
      await expect(sus.connect(user).deposit(await usdc.getAddress(), amount)).to.be.revertedWithCustomError(sus, "EnforcedPause");
      await expect(sus.connect(owner).debitForAllocation(user.address, 1)).to.be.revertedWithCustomError(sus, "EnforcedPause");

      await sus.connect(owner).unpause();
      await sus.connect(user).deposit(await usdc.getAddress(), amount);
      await sus.connect(owner).pause();
      await expect(sus.connect(user).withdraw(1)).to.be.revertedWithCustomError(sus, "EnforcedPause");
    });

    it("keeps supported stablecoins immutable after deployment by exposing no mutator", async function () {
      const { sus, usdc, unsupported } = await deployFixture();
      expect(await sus.isStablecoinSupported(await usdc.getAddress())).to.equal(true);
      expect(await sus.isStablecoinSupported(await unsupported.getAddress())).to.equal(false);
      expect(sus.interface.fragments.some((fragment) => fragment.name === "setSupportedStablecoin")).to.equal(false);
    });

    it("supports deployment with no initial stablecoins", async function () {
      const { owner, usdc } = await deployFixture();
      const SUSCore = await ethers.getContractFactory("SUSCore");
      const sus = await SUSCore.deploy([], owner.address);

      expect(await sus.isStablecoinSupported(await usdc.getAddress())).to.equal(false);
    });

    it("blocks delegatecall attempts", async function () {
      const { sus, usdc, amount } = await deployFixture();
      const Attacker = await ethers.getContractFactory("DelegatecallAttacker");
      const attacker = await Attacker.deploy();
      const payload = sus.interface.encodeFunctionData("deposit", [await usdc.getAddress(), amount]);
      const attack = await attacker.attack.staticCall(await sus.getAddress(), payload);
      expect(attack[0]).to.equal(false);
    });

    it("blocks reentrant calls during token transfer callbacks", async function () {
      const { owner, user } = await deployFixture();
      const ReentrantStablecoin = await ethers.getContractFactory("ReentrantStablecoin");
      const reentrant = await ReentrantStablecoin.deploy("Reentrant USD", "RUSD", 6);
      const amount = ethers.parseUnits("1000", 6);

      const SUSCore = await ethers.getContractFactory("SUSCore");
      const sus = await SUSCore.deploy([await reentrant.getAddress()], owner.address);
      await reentrant.mint(user.address, amount);
      await reentrant.connect(user).approve(await sus.getAddress(), amount);
      await reentrant.armSusAttack(await sus.getAddress());

      await expect(sus.connect(user).deposit(await reentrant.getAddress(), amount))
        .to.emit(sus, "Deposited")
        .withArgs(user.address, await reentrant.getAddress(), amount);
      const [balance] = await sus.getBalance(user.address);
      expect(balance).to.equal(amount);
    });
  });

  describe("SMSCore", function () {
    it("allocates output stablecoin on the destination chain", async function () {
      const { owner, user, dai, sms } = await deployFixture();
      const outputAmount = ethers.parseEther("100000");
      await expect(sms.connect(owner).allocate(user.address, outputAmount, await dai.getAddress()))
        .to.emit(sms, "Allocated")
        .withArgs(user.address, outputAmount, await sms.inputStablecoin(), await dai.getAddress());
      expect(await sms.getAllocatedBalance(user.address, await dai.getAddress())).to.equal(outputAmount);
      expect(await dai.balanceOf(user.address)).to.equal(outputAmount);
    });

    it("rejects unsupported output stablecoins", async function () {
      const { owner, user, sms, unsupported } = await deployFixture();
      await expect(sms.connect(owner).allocate(user.address, 1, await unsupported.getAddress()))
        .to.be.revertedWithCustomError(sms, "UnsupportedStablecoin")
        .withArgs(await unsupported.getAddress());
    });

    it("restricts allocation and pause controls to the owner", async function () {
      const { other, user, dai, sms } = await deployFixture();
      await expect(sms.connect(other).allocate(user.address, 1, await dai.getAddress()))
        .to.be.revertedWithCustomError(sms, "OwnableUnauthorizedAccount")
        .withArgs(other.address);
      await expect(sms.connect(other).pause())
        .to.be.revertedWithCustomError(sms, "OwnableUnauthorizedAccount")
        .withArgs(other.address);
    });

    it("pauses and unpauses allocations", async function () {
      const { owner, user, dai, sms } = await deployFixture();
      await sms.connect(owner).pause();
      await expect(sms.connect(owner).allocate(user.address, 1, await dai.getAddress())).to.be.revertedWithCustomError(sms, "EnforcedPause");
      await sms.connect(owner).unpause();
      await sms.connect(owner).allocate(user.address, 1, await dai.getAddress());
      expect(await sms.getAllocatedBalance(user.address, await dai.getAddress())).to.equal(1);
    });

    it("reports supported output stablecoins", async function () {
      const { dai, unsupported, sms } = await deployFixture();
      expect(await sms.isStablecoinSupported(await dai.getAddress())).to.equal(true);
      expect(await sms.isStablecoinSupported(await unsupported.getAddress())).to.equal(false);
    });

    it("supports deployment with no output stablecoins", async function () {
      const { owner, usdc } = await deployFixture();
      const SMSCore = await ethers.getContractFactory("SMSCore");
      const sms = await SMSCore.deploy(await usdc.getAddress(), [], owner.address);

      expect(await sms.isStablecoinSupported(await usdc.getAddress())).to.equal(false);
    });

    it("blocks reentrant allocations during output token transfers", async function () {
      const { user } = await deployFixture();
      const ReentrantStablecoin = await ethers.getContractFactory("ReentrantStablecoin");
      const reentrant = await ReentrantStablecoin.deploy("Reentrant USD", "RUSD", 6);

      const SMSCore = await ethers.getContractFactory("SMSCore");
      const sms = await SMSCore.deploy(await reentrant.getAddress(), [await reentrant.getAddress()], await reentrant.getAddress());
      await reentrant.mint(await sms.getAddress(), 10);
      await reentrant.armSmsAttack(await sms.getAddress(), user.address);

      await reentrant.triggerSmsAllocation(1);
      expect(await sms.getAllocatedBalance(user.address, await reentrant.getAddress())).to.equal(1);
      expect(await reentrant.balanceOf(user.address)).to.equal(1);
    });
  });
});
