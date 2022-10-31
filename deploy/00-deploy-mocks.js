const { network } = require("hardhat");
const { developmentChains } = require("../helper-hardhat-config");

//此值就是chainlink documention的premium,為0.25顆LINK token
const BASE_FEE = ethers.utils.parseEther("0.25");
const GAS_PRICE_LINK = 1e9; //1後面9個0,這個變數會依照當前區塊鏈網路的gas,自動計算

module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();
  //const chainId = network.config.chainId;
  const args = [BASE_FEE, GAS_PRICE_LINK];

  if (developmentChains.includes(network.name)) {
    log("Local network detected! Deploying mocks...");
    await deploy("VRFCoordinatorV2Mock", {
      from: deployer,
      log: true,
      args: args,
      waitConfirmations: network.config.blockConfirmations || 1,
    });
    log("Mocks Deployed!");
    log("------------------------------------------");
  }
};

module.exports.tags = ["all", "mocks"];
