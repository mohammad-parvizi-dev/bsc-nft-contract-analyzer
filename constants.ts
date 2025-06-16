
import { EventType } from './types'; // Added import

export const BSCSCAN_API_URL = "https://api.bscscan.com/api";
export const WBNB_ADDRESS = "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c"; // Wrapped BNB
export const FEE_COLLECTION_WALLET_ADDRESS = "0x9ce26e127c6769f22df01991df0c9825ff883395"; // Wallet for system fees

export const ERC20_TRANSFER_EVENT_SIGNATURE = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
export const ERC721_TRANSFER_EVENT_SIGNATURE = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"; // Same as ERC20, context matters

export const KNOWN_MARKETPLACE_EVENT_SIGNATURES: Record<string, string> = {
  // Example: OpenSea's Seaport (Ethereum, but patterns might be similar)
  "0x9d9af8e38d66c62e2c12f0225249fd9d721c54b83f48d9352c97c6cacdcb6f31": "OrderFulfilled", // Seaport
  "0x42b95dede935e23c7414962c0409a68ffb44d7fb850eb2eb07c91795106bd0ed": "OrderCancelled", // Seaport
  // Add more known BSC marketplace event signatures here if identified
};

export const RATE_LIMIT_DELAY_MS = 250; // Delay to stay under 5 calls/sec (4 calls/sec target)

// Keywords to identify marketplace actions from functionName
export const MARKETPLACE_FUNCTION_KEYWORDS: Record<string, EventType> = {
  // Listing/Auction Creation
  "createauction": EventType.LISTING_INTENT,
  "createauctionwithoutreserveprice": EventType.LISTING_INTENT, // Added
  "createlisting": EventType.LISTING_INTENT,
  "listitem": EventType.LISTING_INTENT,
  "sellitem": EventType.LISTING_INTENT,
  "addorder": EventType.LISTING_INTENT,
  "createorder": EventType.LISTING_INTENT,
  
  // Bidding
  "placebid": EventType.BID_PLACED_INTENT,
  "bid": EventType.BID_PLACED_INTENT,
  "makeoffer": EventType.BID_PLACED_INTENT, // Could be offer too
  
  // Cancellation
  "cancelauction": EventType.CANCEL_LISTING_INTENT,
  "cancellisting": EventType.CANCEL_LISTING_INTENT,
  "cancelorder": EventType.CANCEL_LISTING_INTENT,
  "unlistItem": EventType.CANCEL_LISTING_INTENT,
  
  // Purchase/Sale Execution
  "buyitem": EventType.PURCHASE_INTENT,
  "executesale": EventType.PURCHASE_INTENT,
  "fulfillorder": EventType.PURCHASE_INTENT,
  "matchorder": EventType.PURCHASE_INTENT,
  "acceptoffer": EventType.PURCHASE_INTENT,
  "acceptbid": EventType.PURCHASE_INTENT,
  "atomicmatch_": EventType.PURCHASE_INTENT, // Common in OpenSea-like contracts
  "finalizeauction": EventType.PURCHASE_INTENT, // Added: results in purchase
};