const { developmentChains, networkConfig } = require("../../helper-hardhat-config");
const { getNamedAccounts, deployments, ethers, network } = require("hardhat");
const { assert, expect } = require("chai");

//如果不在本地區塊鏈,是在測試網或主網,才需要執行測試
!developmentChains.includes(network.name)
  ? describe.skip
  : describe("Raffle Unit Tests", async () => {
      let raffle, vrfCoordinatorV2Mock, raffleEntranceFee, deployer, interval;
      const chainId = network.config.chainId;

      beforeEach(async () => {
        //const { deployer } = await getNamedAccounts();
        deployer = (await getNamedAccounts()).deployer; //會這樣寫是因為deployer已經在全域宣告,所以不能用const {}宣告的方式提取,只能用右邊.的方式提取
        await deployments.fixture(["all"]); //透過deployments的fixture部署最新的帶有all tag的合約
        raffle = await ethers.getContract("Raffle", deployer); //合約是透過ABI,地址(fixture部署時內建),與帳戶關聯
        vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer);
        raffleEntranceFee = await raffle.getEntranceFee();
        //後續測試"it doesn't allow entrance when raffle is calculating"時,需要假裝為chainlink network node呼叫checkUpkeep,performUpkeep
        //在呼叫requestRandomWords時要註冊成為consumer
        const subscriptionId = raffle.getSubId();
        const transactionResponse = await vrfCoordinatorV2Mock.addConsumer(subscriptionId, raffle.address);
        interval = await raffle.getInterval();
      });

      describe("constructor", () => {
        it("Initializes the raffle correctly", async () => {
          const raffleState = await raffle.getRaffleState(); //呼叫raffle合約內的view function獲得RaffleState
          const players = await raffle.getNumberOfPlayers();
          const gasLane = await raffle.getGasLane();
          //預期RaffleState要為0,因為沒有被chainLink節點觸發fulfillRandomWords
          assert.equal(raffleState.toString(), "0");
          //預期合約中回傳的Interval要等於,helper-hardhat-config中宣告的interval
          assert.equal(interval.toString(), networkConfig[chainId]["interval"]);
          //預期合約中回傳的entranceFee要等於,helper-hardhat-config中宣告的entranceFee
          assert.equal(raffleEntranceFee.toString(), networkConfig[chainId]["entranceFee"]);
          //預期合約部署完成之後,參與者為0
          assert.equal(players.toString(), "0");
          //預期合約中的gasLane等於helper-hardhat-config中的gasLane
          assert.equal(gasLane.toString(), networkConfig[chainId]["gasLane"]);
        });
      });

      describe("enterRaffle", () => {
        it("expected reverts when you don't pay enough", async () => {
          //預期,當呼叫raffle合約中的enterRaffle卻沒有輸入任何金額,將失敗且回傳Raffle__NotEnoughFee錯誤
          await expect(raffle.enterRaffle()).to.be.revertedWith("Raffle__NotEnoughFee");
        });
        it("records players when they enter", async () => {
          //當呼叫raffle合約中的enterRaffle,並輸入raffleEntranceFee金額
          await raffle.enterRaffle({ value: raffleEntranceFee });
          //合約中的player陣列的index 0
          const playerFromContract = await raffle.getPlayer(0);
          //預期為deployer
          assert.equal(playerFromContract, deployer);
        });
        it("emits event to enter", async () => {
          //預期入金合約中的enterRaffle function時,會觸發事件emit
          await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.emit(raffle, "RaffleEnter"); //emit關鍵字要帶入合約變數和事件名稱
        });
        it("it doesn't allow entrance when raffle is calculating", async () => {
          //目的是測試,合約處於"計算中"的狀態下,入金會失敗,所以要先將合約設定為"計算中"
          //所以要使checkUpkeep function return為true,才能呼叫performUpkeep function,將合約設定為"計算中"
          //----------------------------------------------------------------------------------
          //使用deployer呼叫raffle合約中的enterRaffle入金,完成checkUpkeep條件hasPlayers,hasBalance
          await raffle.enterRaffle({ value: raffleEntranceFee });
          //透過hardhat method增加evm的時間,增加的多寡是計算interval的數值,再多加1.例如變成31秒,比interval設定的長,就能夠完成條件timePassed
          await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
          //因為上述增加了evm時間,所以要挖掘新的區塊,讓此修改生效
          await network.provider.send("evm_mine", []);
          //上述三個步驟完成之後,checkUpkeep function將return為true,因為條件都已滿足
          //以下是假裝自身為chainlink keeper呼叫performUpkeep function
          //需要傳入參數為bytes calldata,但我們設定不需要傳入任何東西,因此留空[]
          await raffle.performUpkeep([]);
          //預期入金時,合約會revert回傳錯誤訊息Raffle__ContractNotOpen
          await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.be.revertedWith("Raffle__ContractNotOpen");
        });
      });

      describe("checkUpkeep", () => {
        //測試checkUpkeep function,在沒有任何人入金的情況下將會失敗(因為沒有餘額,沒有參與者)
        //因為checkUpkeep return為false的情況有許多條件,要先把那些條件都排除,才有辦法確定回傳的false是沒有入金及沒有參與者所造成的
        it("returns false if people haven't sent any ETH", async () => {
          //將evm時間增加,就可以避開timePassed,因時間不足而return false的條件,而合約部署成功時,RaffleState預設就為true
          await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
          await network.provider.send("evm_mine", []);
          //這只是測試,沒有要真的發送transaction,因此使用callStatic的語法,模擬呼叫function,用來獲得return
          //抓取return的其中之一upkeepNeeded,存成變數
          const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([]);
          //該return的upkeepNeeded將為false,使其反向,用assert來檢查
          //assert(!upkeepNeeded); //assert關鍵字將檢查,傳入的變數是否為true,透過將upkeepNeeded反向來測試,
          assert.equal(upkeepNeeded, false); //等同於assert(!upkeepNeeded);
        });
        //測試合約處於calculating的狀態下,checkUpkeep 應該return false
        it("returns false if raffle isn't open", async () => {
          //先假裝是chainlink keeper滿足checkUpkeep return為true的條件,因為要執行performUpkeep才有辦法改變合約狀態
          await raffle.enterRaffle({ value: raffleEntranceFee });
          await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
          await network.provider.send("evm_mine", []);
          //await raffle.performUpkeep([]);
          //執行performUpkeep 合約就會改變為calculating狀態
          await raffle.performUpkeep("0x"); //此行與await raffle.performUpkeep([]); 相等 都是呼叫function傳入一個空白的bytes object
          //再次獲取合約狀態,因為呼叫過performUpkeep,所以是calculating
          const raffleState = await raffle.getRaffleState();
          //此時再次呼叫checkUpkeep function,因為合約處於“計算中“,所以return會是false
          const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([]);
          //檢查合約是處於1 計算中的狀態
          assert.equal(raffleState.toString(), "1");
          //呼叫checkUpkeep得到的回傳值為false
          assert.equal(upkeepNeeded, false);
        });
        //檢查合約如果沒有經過特定的時間,checkUpkeep將return false
        it("returns false if enough time hasn't passed", async () => {
          //一樣先滿足其他的條件
          await raffle.enterRaffle({ value: raffleEntranceFee });
          //故意將經過時間設定比間隔時間短
          await network.provider.send("evm_increaseTime", [interval.toNumber() - 2]);
          await network.provider.send("evm_mine", []);
          //await network.provider.request({ method: "evm_mine", params: [] }); //等同於上面那行,都是挖礦,使變更生效
          const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x");
          assert.equal(upkeepNeeded, false);
        });
        //檢查當所有條件為true時,checkUpkeep將return為true
        it("returns true if enough time has passed, has players, eth, and Raffle is open", async () => {
          await raffle.enterRaffle({ value: raffleEntranceFee });
          await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
          await network.provider.request({ method: "evm_mine", params: [] });
          const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x");
          assert(upkeepNeeded);
        });
      });
      //performUpkeep function的測試
      describe("performUpkeep", () => {
        //檢查checkUpkeep return true的情況下,執行performUpkeep會成功
        it("it can only run if checkUpkeep return true", async () => {
          await raffle.enterRaffle({ value: raffleEntranceFee });
          await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
          await network.provider.send("evm_mine", []);
          const tx = await raffle.performUpkeep([]);
          assert(tx);
        });
        //檢查checkUpkeep return false的情況下,performUpkeep會失敗出現錯誤訊息Raffle__UpkeepNotNeeded
        it("reverts when checkUpkeep return false", async () => {
          //可以注意到一件事,這個錯誤訊息只有error的名稱,Raffle__UpkeepNotNeeded並沒有寫入錯誤的訊息
          //例如Raffle__UpkeepNotNeeded(currentBalance,numPlayers,raffleState)之類的,這是因為hardhat足夠聰明,會自動帶出後面的變數
          //所以只指定名稱即可
          await expect(raffle.performUpkeep([])).to.be.revertedWith("Raffle__UpkeepNotNeeded");
        });
        //檢查當所有條件都滿足時,requestId會有值,且合約是處於"計算中"的狀態
        it("updates the raffle state,emits and calls the vrf coordinator", async () => {
          await raffle.enterRaffle({ value: raffleEntranceFee });
          await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
          await network.provider.send("evm_mine", []);
          const txResponse = await raffle.performUpkeep([]);
          const txReceipt = await txResponse.wait(1);
          const requestId = txReceipt.events[1].args.requestId; //從transaction的event 1擷取indexed的requestId
          const raffleState = await raffle.getRaffleState(); //獲取合約狀態
          //檢查requestId,有存在一定大於0
          assert(requestId.toNumber() > 0);
          //檢查合約狀態是calculating
          assert(raffleState.toString() == "1");
        });
      });
      describe("fulfillRandomWords", () => {
        //會寫beforeEach的原因是因為此function,一定是在performUpkeep後才會被執行,所以checkUpkeep的前置條件要先通過
        //為了避免每個it都需要寫checkUpkeep的條件,因此統一寫在beforeEach
        beforeEach(async () => {
          await raffle.enterRaffle({ value: raffleEntranceFee });
          await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
          await network.provider.send("evm_mine", []);
        });
        //測試,在還沒有呼叫performUpkeep時,預計vrfCoordinatorV2Mock.fulfillRandomWords會reverted
        it("can only be called after performUpkeep", async () => {
          //使用偽造的0,1這些的requestId,預計也會失敗,可以測試所有requestId的組合,但有點不切實際,需要用到稱為fuzz的測試功能
          //為什麼是檢查vrfCoordinatorV2Mock.fulfillRandomWords,是因為如果有執行performUpkeep時,會產生requestId
          //給chainLink節點,該節點會呼叫vrfCoordinatorV2Mock.fulfillRandomWords,
          await expect(vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.address)).to.be.revertedWith("nonexistent request");
          await expect(vrfCoordinatorV2Mock.fulfillRandomWords(1, raffle.address)).to.be.revertedWith("nonexistent request");
        });
        it("picks a winner, resets the lottery, and sends money", async () => {
          //預計有額外3個人入金
          const otherEntrants = 3;
          //現有參與合約的起始人數為1人(deployer它的帳號index是0)
          const startingAccountIndex = 1;
          //抓取hardhat ethers內的本地假帳號
          const accounts = await ethers.getSigners();
          //console.log(accounts);
          //透過for迴圈的index來替換假帳號的地址,使每一個帳號都與合約連接,然後入金
          //包含deployer總共有四個人參與,額外的三人是index 1,2,3
          for (let i = startingAccountIndex; i < startingAccountIndex + otherEntrants; i++) {
            const accountConnectedRaffle = raffle.connect(accounts[i]);
            await accountConnectedRaffle.enterRaffle({ value: raffleEntranceFee });
          }
          //抓取起始時間
          const startingTimeStamp = await raffle.getLatestTimeStamp();

          //宣告一個Promise讓整個測試,需要等待event被觸發之後繼續assert
          //在本地網其實可以不用寫,這是在模擬測試網,因為不會知道chainLink node回傳隨機值給fulfillRandomWords需要多久
          //所以要寫一個Promise等待event被觸發之後,整個fulfillRandomWords才算完成,若沒有寫,就不會等到有隨機值,而是直接assert
          //若沒有取得隨機值就assert,那結果會是錯的
          await new Promise(async (resolve, reject) => {
            //使用contract.once,來監聽事件WinnerPicked 是否被觸發,
            raffle.once("WinnerPicked", async () => {
              console.log("Found the event!");
              //寫try catch,確保這個section就算出錯,也會繼續進行
              try {
                const recentWinner = await raffle.getRecentWinner();
                const raffleState = await raffle.getRaffleState();
                const endingTimeStamp = await raffle.getLatestTimeStamp();
                const numPlayers = await raffle.getNumberOfPlayers();
                //抓取帳戶1贏的勝利之後的餘額
                const winnerEndingBalance = await accounts[1].getBalance();

                //檢查合約應為開啟狀態
                assert.equal(raffleState.toString(), "0");
                //檢查經過時間應大於起始時間
                assert(endingTimeStamp > startingTimeStamp);
                //檢查參與者應歸0
                assert.equal(numPlayers.toString(), "0");
                //檢查勝利者存在
                assert(recentWinner);

                //勝利者帳戶1的總金額 = 帳戶1起始金額 + (入金費用 x 額外參與者) + 帳戶1自己入金費用
                //忽略Gas Fee
                assert.equal(
                  winnerEndingBalance.toString(),
                  winnerStartingBalance.add(raffleEntranceFee.mul(otherEntrants).add(raffleEntranceFee)).toString()
                );
              } catch (e) {
                reject(e);
              }
              resolve();
            });
            //以下的這三行寫在contract.once之外,是因為監聽器是監聽WinnerPicked事件,也就是fulfillRandomWords的事件
            //在那之前要先執行performUpkeep,及呼叫fulfillRandomWords, 所以這三行會比raffle.once還要優先執行
            //當執行到fulfillRandomWords的event WinnerPicked時,才會觸發上面的監聽器(raffle.once)
            //這三件事其實是模擬chainLink network keeper, 呼叫checkUpkeep,performUpkeep的過程
            //呼叫performUpkeep呼叫VRFcoordinator的requestRandomWords,並取得requestId
            const tx = await raffle.performUpkeep([]);
            const txReceipt = await tx.wait(1);
            //紀錄帳戶1的起始餘額
            const winnerStartingBalance = await accounts[1].getBalance();
            //使用requestId 和合約地址 呼叫vrfCoordinatorV2Mock.fulfillRandomWords 取得隨機值
            await vrfCoordinatorV2Mock.fulfillRandomWords(txReceipt.events[1].args.requestId, raffle.address);
          });
        });
      });
    });
