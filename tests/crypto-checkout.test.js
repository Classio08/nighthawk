import test from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeErc20Transfer, formatTokenUnits, parseChainId, switchWalletToChain, sendErc20Transfer,
} from '../src/net/crypto-checkout.js';

test('token amount formatting uses integer arithmetic and never rounds', () => {
  assert.equal(formatTokenUnits('1234567', 6), '1.234567');
  assert.equal(formatTokenUnits('1000000', 6), '1');
  assert.equal(formatTokenUnits('7', 0), '7');
  assert.throws(() => formatTokenUnits('1.2', 6));
  assert.throws(() => formatTokenUnits('1', 19));
});

test('ERC-20 transfer encoding contains only transfer(address,uint256)', () => {
  const data = encodeErc20Transfer('0x1111111111111111111111111111111111111111', '2500000');
  assert.equal(data.slice(0, 10), '0xa9059cbb');
  assert.equal(data.length, 2 + 8 + 64 + 64);
  assert.ok(data.endsWith((2500000n).toString(16).padStart(64, '0')));
  assert.throws(() => encodeErc20Transfer('not-an-address', '1'));
  assert.throws(() => encodeErc20Transfer('0x1111111111111111111111111111111111111111', '0'));
});

test('chain ids are parsed from wallet hex and invalid values rejected', () => {
  assert.equal(parseChainId('0x14a34'), 84532);
  assert.equal(parseChainId('84532'), 84532);
  assert.equal(parseChainId('0x0'), null);
  assert.equal(parseChainId('bad'), null);
});

test('wallet switches to the quoted chain, verifies the active account, then sends one exact token transfer', async () => {
  const sent = [];
  let chainId = '0x1';
  const provider = {
    async request({ method, params }) {
      sent.push({ method, params });
      if (method === 'eth_chainId') return chainId;
      if (method === 'wallet_switchEthereumChain') { chainId = params[0].chainId; return null; }
      if (method === 'eth_accounts') return ['0x2222222222222222222222222222222222222222'];
      if (method === 'eth_sendTransaction') return '0x' + 'a'.repeat(64);
      throw new Error(`unexpected method: ${method}`);
    },
  };
  const intent = {
    id: 'intent-1', walletAddress: '0x2222222222222222222222222222222222222222',
    tokenAddress: '0x3333333333333333333333333333333333333333',
    treasuryAddress: '0x4444444444444444444444444444444444444444',
    chainId: 84532, amountUnits: '1200000', expiresAt: Date.now() + 60000,
  };
  const txHash = await sendErc20Transfer(provider, intent);
  assert.equal(txHash, '0x' + 'a'.repeat(64));
  const tx = sent.find((call) => call.method === 'eth_sendTransaction').params[0];
  assert.equal(tx.to, intent.tokenAddress);
  assert.equal(tx.from, intent.walletAddress);
  assert.equal(tx.value, '0x0');
  assert.equal(tx.data.slice(0, 10), '0xa9059cbb');
  assert.equal(sent.some((call) => call.method === 'eth_sendRawTransaction'), false);
  assert.equal(sent.some((call) => call.method.toLowerCase().includes('approve')), false);
});

test('wallet account mismatch prevents transfer signing', async () => {
  const methods = [];
  const provider = {
    async request({ method }) {
      methods.push(method);
      if (method === 'eth_chainId') return '0x14a34';
      if (method === 'eth_accounts') return ['0x9999999999999999999999999999999999999999'];
      throw new Error('unexpected wallet request');
    },
  };
  await assert.rejects(() => sendErc20Transfer(provider, {
    id: 'intent-2',
    walletAddress: '0x2222222222222222222222222222222222222222',
    tokenAddress: '0x3333333333333333333333333333333333333333',
    treasuryAddress: '0x4444444444444444444444444444444444444444',
    chainId: 84532, amountUnits: '1',
  }), /active wallet account changed/);
  assert.equal(methods.includes('eth_sendTransaction'), false);
});
