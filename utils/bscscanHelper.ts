
import { BSCSCAN_API_URL, WBNB_ADDRESS, ERC20_TRANSFER_EVENT_SIGNATURE, RATE_LIMIT_DELAY_MS, MARKETPLACE_FUNCTION_KEYWORDS, FEE_COLLECTION_WALLET_ADDRESS } from '../constants';
import { 
  BscScanApiResponse, BscScanTx, BscScanNormalTx, TxReceipt, 
  InterpretedEvent, EventType, NftActivityHistory, GeneralMarketplaceActivity 
} from '../types';

const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

const fetchBscScanApi = async <T>(params: URLSearchParams, apiKey: string): Promise<T[]> => {
  await delay(RATE_LIMIT_DELAY_MS);
  params.set('apikey', apiKey);
  const response = await fetch(`${BSCSCAN_API_URL}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`BSCScan API error: ${response.status} ${response.statusText} for params: ${params.toString()}`);
  }
  const data: BscScanApiResponse<T | string> = await response.json();
  if (data.status === "0") {
    if (typeof data.result === 'string') {
        // Handle "No transactions found" or "No records found" gracefully
        if (data.message?.toLowerCase().includes("no transactions found") || data.message?.toLowerCase().includes("no records found")) {
            return [];
        }
        throw new Error(`BSCScan API error: ${data.message} - ${data.result}`);
    }
    // If result is an array but message is not OK (e.g. rate limit without API key)
    if (data.message !== "OK" && data.message !== "OK-Missing/Invalid API Key, rate limit of 1/5sec applied") {
        console.warn(`BSCScan API warning: ${data.message} for params: ${params.toString()}`);
    }
  }
  return Array.isArray(data.result) ? data.result as T[] : (data.result ? [data.result] as T[] : []);
};


export const fetchNtfTransfers = async (contractAddress: string, apiKey: string): Promise<BscScanTx[]> => {
  const params = new URLSearchParams({
    module: 'account',
    action: 'tokennfttx',
    address: contractAddress,
    page: '1',
    offset: '10000',
    startblock: '0',
    endblock: '99999999',
    sort: 'asc',
  });
  return fetchBscScanApi<BscScanTx>(params, apiKey);
};

export const fetchNormalTransactions = async (address: string, apiKey: string): Promise<BscScanNormalTx[]> => {
  const params = new URLSearchParams({
    module: 'account',
    action: 'txlist',
    address: address,
    startblock: '0',
    endblock: '99999999',
    page: '1',
    offset: '10000', // Max for free tier is often 10k for txlist too
    sort: 'asc',
  });
  return fetchBscScanApi<BscScanNormalTx>(params, apiKey);
};

export const fetchTransactionReceipt = async (txHash: string, apiKey: string): Promise<TxReceipt | null> => {
  const params = new URLSearchParams({
    module: 'proxy',
    action: 'eth_getTransactionReceipt',
    txhash: txHash,
  });
  const results = await fetchBscScanApi<TxReceipt>(params, apiKey); // fetchBscScanApi expects array, proxy returns object
  return results.length > 0 ? results[0] : null;
};


const weiToBnb = (wei: string): string => {
  try {
    const parsedWei = BigInt(wei);
    const bnb = Number(parsedWei) / 1e18;
    return bnb.toFixed(6); 
  } catch (e) {
    console.error("Error converting wei to BNB:", wei, e);
    return "0.000000";
  }
};

interface ExtractedFunctionParams {
  tokenId?: string;
  expiryTimestamp?: number; // Can be a full timestamp or a duration based on context
}

// Updated function to extract tokenId and potentially an expiryTimestamp
// This function is now more of a fallback if direct input parsing isn't done.
const extractFunctionParams = (functionName?: string, eventType?: EventType, txTimestamp?: number): ExtractedFunctionParams => {
  const result: ExtractedFunctionParams = {};
  if (!functionName) return result;

  const argMatches = functionName.match(/\(([^)]*)\)/);
  if (!argMatches || !argMatches[1]) {
     const underscoreMatch = functionName.match(/_(\d+)/);
     if (underscoreMatch && underscoreMatch[1]) {
        result.tokenId = underscoreMatch[1];
     }
    return result;
  }

  const argsString = argMatches[1];
  const numericArgs = argsString.split(',')
    .map(arg => arg.trim())
    .filter(arg => /^\d+$/.test(arg))
    .map(arg => BigInt(arg)); 

  if (numericArgs.length > 0) {
    result.tokenId = numericArgs[0].toString(); 

    if (eventType === EventType.LISTING_INTENT && numericArgs.length > 1 && txTimestamp) {
      for (let i = 1; i < numericArgs.length; i++) {
        const potentialDurationOrTimestamp = numericArgs[i];
        // Heuristic for a duration (e.g., in seconds, common for auctions)
        // Let's assume durations are typically less than 1 year (31536000 seconds)
        // and greater than a few seconds.
        if (potentialDurationOrTimestamp > 60n && potentialDurationOrTimestamp < 31536000n) {
          result.expiryTimestamp = txTimestamp + Number(potentialDurationOrTimestamp);
          break; 
        }
        // Heuristic for a full Unix timestamp (e.g., 10 digits, between ~2001 and ~2065)
        if (potentialDurationOrTimestamp >= 1000000000n && potentialDurationOrTimestamp <= 3000000000n) {
          result.expiryTimestamp = Number(potentialDurationOrTimestamp);
          break; 
        }
      }
    }
  }
  return result;
};


export const processNftData = async (
  marketplaceAddress: string,
  apiKey: string,
  setLoadingMessage: (message: string) => void
): Promise<{nftActivity: NftActivityHistory, generalActivity: GeneralMarketplaceActivity}> => {
  setLoadingMessage("Fetching NFT transfers involving the contract...");
  const nftTransfers = await fetchNtfTransfers(marketplaceAddress, apiKey);

  setLoadingMessage("Fetching normal transactions to the marketplace contract...");
  const normalTransactions = await fetchNormalTransactions(marketplaceAddress, apiKey);

  const allTransactions = [
    ...nftTransfers.map(tx => ({ ...tx, type: 'nftTransfer' })),
    ...normalTransactions.map(tx => ({ ...tx, type: 'normalTransaction' }))
  ];

  if (allTransactions.length === 0) {
    setLoadingMessage("No NFT transfers or normal transactions found for this contract.");
    return { nftActivity: {}, generalActivity: [] };
  }
  
  setLoadingMessage(`Found ${nftTransfers.length} NFT transfers and ${normalTransactions.length} normal transactions. Fetching receipts...`);

  const uniqueTxHashes = [...new Set(allTransactions.map(tx => tx.hash))];
  const txReceiptsMap: Record<string, TxReceipt> = {};
  const txFeeDetailsMap: Record<string, InterpretedEvent['details']['feePaidToSystem']> = {};


  for (let i = 0; i < uniqueTxHashes.length; i++) {
    const hash = uniqueTxHashes[i];
    setLoadingMessage(`Fetching receipt ${i + 1}/${uniqueTxHashes.length} for tx: ${hash.substring(0,10)}...`);
    const receipt = await fetchTransactionReceipt(hash, apiKey);
    if (receipt) {
      txReceiptsMap[hash] = receipt;
      // Check for fee payments within this transaction
      if (receipt.logs) {
        const feeLog = receipt.logs.find(log =>
            log.address.toLowerCase() === WBNB_ADDRESS.toLowerCase() && // Assuming fee is WBNB
            log.topics[0] === ERC20_TRANSFER_EVENT_SIGNATURE &&
            log.topics.length === 3 && // from, to, value
            `0x${log.topics[2].slice(26)}`.toLowerCase() === FEE_COLLECTION_WALLET_ADDRESS.toLowerCase()
        );
        if (feeLog) {
            const feeAmountWei = BigInt(feeLog.data).toString();
            txFeeDetailsMap[hash] = {
                amount: weiToBnb(feeAmountWei), // Store as BNB/WBNB value
                currency: "WBNB", // Assuming WBNB for fee
                receiver: FEE_COLLECTION_WALLET_ADDRESS
            };
        }
      }
    }
  }

  setLoadingMessage("Processing and interpreting events...");
  const nftActivity: NftActivityHistory = {};
  const generalActivity: GeneralMarketplaceActivity = [];
  const allInterpretedEvents: InterpretedEvent[] = [];

  // Process NFT Transfers first
  for (const transfer of nftTransfers) {
    if (!transfer.tokenID) continue;
    const tokenId = transfer.tokenID;

    const receipt = txReceiptsMap[transfer.hash];
    let eventType: EventType;
    let price: InterpretedEvent['price'] | undefined = undefined;
    let logInitiator: string | undefined = undefined;

    if (transfer.from === "0x0000000000000000000000000000000000000000") {
      eventType = EventType.MINT;
      logInitiator = transfer.contractAddress;
    } else if (transfer.to.toLowerCase() === marketplaceAddress.toLowerCase() && 
               transfer.from.toLowerCase() !== marketplaceAddress.toLowerCase()) {
      eventType = EventType.LISTING_TRANSFER; 
      logInitiator = marketplaceAddress;
    } else if (transfer.from.toLowerCase() === marketplaceAddress.toLowerCase() && 
               transfer.to.toLowerCase() !== marketplaceAddress.toLowerCase()) {
      eventType = EventType.DELISTING_TRANSFER;
      logInitiator = marketplaceAddress;
    } else if (transfer.from.toLowerCase() === marketplaceAddress.toLowerCase() && 
               transfer.to.toLowerCase() === marketplaceAddress.toLowerCase()) {
      eventType = EventType.CONTRACT_INTERACTION; // NFT moved within marketplace
      logInitiator = marketplaceAddress;
    } else {
      eventType = EventType.TRANSFER;
      logInitiator = receipt?.to?.toLowerCase() === transfer.contractAddress.toLowerCase() ? transfer.contractAddress : receipt?.to || undefined;
    }
    
    // Check for WBNB payment indicating a sale for DELISTING_TRANSFER
    if (eventType === EventType.DELISTING_TRANSFER && receipt?.logs) {
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() === WBNB_ADDRESS.toLowerCase() && 
            log.topics[0] === ERC20_TRANSFER_EVENT_SIGNATURE && log.topics.length === 3) {
          const paymentFrom = `0x${log.topics[1].slice(26)}`.toLowerCase();
          const paymentAmount = BigInt(log.data).toString();

          // If the recipient of the NFT (transfer.to) is the one making the WBNB payment
          if (paymentFrom === transfer.to.toLowerCase()) {
            eventType = EventType.SALE; // Upgrade DELISTING_TRANSFER to SALE
            price = { amount: weiToBnb(paymentAmount), currency: "WBNB" };
            break; 
          }
        }
      }
    }
    // Check for P2P sales not involving marketplace as sender/receiver of NFT
    if (eventType === EventType.TRANSFER && receipt?.logs) {
        for (const log of receipt.logs) {
             if (log.address.toLowerCase() === WBNB_ADDRESS.toLowerCase() && 
                log.topics[0] === ERC20_TRANSFER_EVENT_SIGNATURE && log.topics.length === 3) {
                const paymentFrom = `0x${log.topics[1].slice(26)}`.toLowerCase();
                const paymentTo = `0x${log.topics[2].slice(26)}`.toLowerCase();
                const paymentAmount = BigInt(log.data).toString();
                if (paymentFrom === transfer.to.toLowerCase() && paymentTo === transfer.from.toLowerCase()) {
                    eventType = EventType.SALE;
                    price = { amount: weiToBnb(paymentAmount), currency: "WBNB" };
                    logInitiator = WBNB_ADDRESS;
                    break;
                }
            }
        }
    }
    
    const eventDetails: InterpretedEvent['details'] = {
        gasUsed: transfer.gasUsed,
        gasPrice: transfer.gasPrice,
        nftContract: transfer.contractAddress,
        tokenName: transfer.tokenName,
        tokenSymbol: transfer.tokenSymbol,
    };

    if (txFeeDetailsMap[transfer.hash]) {
        eventDetails.feePaidToSystem = txFeeDetailsMap[transfer.hash];
    }

    const interpretedEvent: InterpretedEvent = {
      type: eventType,
      timestamp: parseInt(transfer.timeStamp),
      transactionHash: transfer.hash,
      from: transfer.from,
      to: transfer.to,
      tokenId: tokenId,
      price: price, // Price from WBNB log for sale
      logInitiator: logInitiator,
      details: eventDetails
    };
    allInterpretedEvents.push(interpretedEvent);
  }

  // Process Normal Transactions to the Marketplace
  for (const tx of normalTransactions) {
    if (tx.to?.toLowerCase() !== marketplaceAddress.toLowerCase()) continue; 
    if (tx.isError === "1" || (txReceiptsMap[tx.hash] && txReceiptsMap[tx.hash].status !== "0x1")) continue;

    let eventType: EventType = EventType.GENERAL_MARKETPLACE_INTERACTION;
    const funcNameLower = tx.functionName?.toLowerCase().match(/^[a-zA-Z0-9_]+/)?.[0] || "";
    
    if (funcNameLower) {
        for (const keyword in MARKETPLACE_FUNCTION_KEYWORDS) {
            if (funcNameLower.includes(keyword)) {
                eventType = MARKETPLACE_FUNCTION_KEYWORDS[keyword];
                break;
            }
        }
    }
    
    let specificTokenId: string | undefined;
    let parsedExpiryTimestamp: number | undefined;
    const inputData = tx.input.startsWith('0x') ? tx.input.substring(2) : tx.input;
    const methodIdHex = inputData.substring(0, 8).toLowerCase();

    // Prioritize parsing input data for known method IDs
    if (methodIdHex === '791bb4ef' && eventType === EventType.LISTING_INTENT) { // createAuction(address,uint256,uint256,uint256,uint256,uint256)
        const paramsString = inputData.substring(8);
        if (paramsString.length >= 64 * 6) { 
            try {
                specificTokenId = BigInt('0x' + paramsString.substring(64 * 1, 64 * 2)).toString();
                const durationSeconds = parseInt(BigInt('0x' + paramsString.substring(64 * 5, 64 * 6)).toString());
                if (!isNaN(durationSeconds) && durationSeconds > 0) {
                    parsedExpiryTimestamp = parseInt(tx.timeStamp) + durationSeconds;
                }
            } catch (e) { console.warn(`Error parsing input for createAuction (tx: ${tx.hash}):`, e); }
        }
    } else if (methodIdHex === '886e5b1e' && eventType === EventType.LISTING_INTENT) { // createAuctionWithoutReservePrice(address,uint256,uint256,uint256,uint256)
        const paramsString = inputData.substring(8);
        if (paramsString.length >= 64 * 5) {
             try {
                specificTokenId = BigInt('0x' + paramsString.substring(64 * 1, 64 * 2)).toString(); // TokenID is 2nd param (index 1)
                const durationSeconds = parseInt(BigInt('0x' + paramsString.substring(64 * 4, 64 * 5)).toString()); // Duration is 5th param (index 4)
                if (!isNaN(durationSeconds) && durationSeconds > 0) {
                    parsedExpiryTimestamp = parseInt(tx.timeStamp) + durationSeconds;
                }
            } catch (e) { console.warn(`Error parsing input for createAuctionWithoutReservePrice (tx: ${tx.hash}):`, e); }
        }
    } else if (methodIdHex === '68905116' && eventType === EventType.PURCHASE_INTENT) { // finalizeAuction(address _seller, uint256 _tokenId)
        const paramsString = inputData.substring(8);
        if (paramsString.length >= 64 * 2) {
            try {
                // const sellerAddress = '0x' + paramsString.substring(24 + 64 * 0, 64 * 1); // Not strictly needed for event interpretation here
                specificTokenId = BigInt('0x' + paramsString.substring(64 * 1, 64 * 2)).toString(); // TokenID is 2nd param (index 1)
            } catch (e) { console.warn(`Error parsing input for finalizeAuction (tx: ${tx.hash}):`, e); }
        }
    }
    
    // Fallback or supplement with function name parsing if direct input parsing didn't yield results
    if (!specificTokenId || (eventType === EventType.LISTING_INTENT && !parsedExpiryTimestamp)) {
        const extractedParams = extractFunctionParams(tx.functionName, eventType, parseInt(tx.timeStamp));
        if (!specificTokenId) specificTokenId = extractedParams.tokenId;
        if (eventType === EventType.LISTING_INTENT && !parsedExpiryTimestamp) {
             parsedExpiryTimestamp = extractedParams.expiryTimestamp;
        }
    }

    // Associate with NFT transfers in the same tx if tokenId wasn't in function call
    if (!specificTokenId) {
        const nftTransfersInSameTx = nftTransfers.filter(nftTx => nftTx.hash === tx.hash);
        if (nftTransfersInSameTx.length > 0) {
            specificTokenId = nftTransfersInSameTx[0].tokenID;
        }
    }

    const eventDetails: InterpretedEvent['details'] = {
        gasUsed: tx.gasUsed,
        gasPrice: tx.gasPrice,
        inputData: tx.input.substring(0, 10) + (tx.input.length > 10 ? '...' : ''),
    };
    if (txFeeDetailsMap[tx.hash]) {
        eventDetails.feePaidToSystem = txFeeDetailsMap[tx.hash];
    }

    const interpretedEvent: InterpretedEvent = {
      type: eventType,
      timestamp: parseInt(tx.timeStamp),
      transactionHash: tx.hash,
      from: tx.from,
      to: tx.to || undefined, 
      tokenId: specificTokenId,
      functionName: tx.functionName || tx.methodId,
      value: tx.value && tx.value !== "0" ? weiToBnb(tx.value) : undefined,
      logInitiator: marketplaceAddress,
      expiryTimestamp: (eventType === EventType.LISTING_INTENT && parsedExpiryTimestamp) ? parsedExpiryTimestamp : undefined,
      details: eventDetails
    };
    allInterpretedEvents.push(interpretedEvent);
  }

  allInterpretedEvents.sort((a,b) => a.timestamp - b.timestamp);

  for (const event of allInterpretedEvents) {
    if (event.tokenId) {
      if (!nftActivity[event.tokenId]) {
        nftActivity[event.tokenId] = [];
      }
      const existingEventIndex = nftActivity[event.tokenId].findIndex(e => e.transactionHash === event.transactionHash && e.type === event.type && e.logInitiator === event.logInitiator && JSON.stringify(e.details) === JSON.stringify(event.details));
      if(existingEventIndex === -1) {
         nftActivity[event.tokenId].push(event);
      }
    } else if (
        event.type === EventType.GENERAL_MARKETPLACE_INTERACTION ||
        event.type === EventType.LISTING_INTENT ||
        event.type === EventType.BID_PLACED_INTENT ||
        event.type === EventType.CANCEL_LISTING_INTENT ||
        event.type === EventType.PURCHASE_INTENT
    ) {
       const existingGeneralEventIndex = generalActivity.findIndex(e => e.transactionHash === event.transactionHash && e.type === event.type && e.logInitiator === event.logInitiator && JSON.stringify(e.details) === JSON.stringify(event.details));
       if(existingGeneralEventIndex === -1) {
          generalActivity.push(event);
       }
    }
  }
  
  for (const tokenId in nftActivity) {
    nftActivity[tokenId].sort((a, b) => {
      if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
      // Define a preferred order for events within the same timestamp to ensure listing intents/transfers come first
      const typeOrder = [
          EventType.LISTING_INTENT, 
          EventType.LISTING_TRANSFER, 
          EventType.BID_PLACED_INTENT, 
          EventType.PURCHASE_INTENT, 
          EventType.SALE, // Explicit sales (from WBNB) should be high prio
          EventType.DELISTING_TRANSFER, 
          EventType.CANCEL_LISTING_INTENT,
          EventType.MINT,
          EventType.TRANSFER,
          EventType.GENERAL_MARKETPLACE_INTERACTION,
          EventType.CONTRACT_INTERACTION
        ];
      const orderA = typeOrder.indexOf(a.type);
      const orderB = typeOrder.indexOf(b.type);
      if (orderA !== -1 && orderB !== -1) return orderA - orderB;
      if (orderA !== -1) return -1;
      if (orderB !== -1) return 1;
      return 0;
    });
  }
  generalActivity.sort((a,b) => a.timestamp - b.timestamp);


  setLoadingMessage("Processing complete.");
  return {nftActivity, generalActivity};
};

export const formatAddress = (address?: string): string => {
  if (!address) return 'N/A';
  if (address === "0x0000000000000000000000000000000000000000") return "Zero Address (Mint/Burn)";
  return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
};

export const formatDate = (timestamp: number): string => {
  return new Date(timestamp * 1000).toLocaleString();
};