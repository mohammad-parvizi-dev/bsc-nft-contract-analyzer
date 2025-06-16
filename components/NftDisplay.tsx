
import React, { useState, useMemo } from 'react';
import { NftActivityHistory, GeneralMarketplaceActivity, InterpretedEvent, EventType, NftMarketStatus, NftOverallStatus } from '../types';
import EventCard from './EventCard';
import { formatDate, formatAddress } from '../utils/bscscanHelper';
import { FEE_COLLECTION_WALLET_ADDRESS } from '../constants';

interface NftDisplayProps {
  nftActivity: NftActivityHistory;
  generalActivity: GeneralMarketplaceActivity;
  analyzedContractAddress: string;
}

interface DisplayableListingCycle {
  uniqueCycleId: string;
  tokenId: string;
  listingNumber: number;
  events: InterpretedEvent[];
  status: NftOverallStatus;
  tokenName?: string;
  tokenSymbol?: string;
  firstEventTimestamp: number;
}

const getMarketplaceAddressFromEvents = (events: InterpretedEvent[], preferredMarketplace?: string): string | undefined => {
  if (preferredMarketplace) return preferredMarketplace.toLowerCase();
  for (const event of events) {
    if (event.type === EventType.LISTING_TRANSFER && event.to) return event.to.toLowerCase();
    if (event.type === EventType.DELISTING_TRANSFER && event.from) return event.from.toLowerCase();
    if ((event.type === EventType.LISTING_INTENT ||
         event.type === EventType.BID_PLACED_INTENT ||
         event.type === EventType.CANCEL_LISTING_INTENT ||
         event.type === EventType.PURCHASE_INTENT ||
         event.type === EventType.GENERAL_MARKETPLACE_INTERACTION) && event.logInitiator) {
           return event.logInitiator.toLowerCase();
         }
  }
  const marketplaceInteractionEvents = events.filter(e =>
    e.type === EventType.LISTING_INTENT ||
    e.type === EventType.BID_PLACED_INTENT ||
    e.type === EventType.CANCEL_LISTING_INTENT ||
    e.type === EventType.PURCHASE_INTENT
  );
  if (marketplaceInteractionEvents.length > 0 && marketplaceInteractionEvents[0].to) {
    return marketplaceInteractionEvents[0].to.toLowerCase();
  }
  return undefined;
};

const determineNftMarketStatus = (
  cycleEvents: InterpretedEvent[],
  primaryMarketplaceAddress: string | undefined,
  cycleGlobalTokenName?: string,
  cycleGlobalTokenSymbol?: string
): NftOverallStatus => {
  if (!cycleEvents || cycleEvents.length === 0) {
    return { status: NftMarketStatus.NOT_LISTED_OR_OTHER, tokenName: cycleGlobalTokenName, tokenSymbol: cycleGlobalTokenSymbol };
  }

  const marketplaceAddress = primaryMarketplaceAddress;
  const tokenName = cycleGlobalTokenName;
  const tokenSymbol = cycleGlobalTokenSymbol;

  const cycleDefiningListingEvent = cycleEvents.find(event =>
    event.type === EventType.LISTING_INTENT ||
    (event.type === EventType.LISTING_TRANSFER && event.to?.toLowerCase() === marketplaceAddress)
  );

  if (!cycleDefiningListingEvent) {
    return { status: NftMarketStatus.NOT_LISTED_OR_OTHER, tokenName, tokenSymbol };
  }

  const currentLister = cycleDefiningListingEvent.from?.toLowerCase();
  if (!currentLister) {
    return { status: NftMarketStatus.UNKNOWN, tokenName, tokenSymbol };
  }

  let isEscrowedInThisCycle = cycleDefiningListingEvent.type === EventType.LISTING_TRANSFER && cycleDefiningListingEvent.to?.toLowerCase() === marketplaceAddress;
  if (cycleDefiningListingEvent.type === EventType.LISTING_INTENT && marketplaceAddress) {
    const correspondingTransferInCycle = cycleEvents.find(e =>
      e.transactionHash === cycleDefiningListingEvent.transactionHash &&
      e.type === EventType.LISTING_TRANSFER &&
      e.to?.toLowerCase() === marketplaceAddress &&
      e.from?.toLowerCase() === currentLister
    );
    if (correspondingTransferInCycle) {
      isEscrowedInThisCycle = true;
    }
  }

  const cycleStartTimestamp = cycleDefiningListingEvent.timestamp;
  const listingExpiryTimestamp = cycleDefiningListingEvent.expiryTimestamp;

  let soldEvent: InterpretedEvent | undefined = undefined;
  let cancelIntentEvent: InterpretedEvent | undefined = undefined;
  let delistingToListerEvent: InterpretedEvent | undefined = undefined;
  let delistingToOtherEvent: InterpretedEvent | undefined = undefined;
  let hasActiveBids = false;
  let saleDetailMessage: string | undefined;


  const sortedCycleEvents = [...cycleEvents].sort((a,b) => a.timestamp - b.timestamp);

  for (const event of sortedCycleEvents) {
    if (event.timestamp < cycleStartTimestamp) continue;
    
    if (soldEvent || (cancelIntentEvent && delistingToListerEvent)) {
        if(event.type === EventType.DELISTING_TRANSFER && event.from?.toLowerCase() === marketplaceAddress && event.to?.toLowerCase() === currentLister && cancelIntentEvent && !delistingToListerEvent) {
            delistingToListerEvent = event;
        }
        if(soldEvent || (cancelIntentEvent && delistingToListerEvent && event.type === EventType.BID_PLACED_INTENT)) continue;
    }

    if (!soldEvent) {
      if (event.type === EventType.SALE && event.tokenId === cycleDefiningListingEvent.tokenId &&
          ((event.from?.toLowerCase() === marketplaceAddress && event.to?.toLowerCase() !== currentLister) || 
           (event.from?.toLowerCase() === currentLister && event.to?.toLowerCase() !== marketplaceAddress && event.from?.toLowerCase() !== event.to?.toLowerCase() )) 
      ) {
          soldEvent = event;
          saleDetailMessage = "Sold (Direct Sale Event)";
      } else if (event.type === EventType.PURCHASE_INTENT && marketplaceAddress && event.tokenId === cycleDefiningListingEvent.tokenId) {
          const delistForPurchase = sortedCycleEvents.find(e =>
              e.transactionHash === event.transactionHash &&
              e.type === EventType.DELISTING_TRANSFER &&
              e.from?.toLowerCase() === marketplaceAddress &&
              e.to?.toLowerCase() !== currentLister &&
              e.tokenId === cycleDefiningListingEvent.tokenId
          );
          if (delistForPurchase) {
              soldEvent = { ...delistForPurchase, type: EventType.SALE }; 
              if (event.value) { 
                  soldEvent.price = { amount: event.value, currency: 'BNB' };
              } else if (delistForPurchase.price) {
                  soldEvent.price = delistForPurchase.price;
              } else if (delistForPurchase.details?.feePaidToSystem) { 
                  const feeInfo = delistForPurchase.details.feePaidToSystem;
                  const feeAmount = parseFloat(feeInfo.amount);
                  if (feeAmount > 0) { 
                    const inferredPrice = (feeAmount / 0.10).toFixed(6); // Assuming 10% fee
                    soldEvent.price = { amount: inferredPrice, currency: feeInfo.currency };
                  }
              }
              saleDetailMessage = "Sold: Purchase Intent";
          }
      } else if (event.type === EventType.DELISTING_TRANSFER && event.from?.toLowerCase() === marketplaceAddress && event.to?.toLowerCase() !== currentLister && event.tokenId === cycleDefiningListingEvent.tokenId) {
          const bidInSameTx = sortedCycleEvents.find(bidE => 
              bidE.transactionHash === event.transactionHash &&
              bidE.type === EventType.BID_PLACED_INTENT &&
              bidE.from?.toLowerCase() === event.to?.toLowerCase() && 
              bidE.tokenId === event.tokenId
          );

          if (bidInSameTx) {
              soldEvent = { ...event, type: EventType.SALE }; 
              soldEvent.price = bidInSameTx.value ? { amount: bidInSameTx.value, currency: 'BNB' } : event.price;
              saleDetailMessage = "Sold: Accepted Bid";
          } else {
              if (event.price && event.details?.feePaidToSystem?.receiver.toLowerCase() === FEE_COLLECTION_WALLET_ADDRESS.toLowerCase()) {
                  const alreadyMarkedAsSaleByProcess = cycleEvents.find(se => se.transactionHash === event.transactionHash && se.type === EventType.SALE && se.to === event.to && se.tokenId === event.tokenId);
                  if (!alreadyMarkedAsSaleByProcess) { 
                      soldEvent = { ...event, type: EventType.SALE }; 
                      saleDetailMessage = "Sold: Fee Inferred";
                  }
              }
          }
          
          if (!soldEvent && !delistingToOtherEvent) { 
            delistingToOtherEvent = event;
          }
      }
    }

    if (!soldEvent) {
        if (event.type === EventType.CANCEL_LISTING_INTENT && event.from?.toLowerCase() === currentLister && event.tokenId === cycleDefiningListingEvent.tokenId) {
            if(!cancelIntentEvent || event.timestamp > cancelIntentEvent.timestamp) cancelIntentEvent = event;
        }
        if (event.type === EventType.DELISTING_TRANSFER && event.from?.toLowerCase() === marketplaceAddress && event.to?.toLowerCase() === currentLister && event.tokenId === cycleDefiningListingEvent.tokenId) {
            if(!delistingToListerEvent || event.timestamp > delistingToListerEvent.timestamp) delistingToListerEvent = event;
        }
    }
    
    if (!soldEvent && !(cancelIntentEvent && delistingToListerEvent)) {
      if (event.type === EventType.BID_PLACED_INTENT &&
          event.from?.toLowerCase() !== currentLister &&
          event.tokenId === cycleDefiningListingEvent.tokenId &&
          (!listingExpiryTimestamp || event.timestamp <= listingExpiryTimestamp) &&
          (!cancelIntentEvent || event.timestamp < cancelIntentEvent.timestamp) 
         ) {
        hasActiveBids = true;
      }
    }
  }

  if (soldEvent) {
    // If the event is considered SOLD, but the script couldn't determine/infer a price for it,
    // then classify it as SOLD_PAYMENT_NOT_DETECTED.
    if (!soldEvent.price) {
        return {
            status: NftMarketStatus.SOLD_PAYMENT_NOT_DETECTED,
            lastLister: currentLister,
            buyer: soldEvent.to,
            tokenName,
            tokenSymbol,
            expiryTimestamp: listingExpiryTimestamp,
            // price will be undefined here
            details: "Considered Sold, but payment for item not detected by script."
        };
    }
    // Default SOLD case
    return { 
        status: NftMarketStatus.SOLD, 
        lastLister: currentLister, 
        buyer: soldEvent.to, 
        tokenName, 
        tokenSymbol, 
        expiryTimestamp: listingExpiryTimestamp, 
        price: soldEvent.price,
        details: saleDetailMessage || NftMarketStatus.SOLD.toString()
    };
  }

  if (cancelIntentEvent) {
    if (isEscrowedInThisCycle) {
      if (delistingToListerEvent && delistingToListerEvent.timestamp >= cancelIntentEvent.timestamp) {
        return { status: NftMarketStatus.CANCELLED, lastLister: currentLister, tokenName, tokenSymbol, expiryTimestamp: listingExpiryTimestamp, details: "Cancelled and item returned to lister." };
      }
      return { status: NftMarketStatus.CANCELLED, lastLister: currentLister, tokenName, tokenSymbol, expiryTimestamp: listingExpiryTimestamp, details: "Cancellation intent by lister." };

    } else { 
      return { status: NftMarketStatus.CANCELLED, lastLister: currentLister, tokenName, tokenSymbol, expiryTimestamp: listingExpiryTimestamp, details: "Cancellation intent by lister (item not escrowed)." };
    }
  }

  if (delistingToListerEvent) {
      return { status: NftMarketStatus.RETURNED_TO_LISTER, lastLister: currentLister, tokenName, tokenSymbol, expiryTimestamp: listingExpiryTimestamp, details: "Item returned to lister." };
  }

  const nowUnix = Math.floor(Date.now() / 1000);
  if (listingExpiryTimestamp && nowUnix > listingExpiryTimestamp) {
    if (hasActiveBids) {
        return { status: NftMarketStatus.EXPIRED_WITH_BIDS_NOT_RETURNED, lastLister: currentLister, tokenName, tokenSymbol, expiryTimestamp: listingExpiryTimestamp };
    } else {
        return { status: NftMarketStatus.EXPIRED_NOT_RETURNED, lastLister: currentLister, tokenName, tokenSymbol, expiryTimestamp: listingExpiryTimestamp };
    }
  }
  
  if (cycleDefiningListingEvent) { 
    if (isEscrowedInThisCycle && delistingToOtherEvent) { 
        return { status: NftMarketStatus.UNKNOWN, lastLister: currentLister, tokenName, tokenSymbol, details: "Item transferred from marketplace to an unknown party.", expiryTimestamp: listingExpiryTimestamp };
    }
    return { status: hasActiveBids ? NftMarketStatus.OPEN_WITH_BIDS : NftMarketStatus.OPEN_NO_BIDS, lastLister: currentLister, tokenName, tokenSymbol, expiryTimestamp: listingExpiryTimestamp };
  }

  return { status: NftMarketStatus.UNKNOWN, lastLister: currentLister, tokenName, tokenSymbol, expiryTimestamp: listingExpiryTimestamp };
};


const StatusIcon: React.FC<{ status: NftMarketStatus }> = ({ status }) => {
  let iconPath = <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.79 4 4s-1.79 4-4 4c-1.742 0-3.223-.835-3.772-2H5.5a.5.5 0 010-1h2.728zM15 13a1 1 0 11-2 0 1 1 0 012 0z" />; 
  let colorClass = "text-gray-400";

  switch (status) {
    case NftMarketStatus.SOLD: 
      iconPath = <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />;
      colorClass = "text-green-300";
      break;
    case NftMarketStatus.SOLD_PAYMENT_NOT_DETECTED:
      iconPath = <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />; // Warning Triangle
      colorClass = "text-amber-300"; // Amber for warning/attention
      break;
    case NftMarketStatus.CANCELLED: 
      iconPath = <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />;
      colorClass = "text-red-300";
      break;
    case NftMarketStatus.OPEN_WITH_BIDS: 
      iconPath = <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 15v-1a4 4 0 00-4-4H8m0 0l-3 3m3-3l3 3m0 0v-2m1.172-6.172a4 4 0 015.656 0M4.032 4.032a4 4 0 010 5.656" />;
      colorClass = "text-yellow-300"; 
      break;
    case NftMarketStatus.OPEN_NO_BIDS: 
      iconPath = <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 15v-1a4 4 0 00-4-4H8m0 0l-3 3m3-3l3 3m0 0v-2m0-10l4-4m0 0l4 4m-4-4v12" />;
      colorClass = "text-blue-300";
      break;
    case NftMarketStatus.RETURNED_TO_LISTER: 
    case NftMarketStatus.EXPIRED_WITH_BIDS_NOT_RETURNED:
      iconPath = <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />; 
      colorClass = "text-orange-300";
      break;
    case NftMarketStatus.EXPIRED_NOT_RETURNED: 
      iconPath = <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0zM7 10h-.01M7 13h-.01M10 7h-.01M13 7h-.01" />; 
      colorClass = "text-purple-300";
      break;
    case NftMarketStatus.NOT_LISTED_OR_OTHER: 
       iconPath = <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />;
       colorClass = "text-indigo-300";
       break;
    default: 
      colorClass = "text-gray-400";
      break;
  }

  return (
    <svg className={`w-6 h-6 mr-3 ${colorClass}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      {iconPath}
    </svg>
  );
};

const getStatusHeaderStyle = (status: NftMarketStatus): string => {
  switch (status) {
    case NftMarketStatus.SOLD:
      return 'bg-gradient-to-r from-green-600 via-green-700 to-green-800 hover:from-green-500 hover:to-green-700';
    case NftMarketStatus.SOLD_PAYMENT_NOT_DETECTED:
      return 'bg-gradient-to-r from-amber-600 via-amber-700 to-amber-800 hover:from-amber-500 hover:to-amber-700'; // Amber gradient
    case NftMarketStatus.CANCELLED:
    case NftMarketStatus.EXPIRED_NOT_RETURNED: 
      return 'bg-gradient-to-r from-red-600 via-red-700 to-red-800 hover:from-red-500 hover:to-red-700';
    case NftMarketStatus.OPEN_WITH_BIDS:
      return 'bg-gradient-to-r from-yellow-500 via-yellow-600 to-yellow-700 hover:from-yellow-400 hover:to-yellow-600'; 
    case NftMarketStatus.OPEN_NO_BIDS:
      return 'bg-gradient-to-r from-blue-600 via-blue-700 to-blue-800 hover:from-blue-500 hover:to-blue-700';
    case NftMarketStatus.RETURNED_TO_LISTER:
    case NftMarketStatus.EXPIRED_WITH_BIDS_NOT_RETURNED:
      return 'bg-gradient-to-r from-orange-500 via-orange-600 to-orange-700 hover:from-orange-400 hover:to-orange-600';
    case NftMarketStatus.NOT_LISTED_OR_OTHER:
      return 'bg-gradient-to-r from-indigo-600 via-indigo-700 to-indigo-800 hover:from-indigo-500 hover:to-indigo-700';
    default: // UNKNOWN
      return 'bg-gradient-to-r from-slate-600 via-slate-700 to-slate-800 hover:from-slate-500 hover:to-slate-700';
  }
};


const NftDisplay: React.FC<NftDisplayProps> = ({ nftActivity, generalActivity, analyzedContractAddress }) => {
  const [expandedCycleIds, setExpandedCycleIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<NftMarketStatus | ''>('');
  const [listerAddressFilter, setListerAddressFilter] = useState<string>('');
  
  const displayableListingCycles = useMemo(() => {
    const cycles: DisplayableListingCycle[] = [];
    if (!nftActivity) return cycles;

    Object.keys(nftActivity).forEach(tokenId => {
      const allTokenEvents = nftActivity[tokenId]; 
      if (!allTokenEvents || allTokenEvents.length === 0) return;

      const inferredMarketplaceForToken = getMarketplaceAddressFromEvents(allTokenEvents, analyzedContractAddress);

      let globalTokenName: string | undefined;
      let globalTokenSymbol: string | undefined;
      const firstEventWithDetails = allTokenEvents.find(e => e.details?.tokenName || e.details?.tokenSymbol);
      if (firstEventWithDetails) {
          globalTokenName = firstEventWithDetails.details?.tokenName;
          globalTokenSymbol = firstEventWithDetails.details?.tokenSymbol;
      }

      let currentCycleEvents: InterpretedEvent[] = [];
      let listingNumber = 0;
      const intentTxHashesForCurrentToken: Set<string> = new Set();


      for (let i = 0; i < allTokenEvents.length; i++) {
        const event = allTokenEvents[i];
        let isNewCycleTrigger = false;

        if (event.type === EventType.LISTING_INTENT) {
          isNewCycleTrigger = true;
        } else if (
          event.type === EventType.LISTING_TRANSFER &&
          event.to?.toLowerCase() === inferredMarketplaceForToken
        ) {
          if (!intentTxHashesForCurrentToken.has(event.transactionHash)) {
            isNewCycleTrigger = true;
          }
        }
        
        if (event.type === EventType.LISTING_TRANSFER &&
            event.to?.toLowerCase() === inferredMarketplaceForToken &&
            intentTxHashesForCurrentToken.has(event.transactionHash) &&
            currentCycleEvents.some(ce => ce.type === EventType.LISTING_INTENT && ce.transactionHash === event.transactionHash)
            ) {
            isNewCycleTrigger = false; 
        }


        if (isNewCycleTrigger) {
          if (currentCycleEvents.length > 0) { 
            const status = determineNftMarketStatus(currentCycleEvents, inferredMarketplaceForToken, globalTokenName, globalTokenSymbol);
            cycles.push({
              uniqueCycleId: `${tokenId}-${listingNumber}-${currentCycleEvents[0].timestamp}`,
              tokenId,
              listingNumber,
              events: [...currentCycleEvents], 
              status,
              tokenName: globalTokenName,
              tokenSymbol: globalTokenSymbol,
              firstEventTimestamp: currentCycleEvents[0].timestamp,
            });
            intentTxHashesForCurrentToken.clear(); 
          }
          listingNumber++;
          currentCycleEvents = [event]; 
          if (event.type === EventType.LISTING_INTENT) {
            intentTxHashesForCurrentToken.add(event.transactionHash);
          }
        } else if (listingNumber > 0) { 
          currentCycleEvents.push(event);
          if (event.type === EventType.LISTING_INTENT && !intentTxHashesForCurrentToken.has(event.transactionHash)) {
            intentTxHashesForCurrentToken.add(event.transactionHash);
          }
        } else if (listingNumber === 0 && currentCycleEvents.length === 0 && (event.type === EventType.LISTING_INTENT || (event.type === EventType.LISTING_TRANSFER && event.to?.toLowerCase() === inferredMarketplaceForToken))) {
          listingNumber++;
          currentCycleEvents = [event];
          if (event.type === EventType.LISTING_INTENT) {
            intentTxHashesForCurrentToken.add(event.transactionHash);
          }
        } else if (listingNumber === 0 && currentCycleEvents.length > 0 && event.type === EventType.LISTING_TRANSFER && event.to?.toLowerCase() === inferredMarketplaceForToken && currentCycleEvents[0].transactionHash === event.transactionHash && currentCycleEvents[0].type === EventType.LISTING_INTENT) {
           currentCycleEvents.push(event);
        }
      }

      if (currentCycleEvents.length > 0 && listingNumber > 0) {
        const status = determineNftMarketStatus(currentCycleEvents, inferredMarketplaceForToken, globalTokenName, globalTokenSymbol);
        cycles.push({
          uniqueCycleId: `${tokenId}-${listingNumber}-${currentCycleEvents[0].timestamp}`,
          tokenId,
          listingNumber,
          events: currentCycleEvents,
          status,
          tokenName: globalTokenName,
          tokenSymbol: globalTokenSymbol,
          firstEventTimestamp: currentCycleEvents[0].timestamp,
        });
      }
    });

    cycles.sort((a, b) => {
      const numA = parseInt(a.tokenId);
      const numB = parseInt(b.tokenId);
      if (!isNaN(numA) && !isNaN(numB) && numA !== numB) {
        return numA - numB;
      }
      if (a.tokenId.localeCompare(b.tokenId) !== 0) {
        return a.tokenId.localeCompare(b.tokenId);
      }
      if (a.firstEventTimestamp !== b.firstEventTimestamp) {
        return a.firstEventTimestamp - b.firstEventTimestamp;
      }
      return a.listingNumber - b.listingNumber;
    });

    return cycles;
  }, [nftActivity, analyzedContractAddress]);


  const filteredAndSortedDisplayableListingCycles = useMemo(() => {
    return displayableListingCycles.filter(cycle => {
        let matchesSearch = true;
        if (searchTerm) {
            const termLower = searchTerm.toLowerCase();
            matchesSearch =
                cycle.tokenId.toLowerCase().includes(termLower) ||
                (cycle.tokenName || '').toLowerCase().includes(termLower) ||
                (cycle.tokenSymbol || '').toLowerCase().includes(termLower) ||
                (cycle.status.lastLister || '').toLowerCase().includes(termLower) ||
                (cycle.status.buyer || '').toLowerCase().includes(termLower) ||
                cycle.events.some(event => event.transactionHash.toLowerCase().includes(termLower));
        }

        let matchesStatusFilter = true;
        if (selectedStatus) {
            matchesStatusFilter = cycle.status.status === selectedStatus;
        }

        let matchesLister = true;
        if (listerAddressFilter) {
            matchesLister = (cycle.status.lastLister || '').toLowerCase().includes(listerAddressFilter.toLowerCase());
        }
        return matchesSearch && matchesStatusFilter && matchesLister;
    });
  }, [displayableListingCycles, searchTerm, selectedStatus, listerAddressFilter]);


  const toggleCycleId = (cycleId: string) => {
    setExpandedCycleIds(prev => {
      const next = new Set(prev);
      if (next.has(cycleId)) {
        next.delete(cycleId);
      } else {
        next.add(cycleId);
      }
      return next;
    });
  };

  const hasNftCycles = displayableListingCycles.length > 0;
  const hasGeneralActivity = generalActivity.length > 0;

  if (!hasNftCycles && !hasGeneralActivity) {
    return <p className="text-center text-gray-400 mt-8">No NFT listing cycles or general marketplace activity to display.</p>;
  }
  
  const totalCyclesCount = displayableListingCycles.length;
  const displayedCyclesCount = filteredAndSortedDisplayableListingCycles.length;

  const availableStatusOptions = Object.values(NftMarketStatus).filter(status => 
    status !== NftMarketStatus.EXPIRED_WITH_BIDS_NOT_RETURNED && // Typically less useful as a primary filter
    status !== NftMarketStatus.NOT_LISTED_OR_OTHER // This is a fallback, not a user-selectable state
  );

  return (
    <div className="space-y-6 mt-8">
      {hasNftCycles && (
        <div>
          <h2 className="text-2xl font-semibold text-gray-100 mb-6 text-center">NFT Listing Activity Cycles</h2>
          
          <div className="mb-6 p-4 card rounded-lg shadow-lg bg-slate-800 border border-slate-700 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <input
                type="text"
                placeholder="Search ID, Name, Tx Hash, Wallets..."
                className="input-dark w-full px-3 py-2 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                aria-label="Search NFT listings by ID, name, transaction hash, or wallet address"
              />
              <select
                className="input-dark w-full px-3 py-2 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value as NftMarketStatus | '')}
                aria-label="Filter by status"
              >
                <option value="">All Statuses</option>
                {availableStatusOptions.map(status => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Filter by Lister Address..."
                className="input-dark w-full px-3 py-2 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                value={listerAddressFilter}
                onChange={(e) => setListerAddressFilter(e.target.value)}
                aria-label="Filter by lister address"
              />
            </div>
            <p className="text-sm text-gray-400 text-center">
              Displaying {displayedCyclesCount} of {totalCyclesCount} total NFT listing instances.
            </p>
          </div>

          {filteredAndSortedDisplayableListingCycles.length === 0 && (
            <p className="text-center text-gray-400 mt-6">No NFT listing instances match your current filters.</p>
          )}

          {filteredAndSortedDisplayableListingCycles.map(cycle => {
            const { uniqueCycleId, tokenId, listingNumber, events: cycleEvents, status: overallStatus, tokenName, tokenSymbol } = cycle;
            
            const displayName = tokenName || 'NFT';
            const displaySymbol = tokenSymbol ? `(${tokenSymbol})` : '';
            
            let statusPrimaryInfo = overallStatus.status.toString(); 
            let statusSecondaryInfo = `(${cycleEvents.length} event${cycleEvents.length === 1 ? '' : 's'})`;


            if (overallStatus.status === NftMarketStatus.SOLD) {
                statusPrimaryInfo = overallStatus.details || NftMarketStatus.SOLD.toString(); 
                if (overallStatus.price) {
                    statusPrimaryInfo += ` for ${overallStatus.price.amount} ${overallStatus.price.currency}`;
                }
                if (overallStatus.buyer) {
                    statusSecondaryInfo = `to ${formatAddress(overallStatus.buyer)}`;
                }
            } else if (overallStatus.status === NftMarketStatus.SOLD_PAYMENT_NOT_DETECTED) {
                statusPrimaryInfo = NftMarketStatus.SOLD_PAYMENT_NOT_DETECTED.toString();
                 if (overallStatus.buyer) {
                    statusSecondaryInfo = `to ${formatAddress(overallStatus.buyer)}`;
                 } else {
                    statusSecondaryInfo = overallStatus.details || "Payment details unclear";
                 }
                 if(overallStatus.details){
                    statusPrimaryInfo = overallStatus.details
                 }
            } else if (overallStatus.status === NftMarketStatus.RETURNED_TO_LISTER || overallStatus.status === NftMarketStatus.CANCELLED) {
                if (overallStatus.details) { 
                    statusSecondaryInfo = overallStatus.details;
                }
            } else if (overallStatus.status === NftMarketStatus.EXPIRED_NOT_RETURNED || overallStatus.status === NftMarketStatus.EXPIRED_WITH_BIDS_NOT_RETURNED) {
                 if (overallStatus.expiryTimestamp) {
                    statusSecondaryInfo = `Expired: ${formatDate(overallStatus.expiryTimestamp)}`;
                 }
            } else if (overallStatus.status === NftMarketStatus.OPEN_WITH_BIDS || overallStatus.status === NftMarketStatus.OPEN_NO_BIDS) {
                if (overallStatus.expiryTimestamp) {
                    statusSecondaryInfo = `Expires: ${formatDate(overallStatus.expiryTimestamp)}`;
                }
            }


            const headerStyle = getStatusHeaderStyle(overallStatus.status);
            const headerTextColor = (overallStatus.status === NftMarketStatus.OPEN_WITH_BIDS || overallStatus.status === NftMarketStatus.SOLD_PAYMENT_NOT_DETECTED) ? 'text-gray-900 font-medium' : 'text-gray-100';

            return (
              <div key={uniqueCycleId} className="card rounded-lg shadow-2xl overflow-hidden mb-6 border border-slate-700">
                <button
                  onClick={() => toggleCycleId(uniqueCycleId)}
                  className={`w-full text-left p-5 ${headerStyle} transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-sky-400`}
                  aria-expanded={expandedCycleIds.has(uniqueCycleId)}
                  aria-controls={`nft-events-${uniqueCycleId}`}
                >
                  <div className="flex justify-between items-center">
                    <div className="flex items-center overflow-hidden">
                      <StatusIcon status={overallStatus.status} />
                      <div className={`${headerTextColor} overflow-hidden`}>
                        <h3 className="text-xl font-semibold truncate" title={`Token ID: ${tokenId} (Listing #${listingNumber}) - ${displayName} ${displaySymbol}`}>
                          Token ID: {tokenId} <span className="font-normal">(Listing #{listingNumber})</span>
                          <span className="text-lg font-normal ml-2 opacity-90 truncate hidden sm:inline">{displayName} {displaySymbol}</span>
                        </h3>
                        <p className="text-sm opacity-80 truncate" title={`${statusPrimaryInfo} - ${statusSecondaryInfo}`}>
                           {statusPrimaryInfo} <span className="opacity-80 hidden md:inline">- {statusSecondaryInfo}</span>
                        </p>
                      </div>
                    </div>
                    <svg 
                      className={`w-7 h-7 transform transition-transform duration-200 flex-shrink-0 ${expandedCycleIds.has(uniqueCycleId) ? 'rotate-180' : ''} ${headerTextColor} opacity-70`} 
                      fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"
                      aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                    </svg>
                  </div>
                </button>
                {expandedCycleIds.has(uniqueCycleId) && (
                  <div id={`nft-events-${uniqueCycleId}`} className="p-2 sm:p-4 bg-slate-800 border-t border-slate-700">
                    {cycleEvents && cycleEvents.length > 0 ? (
                      cycleEvents.map((event, index) => (
                        <EventCard 
                            key={`${event.transactionHash}-${event.type}-${event.from || 'no_from'}-${event.to || 'no_to'}-${event.tokenId || 'no_id'}-${event.timestamp}-${index}`} 
                            event={event} 
                        />
                      ))
                    ) : (
                      <p className="text-gray-400 p-4">No events found for this listing cycle.</p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {hasGeneralActivity && generalActivity.length > 0 && ( 
         <div className="mt-12">
            <h2 className="text-2xl font-semibold text-gray-100 mb-6 text-center">General Marketplace Interactions</h2>
            <p className="text-sm text-gray-400 mb-4 text-center max-w-2xl mx-auto">
              These are interactions with the marketplace contract that could not be directly tied to a specific Token ID or listing cycle, or represent general contract function calls.
            </p>
            <div className="card rounded-lg shadow-xl overflow-hidden p-2 sm:p-4 bg-slate-800 border border-slate-700">
              {generalActivity.map((event, index) => (
                 <EventCard 
                    key={`${event.transactionHash}-${event.type}-general-${event.from || 'no_from'}-${event.to || 'no_to'}-${event.timestamp}-${index}`} 
                    event={event} 
                />
              ))}
            </div>
         </div>
      )}
    </div>
  );
};

export default NftDisplay;