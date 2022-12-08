const { ethers } = require("hardhat");

async function viewTimes() {
  const raffle = await ethers.getContract("Raffle");
  const Times = await raffle.getPlayerTimes();
  console.log(Times.toString());
}

viewTimes()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
