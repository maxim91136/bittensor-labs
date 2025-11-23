/*
 * Probe Bittensor runtime storages + constants with @polkadot/api.
 * Install deps: npm i @polkadot/api
 * Usage:
 *   BITTENSOR_RPC=wss://rpc.mainnet.bittensor.com node scripts/check_bittensor_sdk.js
 */

import { ApiPromise, WsProvider } from '@polkadot/api';

const RPC = process.env.BITTENSOR_RPC || 'wss://rpc.mainnet.bittensor.com';

// candidate module/storage names to probe (best effort)
const storageCandidates = [
  ['balances', 'totalIssuance'],
  ['balances', 'totalFree'],
  ['issuance', 'totalInCirculation'],
  ['tokenomics', 'totalInCirculation'],
  ['emission', 'totalInCirculation'],
  ['halving', 'thresholds'],
  ['tao', 'totalInCirculation'],
  ['system', 'totalIssuance'],
  ['balances', 'totalIssuance']
];

const constCandidates = [
  ['emission', 'blockReward'],
  ['rewards', 'blockReward'],
  ['balances', 'existentialDeposit'],
  ['staking', 'rewardAmount'],
  ['tokenomics', 'nextHalvingThreshold'],
  ['halving', 'thresholds'],
];

async function probeRpc() {
  console.log('Connecting to RPC', RPC);
  const ws = new WsProvider(RPC, 5000);
  const api = await ApiPromise.create({ provider: ws });

  const header = await api.rpc.chain.getHeader();
  console.log('Connected to chain — block number:', header.number.toNumber());

  // list runtime modules detected
  const modules = Object.keys(api.query);
  console.log('Runtime modules available:', modules.join(', '));

  // Try storages
  for (const [moduleName, storageName] of storageCandidates) {
    if (moduleName in api.query && storageName in api.query[moduleName]) {
      try {
        const val = await api.query[moduleName][storageName]();
        console.log(`Found storage ${moduleName}.${storageName}:`, val.toString());
      } catch (e) {
        console.warn(`Query ${moduleName}.${storageName} exists but failed:`, e.message);
      }
    } else {
      console.log(`Storage ${moduleName}.${storageName} not present`);
    }
  }

  // Try constants
  for (const [moduleName, constName] of constCandidates) {
    if (moduleName in api.consts && constName in api.consts[moduleName]) {
      try {
        const val = api.consts[moduleName][constName];
        console.log(`Found const ${moduleName}.${constName}:`, val.toString());
      } catch (e) {
        console.warn(`Const ${moduleName}.${constName} exists but failed:`, e.message);
      }
    } else {
      console.log(`Const ${moduleName}.${constName} not present`);
    }
  }

  // Looking for 1-2 candidate storages that match totalInCirculation
  const circCandidates = [
    ['issuance', 'totalInCirculation'],
    ['tokenomics', 'totalInCirculation'],
    ['emission', 'totalInCirculation'],
    ['balances', 'totalIssuance']
  ];
  for (const [m, s] of circCandidates) {
    if (m in api.query && s in api.query[m]) {
      const val = await api.query[m][s]();
      console.log(`circ candidate ${m}.${s}: ${val.toString()}`);
    }
  }

  // Print a list of pallets which might indicate "lock" / "vesting"
  const lockCandidates = ['staking', 'vesting', 'balances', 'treasury'];
  for (const p of lockCandidates) {
    if (p in api.query) {
      console.log(`Pallet ${p} present`);
    }
  }

  await api.disconnect();
}

(async () => {
  try {
    await probeRpc();
    console.log('RPC probe complete');
  } catch (e) {
    console.error('RPC probe failed:', e.message);
    process.exitCode = 1;
  }
})();
