const { expect, assert } = require("chai");
const { network, getNamedAccounts, deployments, ethers } = require("hardhat");
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")

!developmentChains.includes(network.name) 
    ? describe.skip 
    : describe("Raffle Unit Tests", () => {
        let raffle, vrfCoordinatorV2Mock, interval, deployer
        const chainId = network.config.chainId

        beforeEach(async () => {
            deployer  = (await getNamedAccounts()).deployer
            await deployments.fixture(["all"]) 
            raffle = await ethers.getContract("Raffle", deployer);
            vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer)
            raffleEntranceFee = await raffle.getEntranceFee() 
            interval = await raffle.getInterval();
        })

        describe("constructor", () => {
            it("initialised the raffle correctly", async () => {
                const raffleState = await raffle.getRaffleState()

                assert.equal(raffleState.toString(), "0")
                assert.equal(interval.toString(), networkConfig[chainId].interval)

            })
        })

        describe("enter raffle", () => {
            it("reverts player tries to enter with less than the entrance fee", async () => {
                await expect(raffle.enterRaffle())
                .to.be.revertedWithCustomError(raffle ,'Raffle__NotEnoughEth')
            })

            it("records players when they enter", async () => {
                await raffle.enterRaffle({value: raffleEntranceFee})
                const player = await raffle.getPlayer(0)

                expect(player).to.not.be.undefined
                expect(player).to.not.be.null
                assert.equal(player, deployer)
            })  

            it("emits event on enter", async () => {
                await expect(raffle.enterRaffle({value: raffleEntranceFee}))
                .to.emit(raffle, "RaffleEnter")
            })

            it("doesn't allow player to enter when raffle is calculating", async () => {
                await raffle.enterRaffle({ value: raffleEntranceFee })
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                await network.provider.send("evm_mine", [])

                await raffle.performUpkeep([])

                await expect(raffle.enterRaffle({ value: raffleEntranceFee }))
                .to.be.revertedWithCustomError(raffle, "Raffle__NotOpen")

            })
        })

        describe("checkUpKeep", () => {
            it("returns false if people haven't sent any eth", async () => {
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                await network.provider.send("evm_mine", [])
                const { upkeepNeeded } = await raffle.checkUpkeep([])
                assert(!upkeepNeeded)
            })

            it("returns false if raffle not open", async () => {
                await raffle.enterRaffle({value: raffleEntranceFee})
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                await network.provider.send("evm_mine", []) 
                await raffle.performUpkeep([])
                const { upkeepNeeded } = await raffle.checkUpkeep([])
                const raffleState = await raffle.getRaffleState()

                assert.equal(raffleState.toString(), "1")
                assert.equal(upkeepNeeded, false)
            })
        })

        describe("performUpKeep", () => {
            it ("it can only run if checkupkeep is true", async () => {
                await raffle.enterRaffle({value: raffleEntranceFee})
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                await network.provider.send("evm_mine", []) 
                const tx = await raffle.performUpkeep([])

                assert(tx)
            })

            it("reverts when checkupkeep is false", async () => {   
                await expect(raffle.performUpkeep([]))
                .to.be.reverted.revertedWithCustomError(raffle, "Raffle__UpkeepNotNeeded")
            })

            it("updates the raffle state, emits event, calls vrf coordinator", async () => {
                await raffle.enterRaffle({value: raffleEntranceFee})
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                await network.provider.send("evm_mine", []) 
                const txResponse = await raffle.performUpkeep([])
                const txReciept = await txResponse.wait(1)
                const requestId = txReciept.events[1].args.requestId
                const raffleState = await raffle.getRaffleState()

                assert(requestId > 0)
                assert(raffleState.toString() == "1")
            })
        })

        describe("fulfil random words", () => {
            beforeEach(async () => {
                await raffle.enterRaffle({value: raffleEntranceFee})
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                await network.provider.send("evm_mine", []) 
            })

            it("can only be called after performUpKeep", async () => {
                await expect(vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.address))
                .to.be.revertedWith("nonexistent request")
                await expect(vrfCoordinatorV2Mock.fulfillRandomWords(1, raffle.address))
                .to.be.revertedWith("nonexistent request")
            })

            it("picks a winner, resets the lottery and sends money", async () => {
                const additionalEntrants = 3
                const startingAccountIndex = 1;
                const accounts = await ethers.getSigners();

                for (let i = startingAccountIndex; i < startingAccountIndex + additionalEntrants; i++) {
                    const accountConnectedRaffle = raffle.connect(accounts[i])
                    await accountConnectedRaffle.enterRaffle({ value: raffleEntranceFee })
                }

                const startingTimeStamp = await raffle.getLatestTimeStamp()

                await new Promise(async (resolve, reject) => {
                    raffle.once("WinnerPicked", async () => {
                        try {
                            const raffleState = await raffle.getRaffleState()
                            const endingTimeStamp = await raffle.getLatestTimeStamp()
                            const numPlayers = await raffle.getNumPlayers()
                            const winnerEndingBalance = await accounts[1].getBalance()

                            assert.equal(numPlayers.toString(), "0")
                            assert.equal(raffleState.toString(), "0")
                            assert(endingTimeStamp > startingTimeStamp)
                            assert.equal(winnerEndingBalance.toString(), 
                            winnerStartingBalance.add(
                                raffleEntranceFee
                                .mul(additionalEntrants)
                                .add(raffleEntranceFee))
                                .toString()
                            )            
                        } catch (error) {
                            reject(error)
                        }
                        resolve()
                    })

                    const tx = await raffle.performUpkeep([])
                    const txReciept = await tx.wait(1)
                    const winnerStartingBalance = await accounts[1].getBalance() 
                    await vrfCoordinatorV2Mock.fulfillRandomWords(txReciept.events[1].args.requestId, raffle.address) 
                })
            })
        })
    })