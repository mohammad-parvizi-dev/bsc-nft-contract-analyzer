
export interface BscScanTx { // For tokennfttx endpoint
  blockNumber: string;
  timeStamp: string;
  hash: string;
  nonce: string;
  blockHash: string;
  from: string;
  contractAddress: string; // The NFT contract address
  to: string;
  tokenID: string;
  tokenName: string;
  tokenSymbol: string;
  tokenDecimal: string;
  transactionIndex: string;
  gas: string;
  gasPrice: string;
  gasUsed: string;
  cumulativeGasUsed: string;
  input: string; // Typically "deprecated" for tokennfttx, but present
  confirmations: string;
}

export interface BscScanNormalTx { // For txlist endpoint
  blockNumber: string;
  timeStamp: string;
  hash: string;
  nonce: string;
  blockHash: string;
  transactionIndex: string;
  from: string;
  to: string | null; // Can be null for contract creation
  value: string;
  gas: string;
  gasPrice: string;
  isError: string; // "0" for false, "1" for true
  txreceipt_status: string; // "1" for success, "0" for failure
  input: string;
  contractAddress: string; // Empty if not a contract creation
  cumulativeGasUsed: string;
  gasUsed: string;
  confirmations: string;
  methodId: string;
  functionName?: string; // e.g., "transfer(address _to, uint256 _value)"
}

export interface BscScanApiResponse<T> {
  status: string;
  message: string;
  result: T;
}

export interface TxReceiptLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
  transactionIndex: string;
  blockHash: string;
  logIndex: string;
  removed: boolean;
}

export interface TxReceipt {
  blockHash: string;
  blockNumber: string;
  contractAddress: string | null;
  cumulativeGasUsed: string;
  effectiveGasPrice: string;
  from: string;
  gasUsed: string;
  logs: TxReceiptLog[];
  logsBloom: string;
  status: string; // "0x1" for success
  to: string;
  transactionHash: string;
  transactionIndex: string;
  type: string;
}

export enum EventType {
  MINT = "Mint",
  TRANSFER = "Transfer",
  SALE = "Sale (Inferred)",
  LISTING_TRANSFER = "NFT Transfer to Contract (Potential Listing/Escrow)",
  DELISTING_TRANSFER = "NFT Transfer from Contract (Potential Sale/Delist/Return)",
  
  // New types for marketplace function calls
  LISTING_INTENT = "Listing Intent", // e.g., createAuction(), listItem()
  BID_PLACED_INTENT = "Bid Placed Intent",
  CANCEL_LISTING_INTENT = "Cancel Listing Intent",
  PURCHASE_INTENT = "Purchase Intent", // e.g., buyItem(), executeOrder()
  GENERAL_MARKETPLACE_INTERACTION = "Marketplace Contract Interaction",

  CONTRACT_INTERACTION = "Other Contract Interaction", // Generic from previous version
}

export interface InterpretedEvent {
  type: EventType;
  timestamp: number;
  transactionHash: string;
  from?: string;
  to?: string;
  tokenId?: string; // Optional: some marketplace events might not directly yield a tokenId easily
  price?: {
    amount: string;
    currency: string;
  };
  details?: {
    gasUsed?: string;
    gasPrice?: string;
    nftContract?: string;
    tokenName?: string;
    tokenSymbol?: string;
    inputData?: string;
    feePaidToSystem?: { // To record system fee payments
      amount: string; // Already converted to display currency (e.g., BNB)
      currency: string;
      receiver: string;
    };
    [key: string]: any; // Allow other dynamic details
  };
  logInitiator?: string; 
  functionName?: string; // From normal transaction
  value?: string; // BNB value sent with the normal transaction
  expiryTimestamp?: number; // Unix timestamp for auction/listing end (for LISTING_INTENT)
}

export type NftActivityHistory = Record<string, InterpretedEvent[]>; // Key is tokenId
export type GeneralMarketplaceActivity = InterpretedEvent[]; // For events not directly tied a tokenId

// For NftDisplay component to show summarized status
export enum NftMarketStatus {
  SOLD = "Sold",
  SOLD_PAYMENT_NOT_DETECTED = "Sold (Payment Not Detected)", // New status
  CANCELLED = "Cancelled by User",
  OPEN_WITH_BIDS = "Open with Bid(s)",
  OPEN_NO_BIDS = "Open (No Bids)",
  RETURNED_TO_LISTER = "Returned to Lister", 
  EXPIRED_NOT_RETURNED = "Expired (Item Not Returned)", 
  EXPIRED_WITH_BIDS_NOT_RETURNED = "Expired (Had Bids, Item Not Returned)",
  NOT_LISTED_OR_OTHER = "Not Listed / Other Activity",
  UNKNOWN = "Status Unknown" // Fallback
}

export interface NftOverallStatus {
  status: NftMarketStatus;
  lastLister?: string;
  buyer?: string;
  tokenName?: string;
  tokenSymbol?: string;
  expiryTimestamp?: number; // Propagate expiry for display/logic
  price?: { amount: string; currency: string }; // Added price field
  details?: string; // Added optional details field
}