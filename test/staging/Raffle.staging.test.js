const { expect, assert } = require("chai");
const { network, getNamedAccounts, deployments, ethers } = require("hardhat");
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")

developmentChains.includes(network.name) 
    ? describe.skip 
    : describe("Raffle Unit Tests", () => {
        let raffle, deployer, raffleEntranceFee

        beforeEach(async () => {
            deployer  = (await getNamedAccounts()).deployer
            raffle = await ethers.getContract("Raffle", deployer);
            raffleEntranceFee = await raffle.getEntranceFee() 
        })

        describe("fulfil random words", () => {
            it("it works with live chainlink keepers and chainlink vrf, we get a random winner", async () => {
                const startingTimeStamp = await raffle.getLatestTimeStamp()
                const accounts = await ethers.getSigners()

                await new Promise(async (resolve, reject) => {
                    raffle.once("WinnerPicked", async () => {
                        try {
                            console.log("Winner Picked")
                            console.log("---------------------------------------------")
                            const recentWinner = await raffle.getRecentWinner()
                            const raffleState = await raffle.getRaffleState()
                            const winnerEndingBalance = await accounts[0].getBalance()
                            const endingTimeStamp = await raffle.getLatestTimeStamp()
                            
                            console.log("Asserting")
                            console.log("---------------------------------------------")
                            await expect(raffle.getPlayer(0)).to.be.reverted
                            assert.equal(recentWinner.toString(), accounts[0].address)
                            assert.equal(raffleState.toString(), "0")
                            assert.equal(winnerEndingBalance.toString(), winnerStartingBalance.add(raffleEntranceFee).toString())
                            assert(endingTimeStamp > startingTimeStamp)

                            resolve()
                        } catch (error) {
                            reject(error)
                        }
                    })

                    await raffle.enterRaffle({ value: raffleEntranceFee })
                    const winnerStartingBalance = await accounts[0].getBalance()
                    console.log(`Raffle entered and retrieved startingBalance of: ${winnerStartingBalance}`)
                    console.log("---------------------------------------------")
                })
            })
        })
    })