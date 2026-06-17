/**
 * blockchain.config.js — CrowdPulse Blockchain Configuration  (Phase 8)
 *
 * Loads deployed contract addresses and RPC details from deployed.json.
 * Hot-reloads when deployed.json changes (e.g. after re-deploy).
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname      = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH  = path.join(__dirname, '..', '..', 'deployed.json');

function load() {
  try {
    const raw = fs.readFileSync(MANIFEST_PATH, 'utf8');
    const m   = JSON.parse(raw);
    return {
      rpcUrl:    m.rpcUrl    || process.env.SAYMAN_RPC || 'https://sayman.onrender.com',
      deployer:  m.deployer  || null,
      network:   m.network   || 'testnet',
      contracts: {
        ReportRegistry:    m.contracts?.ReportRegistry    || null,
        ReputationManager: m.contracts?.ReputationManager || null,
        RewardManager:     m.contracts?.RewardManager     || null,
      },
    };
  } catch (err) {
    console.warn('⚠  blockchain.config: deployed.json not found:', err.message);
    return {
      rpcUrl:    process.env.SAYMAN_RPC || 'https://sayman.onrender.com',
      deployer:  null,
      network:   'unknown',
      contracts: { ReportRegistry: null, ReputationManager: null, RewardManager: null },
    };
  }
}

// Exported config object — mutated in-place on hot-reload
export const blockchainConfig = load();

// ─── Gas constants ────────────────────────────────────────────────────────────
// SAYMAN requires a minimum gasLimit of 100 for CONTRACT_CALL transactions.
export const GAS_CONFIG = {
  CONTRACT_CALL_GAS_LIMIT: 100,
  CONTRACT_DEPLOY_GAS_LIMIT: 100,
  GAS_PRICE: 1,
};

// Hot-reload when deployed.json changes (e.g. after npm run deploy:testnet)
fs.watchFile(MANIFEST_PATH, { interval: 5000 }, () => {
  const fresh = load();
  Object.assign(blockchainConfig, fresh);
  console.log('🔗 Blockchain config reloaded:', blockchainConfig.contracts);
});
