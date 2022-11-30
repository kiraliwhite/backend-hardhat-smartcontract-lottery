const { ethers, network } = require("hardhat");

async function mockKeepers() {
  const raffle = await ethers.getContract("Raffle");
  //checkData是轉換UTF-8字串為Uint8Array之後,在使用keccak256加密之後的結果
  //checkData = 0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470
  const checkData = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(""));
  //使用callStatic假裝呼叫checkUpkeep,upkeepNeeded會是true或是false
  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep(checkData);
  //若為true
  if (upkeepNeeded) {
    //執行performUpkeep,傳入空值,因為合約內沒有定義performUpkeep的輸入參數
    const tx = await raffle.performUpkeep(checkData);
    const txReceipt = await tx.wait(1);
    //從transactionReceipt中抓取requestId
    const requestId = txReceipt.events[1].args.requestId;
    console.log(`Performed upkeep with RequestId: ${requestId}`);
    //若為hardhat network
    if (network.config.chainId == 31337) {
      //呼叫mockVrf,傳入requestId,合約本身
      await mockVrf(requestId, raffle);
    }
  } else {
    console.log("No upkeep needed");
  }
}

async function mockVrf(requestId, raffle) {
  console.log("We on a local network? Ok let's pretend...");
  //抓取VRFCoordinatorV2Mock合約
  const vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock");
  //呼叫Mock的function, 該function會呼叫Mock內的fulfillRandomWordsWithOverride,取得隨機數
  //隨機數會傳給VRFConsumerBaseV2的virtual fulfillRandomWords,
  //藉由這個合約傳回Raffle的fulfillRandomWords Override
  await vrfCoordinatorV2Mock.fulfillRandomWords(requestId, raffle.address);
  console.log("Responded");
  const recentWinner = await raffle.getRecentWinner();
  console.log(`The winner is: ${recentWinner}`);
}

mockKeepers()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
