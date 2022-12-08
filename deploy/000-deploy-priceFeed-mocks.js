const { network } = require("hardhat");
//從hardhat library中 提取network pacakage
const { developmentChains, DECIMALS, INITIAL_ANSWER } = require("../helper-hardhat-config");
//從helper-hardhat-config中提取陣列變數developmentChains,DECIMALS, INITIAL_ANSWER

module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();

  //includes關鍵字實際上是一個function他會確認某個變數是否存在於陣列中
  //比對developmentChains這個陣列中宣告好的hardhat,localhost,
  //這兩個關鍵字有沒有存在於network.name(hardhat.config.js)中
  if (developmentChains.includes(network.name)) {
    log("Local network detected! Deploying PriceFeed mocks...");
    await deploy("MockV3Aggregator", {
      //可以省略contract,因為上面已經指定過了
      contract: "MockV3Aggregator",
      from: deployer,
      log: true,
      //傳進給合約constructor的變數,依照部署合約時要輸入的參數而不同,由於這個deploy.js是用來部署假的餵價合約
      //因此要參考MockV3Aggregator.sol的constructor
      //因此這裡是要輸入_decimals(小數點有幾位),_initialAnswer(以太幣兌換USD的價格)
      //DECIMALS, INITIAL_ANSWER這兩個變數是在helper-hardhat-config中宣告,透過import提取,輸入到constructor
      args: [DECIMALS, INITIAL_ANSWER],
    });
    log("PriceFeed Mocks deployed");
    log("-------------------------------------------------");
  }
};

//定義兩個tag all跟mocks,只要tag有其中任何一個,就會執行這個script部署mocks
module.exports.tags = ["all", "mocks"];
