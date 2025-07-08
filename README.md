# BSC NFT Contract Analyzer

## Project Description
This project is a tool for analyzing Non-Fungible Token (NFT) contracts on the Binance Smart Chain (BSC). It provides features for inspecting contract metadata, verifying compliance with standards (e.g., ERC-721), and identifying potential security vulnerabilities in smart contracts.

## Key Features
- Contract metadata inspection (name, symbol, total supply)
- Standard compliance checks (ERC-721, ERC-1155)
- Security vulnerability scanning (reentrancy, overflow/underflow)
- Interactive visualization of contract structure
- Integration with BscScan for on-chain data verification

## Technologies Used
- **Frontend:** React, TypeScript, Vite
- **Backend:** Node.js, Express (if applicable)
- **Blockchain Tools:** Web3.js, BscScan API
- **Security Analysis:** Slither (for Solidity analysis)

## Getting Started

### Prerequisites
- Node.js (v16+)
- npm or yarn

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/mohammad-parvizi-dev/bsc-nft-contract-analyzer.git
   ```
2. Install dependencies:
   ```bash
   cd bsc-nft-contract-analyzer
   npm install
   ```

### Run Locally
```bash
npm run dev
```
The application will start at `http://localhost:3000`.

## Usage
1. Enter a BSC contract address in the input field
2. Click "Analyze" to get:
   - Contract metadata summary
   - Standard compliance report
   - Security vulnerability findings
   - On-chain data verification results

## Contributing
Pull requests are welcome. For major changes, please open an issue first.

## License
[MIT](https://github.com/mohammad-parvizi-dev/bsc-nft-contract-analyzer/blob/main/LICENSE)
