const { network, ethers } = require("hardhat");
const {
  developmentChains,
  networkConfig,
} = require("../helper-hardhat-config");
const { verify } = require("../utils/verify");

//資助訂閱時會用到的變數,用來指定幾個代幣
const VRF_SUB_FUND_AMOUNT = ethers.utils.parseEther("2");

module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();
  const chainId = network.config.chainId;
  let vrfCoordinatorV2Address, subscriptionId;

  //若偵測到hardhat network
  if (developmentChains.includes(network.name)) {
    //則使用getContract抓取部署的合約VRFCoordinatorV2Mock
    const vrfCoordinatorV2Mock = await ethers.getContract(
      "VRFCoordinatorV2Mock"
    );
    vrfCoordinatorV2Address = vrfCoordinatorV2Mock.address;
    //使用部署好的mocks合約,呼叫createSubscription function,該function會觸發subscriptionId的事件
    const transactionResponse = await vrfCoordinatorV2Mock.createSubscription();
    //等待一個區塊確認,回傳的transactionReceipt, 裡面包含著emit事件
    const transactionReceipt = await transactionResponse.wait(1);
    //從transactionReceipt提取emit事件的參數,subId
    subscriptionId = transactionReceipt.events[0].args.subId;
    //fund subscription資助訂閱,輸入subscriptionId跟資助金額
    await vrfCoordinatorV2Mock.fundSubscription(
      subscriptionId,
      VRF_SUB_FUND_AMOUNT
    );
  } else {
    //若在其他網路,則偵測chainId,使用helper-hardhat-config中指定的地址.
    vrfCoordinatorV2Address = networkConfig[chainId]["vrfCoordinatorV2"];
    subscriptionId = networkConfig[chainId]["subscriptionId"];
  }

  const enteranceFee = networkConfig[chainId]["entranceFee"];
  const gasLane = networkConfig[chainId]["gasLane"];
  const callbackGasLimit = networkConfig[chainId]["callbackGasLimit"];
  const interval = networkConfig[chainId]["interval"];

  const raffle = await deploy("Raffle", {
    from: deployer,
    args: [
      vrfCoordinatorV2Address,
      enteranceFee,
      gasLane,
      subscriptionId,
      callbackGasLimit,
      interval,
    ],
    log: true,
    waitConfirmations: network.config.blockConfirmations || 1,
  });

  if (
    !developmentChains.includes(network.name) &&
    process.env.ETHERSCAN_API_KEY
  ) {
    log("Verifying...");
    await verify(raffle.address, args);
  }
  log("---------------------------------------------");
};

module.exports.tags = ["all", "raffle"];
