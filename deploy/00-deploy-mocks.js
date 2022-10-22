const { network, ethers } = require("hardhat");
const { networkConfig, developmentChains } = require("../helper-hardhat-config");

const BASE_FEE = ethers.utils.parseEther("0.25")
const GAS_PRICE_LINK = 1e9

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy, log } = deployments;
    const { deployer } = await getNamedAccounts();
    chainId = network.config.chainId;

    if (developmentChains.includes(network.name)) {
        log("Ruuning on local network. Deploying Mocks")

        await deploy("VRFCoordinatorV2Mock", {
            from: deployer,
            args: [BASE_FEE, GAS_PRICE_LINK],
            log: true,
        })

        log("Mocks deployed")
        log("------------------------------------------------------------------")
    }
}

module.exports.tags = ["all", "mocks"]