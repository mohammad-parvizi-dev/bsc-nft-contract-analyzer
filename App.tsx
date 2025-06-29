import React, { useState, useCallback } from 'react';
import InputForm from './components/InputForm';
import NftDisplay from './components/NftDisplay';
import LoadingSpinner from './components/LoadingSpinner';
import ErrorMessage from './components/ErrorMessage';
import { NftActivityHistory, GeneralMarketplaceActivity } from './types';
import { processNftData } from './utils/bscscanHelper';

const APP_VERSION = "2.0.4";

const App: React.FC = () => {
  const [nftActivity, setNftActivity] = useState<NftActivityHistory | null>(null);
  const [generalActivity, setGeneralActivity] = useState<GeneralMarketplaceActivity | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [analyzedContract, setAnalyzedContract] = useState<string>('');

  const handleAnalyze = useCallback(async (apiKey: string, contractAddress: string) => {
    setIsLoading(true);
    setError(null);
    setNftActivity(null);
    setGeneralActivity(null);
    setAnalyzedContract(contractAddress); // Store the analyzed address
    setLoadingMessage('Starting analysis...');
    try {
      const { nftActivity: processedNftActivity, generalActivity: processedGeneralActivity } = await processNftData(contractAddress, apiKey, setLoadingMessage);
      setNftActivity(processedNftActivity);
      setGeneralActivity(processedGeneralActivity);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-200 py-8 px-4 sm:px-6 lg:px-8">
      <header className="text-center mb-10">
        <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-blue-600">
          BSC NFT Contract Analyzer
        </h1>
        <p className="mt-2 text-lg text-gray-400">
          Explore the lifecycle of NFTs on the Binance Smart Chain, including marketplace interactions.
        </p>
      </header>
      
      <main className="max-w-4xl mx-auto">
        <InputForm onAnalyze={handleAnalyze} isLoading={isLoading} />
        {isLoading && <LoadingSpinner message={loadingMessage} />}
        {error && <ErrorMessage message={error} />}
        {(nftActivity || generalActivity) && !isLoading && (
            <NftDisplay 
                nftActivity={nftActivity || {}} 
                generalActivity={generalActivity || []} 
                analyzedContractAddress={analyzedContract}
            />
        )}
      </main>

      <footer className="text-center mt-12 py-6 border-t border-gray-700">
        <p className="text-sm text-gray-500">
          Data fetched from BSCScan API. Interpretations are based on common patterns and heuristics, and may not cover all scenarios or be fully accurate without specific contract ABI.
        </p>
        <p className="text-xs text-gray-500 mt-2">
          Version: {APP_VERSION}
        </p>
      </footer>
    </div>
  );
};

export default App;
