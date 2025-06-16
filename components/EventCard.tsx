import React from 'react';
import { InterpretedEvent, EventType } from '../types';
import { formatAddress, formatDate } from '../utils/bscscanHelper';

interface EventCardProps {
  event: InterpretedEvent;
}

const EventTypeColors: Record<string, string> = {
  [EventType.MINT]: 'bg-green-500', // Brighter for marker
  [EventType.TRANSFER]: 'bg-blue-500',
  [EventType.SALE]: 'bg-purple-500',
  [EventType.LISTING_TRANSFER]: 'bg-yellow-500',
  [EventType.DELISTING_TRANSFER]: 'bg-orange-500',
  [EventType.CONTRACT_INTERACTION]: 'bg-indigo-500',
  
  [EventType.LISTING_INTENT]: 'bg-teal-500',
  [EventType.BID_PLACED_INTENT]: 'bg-cyan-500',
  [EventType.CANCEL_LISTING_INTENT]: 'bg-rose-500',
  [EventType.PURCHASE_INTENT]: 'bg-lime-500',
  [EventType.GENERAL_MARKETPLACE_INTERACTION]: 'bg-slate-500',
};

// Simple icons; consider using a library like react-icons for more variety
const EventIcon: React.FC<{type: EventType}> = ({ type }) => {
  let pathData = <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />; // Default icon

  switch (type) {
    case EventType.MINT: pathData = <><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" /></>; break;
    case EventType.TRANSFER: pathData = <><path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></>; break; 
    case EventType.SALE: pathData = <><path d="M3 1a1 1 0 000 2h1.22l.305 1.222a.997.997 0 00.01.042l1.358 5.43-.893.892C3.74 11.846 4.632 14 6.414 14H15a1 1 0 000-2H6.414l1-1H14a1 1 0 00.894-.553l3-6A1 1 0 0017 3H6.28l-.31-1.243A1 1 0 005 1H3zM16 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM6.5 18a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" /></>; break; 
    case EventType.LISTING_TRANSFER: pathData = <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16l-4-4m0 0l4-4m-4 4h18" /></>; break; 
    case EventType.DELISTING_TRANSFER: pathData = <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3" /></>; break; 
    case EventType.LISTING_INTENT: pathData = <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></>; break; 
    case EventType.BID_PLACED_INTENT: pathData = <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c1.104 0 2.104.896 2.104 2s-.9 2-2.104 2S9.896 11.104 9.896 10s.9-2 2.104-2zm0 0V6m0 12v-2m0 0H9m3 0h3m-3 0a9 9 0 110-18 9 9 0 010 18z" /></>; break; 
    case EventType.CANCEL_LISTING_INTENT: pathData = <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></>; break; 
    case EventType.PURCHASE_INTENT: pathData = <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></>; break; 
    case EventType.GENERAL_MARKETPLACE_INTERACTION:
    case EventType.CONTRACT_INTERACTION: pathData = <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></>; break; 
  }
  const SvgWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
     <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 md:h-6 md:w-6" fill={type === EventType.MINT ? "currentColor" : "none"} viewBox="0 0 20 20" stroke="currentColor">
        {children}
    </svg>
  );
  return <SvgWrapper>{pathData}</SvgWrapper>;
};


const EventCard: React.FC<EventCardProps> = ({ event }) => {
  const timelineMarkerColor = EventTypeColors[event.type] || 'bg-gray-500';

  return (
    <div className={`flex mb-3 rounded-lg shadow-lg overflow-hidden bg-slate-700 border border-slate-600 hover:shadow-xl transition-shadow duration-150`}>
      <div className={`w-2.5 ${timelineMarkerColor}`}></div> {/* Timeline Marker */}

      <div className={`p-3 sm:p-4 flex-grow`}>
        <div className={`flex items-center font-semibold text-base sm:text-lg mb-2 text-gray-100`}>
          <EventIcon type={event.type} />
          <span className="ml-2.5">{event.type} {event.tokenId && `(Token ID: ${event.tokenId})`}</span>
        </div>
        <div className={`grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-xs sm:text-sm text-gray-300`}>
          <p><strong>Date:</strong> {formatDate(event.timestamp)}</p>
          
          {event.from && <p><strong>From:</strong> <a href={`https://bscscan.com/address/${event.from}`} target="_blank" rel="noopener noreferrer" className="hover:underline text-sky-400">{formatAddress(event.from)}</a></p>}
          {event.to && <p><strong>To:</strong> <a href={`https://bscscan.com/address/${event.to}`} target="_blank" rel="noopener noreferrer" className="hover:underline text-sky-400">{formatAddress(event.to)}</a></p>}
          
          {event.details?.nftContract && event.details.nftContract !== "0x0000000000000000000000000000000000000000" &&
           event.type !== EventType.GENERAL_MARKETPLACE_INTERACTION &&
           event.type !== EventType.LISTING_INTENT && 
           event.type !== EventType.BID_PLACED_INTENT &&
           event.type !== EventType.PURCHASE_INTENT &&
           event.type !== EventType.CANCEL_LISTING_INTENT && (
            <p className="md:col-span-2">
              <strong>NFT:</strong> {event.details.tokenName || 'N/A'} ({event.details.tokenSymbol || 'N/A'})
              @ <a href={`https://bscscan.com/token/${event.details.nftContract}?a=${event.tokenId}`} target="_blank" rel="noopener noreferrer" className="hover:underline text-sky-400">{formatAddress(event.details.nftContract)}</a>
            </p>
          )}

          {event.functionName && (
            <p className="md:col-span-2"><strong>Function:</strong> <span className="font-mono text-xs break-all opacity-90">{event.functionName}</span></p>
          )}
          {event.value && <p><strong>Value Sent:</strong> <span className="text-amber-400">{event.value} BNB</span></p>}

          {event.type === EventType.SALE && event.price && (
            <p className="md:col-span-2 text-sm sm:text-base"> 
              <strong>Price:</strong>
              <span className="font-bold text-emerald-400 ml-1.5">{event.price.amount} {event.price.currency}</span>
            </p>
          )}
          {event.type !== EventType.SALE && event.price && ( // For other events with price if any
             <p><strong>Price:</strong> {event.price.amount} {event.price.currency}</p>
          )}
          
          {event.logInitiator && event.logInitiator !== "0x0000000000000000000000000000000000000000" && (
               <p><strong>Via Contract:</strong> <a href={`https://bscscan.com/address/${event.logInitiator}`} target="_blank" rel="noopener noreferrer" className="hover:underline text-sky-400">{formatAddress(event.logInitiator)}</a></p>
          )}
          {event.details?.inputData && (
               <p className="md:col-span-2"><strong>Input Start:</strong> <span className="font-mono text-xs opacity-80">{event.details.inputData}</span></p>
          )}
           {event.expiryTimestamp && event.type === EventType.LISTING_INTENT && (
            <p><strong>Expires:</strong> {formatDate(event.expiryTimestamp)}</p>
          )}

           <p className="md:col-span-2"><strong>Tx:</strong> <a href={`https://bscscan.com/tx/${event.transactionHash}`} target="_blank" rel="noopener noreferrer" className="hover:underline text-sky-400 break-all">{event.transactionHash}</a></p>
        </div>
      </div>
    </div>
  );
};

export default EventCard;