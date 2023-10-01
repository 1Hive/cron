import { ethers } from "ethers";
import logger from "../logger";
import fluidProposalABI from "@/abi/fluid-proposal";

import { env } from "~/env.mjs";
import { NextApiRequest, NextApiResponse } from "next";

const MNEMONIC = env.MNEMONIC;
const ETH_URI = env.ETH_URI;
const CONTRACT_ADDRESS = env.CONTRACT_ADDRESS;

// Configuration
if (!MNEMONIC) {
  logger.error("Please set `MNEMONIC`.");
  process.exit(1);
}

if (!ETH_URI) {
  logger.error("Please set `ETH_URI`.");
  process.exit(1);
}

if (!CONTRACT_ADDRESS) {
  logger.error("Please set `CONTRACT_ADDRESS`.");
  process.exit(1);
}

// Set up provider and wallet
const provider = ethers.getDefaultProvider(ETH_URI);
const wallet = ethers.Wallet.fromMnemonic(MNEMONIC).connect(provider);

async function call(
  functionName: string,
  signer: ethers.Signer | undefined,
  fluidProposalsAddress: string | undefined
) {
  if (!fluidProposalABI.includes(`function ${functionName}()`)) {
    logger.error(`Contract's ABI doesn't have function ${functionName}`)
    return false;
  }

  // Run information
  logger.info(`Acting as ${wallet.address}`);
  logger.info(`Connected to ${ETH_URI}`);
  logger.info(`Calling ${functionName} on FluidProposals at ${CONTRACT_ADDRESS}`);

  if (!fluidProposalsAddress) {
    logger.error("Please set `CONTRACT_ADDRESS`.");
    return false;
  }

  if (!signer) {
    logger.error("Please set `MNEMONIC`.");
    return false;
  }

  const fluidProposals = new ethers.Contract(
    fluidProposalsAddress,
    fluidProposalABI,
    signer
  );

  // Wait until the network has heen established
  await provider.ready;

  // Check if network supports EIP1559
  const SUPPORTS_EIP1559 = Boolean(
    (await provider.getBlock("latest")).baseFeePerGas
  );
  // Calculate fees
  const feeData = await provider.getFeeData();

  // Get nonce
  const nonce = await provider.getTransactionCount(wallet.address);

  let OVERRIDES;
  if (SUPPORTS_EIP1559) {
    OVERRIDES = {
      gasLimit: env.GAS_LIMIT,
      maxFeePerGas: feeData.maxFeePerGas,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
      nonce: nonce,
    };
  } else {
    OVERRIDES = {
      gasPrice: feeData.gasPrice,
      gasLimit: env.GAS_LIMIT,
      nonce: nonce,
    };
  }

  logger.info(`Calling ${functionName}...`);

  try {
    const tx = await fluidProposals[functionName](OVERRIDES);

    logger.info(`- Sent transaction to ${functionName} fluid proposals (${tx.hash})`);
    await tx.wait();
  } catch (err: any) {
    logger.fatal(`- Transaction failed to process.`);
    logger.fatal(`- ${err.message}`);
    return false;
  }
  logger.info(`Done calling ${functionName}.`);

  const balance = await signer.provider?.getBalance(await signer.getAddress());
  logger.info(`Current balance is ${balance}`);

  return true;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { functionName } = req.query;

  if (!functionName) {
    logger.error("Function Name is not set");
    return false;
  }

  logger.info(`Starting ${functionName}...`);
  const status = await call(functionName as string, wallet, CONTRACT_ADDRESS);

  const response = {
    status: status,
    timestamp: Date.now(),
  };

  res.status(status ? 200 : 400).json(response);
}
