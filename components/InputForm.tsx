
import React, { useState } from 'react';

interface InputFormProps {
  onAnalyze: (apiKey: string, contractAddress: string) => void;
  isLoading: boolean;
}

const InputForm: React.FC<InputFormProps> = ({ onAnalyze, isLoading }) => {
  const [apiKey, setApiKey] = useState<string>('');
  const [contractAddress, setContractAddress] = useState<string>('0x9266d4AC40E4A5C00D38016962f21774Ae7905bA');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) {
      alert("Please enter a BSCScan API Key.");
      return;
    }
    if (!contractAddress.trim()) {
      alert("Please enter a Contract Address.");
      return;
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(contractAddress.trim())) {
      alert("Please enter a valid BSC Contract Address (e.g., 0x...).");
      return;
    }
    onAnalyze(apiKey.trim(), contractAddress.trim());
  };

  return (
    <form onSubmit={handleSubmit} className="mb-8 p-6 card rounded-lg shadow-xl space-y-4">
      <div>
        <label htmlFor="apiKey" className="block text-sm font-medium text-gray-300 mb-1">
          BSCScan API Key
        </label>
        <input
          type="password"
          id="apiKey"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          className="mt-1 block w-full px-3 py-2 input-dark border rounded-md shadow-sm focus:outline-none sm:text-sm"
          placeholder="Your BSCScan API Key"
          disabled={isLoading}
          aria-required="true"
        />
      </div>
      <div>
        <label htmlFor="contractAddress" className="block text-sm font-medium text-gray-300 mb-1">
          Contract Address to Analyze
        </label>
        <input
          type="text"
          id="contractAddress"
          value={contractAddress}
          onChange={(e) => setContractAddress(e.target.value)}
          className="mt-1 block w-full px-3 py-2 input-dark border rounded-md shadow-sm focus:outline-none sm:text-sm"
          placeholder="e.g., Marketplace or NFT Contract Address"
          disabled={isLoading}
          aria-required="true"
        />
      </div>
      <button
        type="submit"
        className="w-full btn-primary font-semibold py-2 px-4 rounded-md shadow-md hover:shadow-lg transition duration-150 ease-in-out disabled:opacity-50"
        disabled={isLoading}
      >
        {isLoading ? 'Analyzing...' : 'Analyze Contract'}
      </button>
       <p className="text-xs text-gray-400 mt-2">
        Enter a BSC contract address (e.g., a marketplace or specific NFT collection) to see related NFT transfer activity. Interpretations for sales, listings, etc., are based on heuristics. For a full analysis of complex marketplace events like bids/auctions, more specific ABI/event knowledge is often needed.
      </p>
    </form>
  );
};

export default InputForm;
