const { developmentChains, networkConfig } = require("../../helper-hardhat-config");
const { getNamedAccounts, deployments, ethers, network } = require("hardhat");
const { assert, expect } = require("chai");

//如果是在測試網,才需要執行測試
developmentChains.includes(network.name)
  ? describe.skip
  : describe("Raffle Staging Tests", async () => {
      let raffle, raffleEntranceFee, deployer, interval;

      beforeEach(async () => {
        deployer = (await getNamedAccounts()).deployer; //會這樣寫是因為deployer已經在全域宣告,所以不能用const {}宣告的方式提取,只能用右邊.的方式提取
        raffle = await ethers.getContract("Raffle", deployer); //合約是透過ABI,地址(fixture部署時內建),與帳戶關聯
        raffleEntranceFee = await raffle.getEntranceFee();
        interval = await raffle.getInterval();
      });

      describe("fulfillRandomWords", () => {
        //檢查在測試網時,與keepers,VRF協同工作獲得隨機數,此測試只有deployer一人入金,所以獲勝者也是deployer
        it("works with live Chainlink keepers and Chainlink VRF, we get a random winner", async () => {
          const startingTimeStamp = await raffle.getLatestTimeStamp();
          const accounts = await ethers.getSigners();

          //寫一個Promise是為了要等待VRF回傳隨機數, 與本地網不同的是checkUpkeep及performUpkeep,這兩個function
          //會由chainlink keepers觸發,因此不用寫call呼叫
          await new Promise(async (resolve, reject) => {
            //監聽event  WinnerPicked
            raffle.once("WinnerPicked", async () => {
              console.log("WinnerPicked event fired!");
              try {
                const recentWinner = await raffle.getRecentWinner();
                const raffleState = await raffle.getRaffleState();
                //因為只有deployer入金,所以是winner,他的index是0
                const winnerEndingBalance = await accounts[0].getBalance();
                const endingTimeStamp = await raffle.getLatestTimeStamp();

                //因為選出獲勝者之後,就會將參與者的名單清空,所以陣列中的index 0會是空值,所以會revert
                await expect(raffle.getPlayer(0)).to.be.reverted;
                // 或是檢查該參與者的陣列也可以,檢查陣列會歸0
                // const numPlayers = await raffle.getNumberOfPlayers();
                // assert.equal(numPlayers.toString(), "0");
                // 檢查獲勝者的地址等於deployer
                assert.equal(recentWinner.toString(), accounts[0].address);
                // 選出勝利者後合約為開啟狀態
                assert.equal(raffleState.toString(), "0");
                // 勝利者的餘額 = 勝利者初始餘額 + 入金餘額, 因為只有deployer一人
                assert.equal(winnerEndingBalance.toString(), winnerStartingBalance.add(raffleEntranceFee).toString());
                assert(endingTimeStamp > startingTimeStamp);
                resolve();
              } catch (e) {
                console.log(e);
                reject(e);
              }
              resolve();
            });
            //在進入promise前先入金,並等待chainlink keepers自動觸發checkUpkeep及performUpkeep
            await raffle.enterRaffle({ value: raffleEntranceFee });
            //先抓取deployer帳戶的初始餘額,因為只有deployer入金,所以獲勝者也是deployer
            const winnerStartingBalance = await accounts[0].getBalance();
          });
        });
      });
    });
