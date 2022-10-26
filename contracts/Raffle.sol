// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/interfaces/KeeperCompatibleInterface.sol";

error Raffle__NotEnoughFee();
error Raffle__TransferFailed();
error Raffle__ContractNotOpen();
error Raffle__UpkeepNotNeeded(
    uint currentBalance,
    uint numPlayers,
    uint raffleState
);

/** @title 一個簡單的彩票合約
 *  @author kiralee.eth
 *  @notice 這個合約是建立一個不可篡改的去中心化智能合約
 *  @dev 透過導入Chainlink VRF v2 和 Chainlink keepers來完成這個合約
 */

contract Raffle is VRFConsumerBaseV2, KeeperCompatibleInterface {
    //宣告一個新的類型,用來描述合約當下的狀態是open還是計算中
    enum RaffleState {
        OPEN,
        CALCULATING
    }

    /* 狀態變數宣告 */
    uint private immutable i_entranceFee;
    address payable[] private s_players;
    //宣告VRFCoordinatorV2Interface合約類型變數i_COORDINATOR
    VRFCoordinatorV2Interface private immutable i_COORDINATOR;
    //以下為宣告requestRandomWords所需要的輸入變數
    bytes32 private immutable i_gasLane; //發出request時最大可支付的Gas
    uint64 private immutable i_subscriptionId; //chainLink訂閱ID
    uint32 private immutable i_callbackGasLimit; //Oracle預言機回傳隨機數時(callback),最大可接受的Gas
    uint16 private constant REQUEST_CONFIRMATIONS = 3; //Oracle預言機獲得隨機數時,需要等待的確認數
    uint32 private constant NUM_WORDS = 1; //一次產生幾個隨機數

    /* 彩票變數宣告 */
    address payable private s_recentWinner;
    RaffleState private s_raffleState; //使用新類型宣告一個變數,用來存放合約當前的狀態,是open還是計算中
    uint private s_lastTimeStamp; //上一個區塊時間,宣告此參數用於計算經過了多久
    uint private immutable i_interval; //設定時間間隔

    /* 事件宣告 */
    //宣告一個event,輸出一個地址
    event RaffleEnter(address indexed player);
    //宣告一個event,當發出請求獲得requestId時觸發
    event RequestedRaffleWinner(uint256 indexed requestId);
    //宣告一個event,當找出勝利者時觸發
    event WinnerPicked(address indexed winner);

    /* function */
    //在合約部署時決定最小輸入金額
    //在合約部署時,輸入vrfCoordinatorV2地址,塞給VRFConsumerBaseV2合約的constructor
    //因為該合約VRFConsumerBaseV2的初始化部署constructor需要vrfCoordinatorV2地址
    constructor(
        address _vrfCoordinatorV2,
        uint _entranceFee,
        bytes32 _gasLane,
        uint64 _subscriptionId,
        uint32 _callbackGasLimit,
        uint _interval
    ) VRFConsumerBaseV2(_vrfCoordinatorV2) {
        i_entranceFee = _entranceFee;
        //因為要使用VRFCoordinatorV2Interface合約內的功能,因此將ABI與合約地址做關聯,塞到i_COORDINATOR內
        i_COORDINATOR = VRFCoordinatorV2Interface(_vrfCoordinatorV2);
        i_gasLane = _gasLane;
        i_subscriptionId = _subscriptionId;
        i_callbackGasLimit = _callbackGasLimit;
        //s_raffleState = RaffleState(0);
        s_raffleState = RaffleState.OPEN; //這行與上面那行相等
        s_lastTimeStamp = block.timestamp; //初始化,先將s_lastTimeStamp設定為當前的block.timestamp,就有基準能夠比較
        i_interval = _interval; //設定時間間隔
    }

    //入金,紀錄入金帳戶地址到陣列中
    function enterRaffle() public payable {
        if (msg.value < i_entranceFee) {
            revert Raffle__NotEnoughFee();
        }
        //檢查合約是否開啟
        if (s_raffleState != RaffleState.OPEN) {
            revert Raffle__ContractNotOpen();
        }
        s_players.push(payable(msg.sender));
        //觸發event將入金的玩家地址顯示
        emit RaffleEnter(msg.sender);
    }

    //此function是給chainLink keeper node呼叫的,用來檢查條件是否滿足,然後可以執行PerformUpKeep,
    //若此function return為true就會執行PerformUpKeep function
    //perfromData內 可以寫要傳給PerformUpKeep function的變數, 這邊註解起來是因爲現在用不到performData變數
    function checkUpkeep(
        bytes memory /* checkdata */
    )
        public
        override
        returns (
            bool upkeepNeeded,
            bytes memory /* performData */
        )
    {
        //檢查合約是否為開啟狀態
        bool isOpen = (s_raffleState == RaffleState.OPEN);
        //檢查時間是否超過了指定的間隔時間
        bool timePassed = ((block.timestamp - s_lastTimeStamp) > i_interval);
        //檢查玩家是否大於0
        bool hasPlayers = (s_players.length > 0);
        //檢查合約金額是否大於0
        bool hasBalance = (address(this).balance > 0);
        //upkeepNeeded變數不用宣告是因為在returns中已經宣告過了,若前四個變數為true,才為true
        upkeepNeeded = (isOpen && timePassed && hasPlayers && hasBalance);
    }

    function performUpkeep(
        bytes calldata /* performData */
    ) external override {
        //擷取呼叫checkUpkeep function的return值,作為判斷式的條件,而我們沒有使用performData,所以留空,只留下一個逗號
        //且呼叫此function也沒有輸入參數,所以也留空,寫入雙引號
        (bool upkeepNeeded, ) = checkUpkeep("");
        //若upkeepNeeded為false
        if (!upkeepNeeded) {
            //revert 輸出的error帶入以下參數,合約的餘額,s_players陣列長度(參加人數),合約狀態(因為是特別的類型,所以轉換成uint,用index數字代表)
            revert Raffle__UpkeepNotNeeded(
                address(this).balance,
                s_players.length,
                uint(s_raffleState)
            );
        }

        //在取得隨機數前,先將合約設定為CALCULATING,暫時不允許任何人加入
        s_raffleState = RaffleState.CALCULATING;
        //使用關聯好的i_COORDINATOR,呼叫其中的requestRandomWords function,傳入宣告好的參數,製作request
        uint256 requestId = i_COORDINATOR.requestRandomWords(
            i_gasLane,
            i_subscriptionId,
            REQUEST_CONFIRMATIONS,
            i_callbackGasLimit,
            NUM_WORDS
        );
        //當呼叫requestRandomWords時 回傳取得requestId時 觸發event
        emit RequestedRaffleWinner(requestId);
    }

    //這個fulfillRandomWords宣告為override,會覆蓋掉VRFConsumerBaseV2的fulfillRandomWords的virtual
    //這個function是用來給Oracle預言機呼叫的,用來將隨機數callback給使用者,所以有兩個參數
    //_requestId,randomWords,其中randomWords是一個uint256的陣列,用來存放request回傳而來的隨機數
    //一次請求的隨機數越多該陣列長度就會變大
    function fulfillRandomWords(
        uint256, /*_requestId*/
        uint256[] memory randomWords
    ) internal override {
        //由於我們要使用取得的隨機數,來找出勝利者,且此合約一次的request只有取得一個隨機數
        //因此回傳的隨機數會存在randomWords[0]內,使用隨機數與s_players陣列長度取餘數,就能夠遍歷陣列,找出勝利者
        //將餘數,存在變數內
        uint indexOfWinner = randomWords[0] % s_players.length;
        //將餘數當作陣列的index找出當前勝利者的地址
        address payable recentWinner = s_players[indexOfWinner];
        //將勝利者的地址存為全域變數
        s_recentWinner = recentWinner;
        //選出勝利者後將s_players陣列歸0
        s_players = new address payable[](0);
        //將timeStamp重新reset,用來重新計算經過特定時間才選出獲勝者
        s_lastTimeStamp = block.timestamp;
        //選出勝利者後,將合約開啟,允許入金
        s_raffleState = RaffleState.OPEN;
        //將合約所有的資金轉給勝利者,使用function裡面的變數較安全,防止有人偷改全域變數
        (bool success, ) = recentWinner.call{value: address(this).balance}("");
        if (!success) {
            revert Raffle__TransferFailed();
        }
        emit WinnerPicked(recentWinner);
    }

    /* Pure / View function */
    //取得最小入金金額
    function getEntranceFee() public view returns (uint) {
        return i_entranceFee;
    }

    //取得入金地址
    function getPlayer(uint _index) public view returns (address) {
        return s_players[_index];
    }

    //顯示最近獲勝者的地址
    function getRecentWinner() public view returns (address) {
        return s_recentWinner;
    }

    //顯示合約的狀態
    function getRaffleState() public view returns (RaffleState) {
        return s_raffleState;
    }

    //一次選出幾個獲勝者(一次獲得幾個隨機數)
    function getNumWords() public pure returns (uint) {
        return NUM_WORDS;
    }

    //顯示目前幾個玩家
    function getNumberOfPlayers() public view returns (uint) {
        return s_players.length;
    }

    //上次的區塊時間
    function getLatestTimeStamp() public view returns (uint) {
        return s_lastTimeStamp;
    }

    //顯示隨機數需要幾次確認,pure的原因是因為該變數是constant
    function getRequestComfirmations() public pure returns (uint) {
        return REQUEST_CONFIRMATIONS;
    }

    //中獎機率
    function getWinnerChance() public view returns (uint) {
        uint chance = NUM_WORDS / s_players.length;
        return chance;
    }
}
