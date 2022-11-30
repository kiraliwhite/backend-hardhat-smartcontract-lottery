const { ethers, network } = require("hardhat");
const fs = require("fs");

const FRONT_END_ADDRESSES_FILE = "../nextjs-smartcontract-lottery/constants/contractAddresses.json";
const FRONT_END_ABI_FILE = "../nextjs-smartcontract-lottery/constants/abi.json";

module.exports = async function () {
  if (process.env.UPDATE_FRONT_END) {
    console.log("Updating front end...");
    updateContractAddresses();
    updateAbi();
  }
};

//透過ethers的interface,抓取abi 存到前端的abi.json中
async function updateAbi() {
  const raffle = await ethers.getContract("Raffle");
  fs.writeFileSync(FRONT_END_ABI_FILE, raffle.interface.format(ethers.utils.FormatTypes.json));
}

async function updateContractAddresses() {
  const raffle = await ethers.getContract("Raffle");
  const chainId = network.config.chainId.toString();
  //抓取當下前端檔案的內容存為變數
  const currentAddresses = JSON.parse(fs.readFileSync(FRONT_END_ADDRESSES_FILE, "utf8"));

  //如果當前部署的chainId,存在於前端contractAddresses.json中
  if (chainId in currentAddresses) {
    //currentAddresses[chainId] 不 包含 現有部署出來的合約地址
    if (!currentAddresses[chainId].includes(raffle.address)) {
      //將新地址寫到contractAddresses.json對應的chainId中
      currentAddresses[chainId].push(raffle.address);
    }
  } else {
    //若當前部署的chainId不存在於前端contractAddresses.json中,則新增一筆,並寫入合約地址
    currentAddresses[chainId] = [raffle.address];
  }
  //使用JSON.stringify將currentAddresses變為字串,寫到檔案內
  fs.writeFileSync(FRONT_END_ADDRESSES_FILE, JSON.stringify(currentAddresses));
}

module.exports.tags = ["all", "frontend"];
