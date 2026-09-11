import { createHash } from 'node:crypto';

export class MandateValidationError extends Error {
  constructor(issues) {
    super(`Invalid mandate: ${issues.map((issue) => issue.code).join(', ')}`);
    this.name = 'MandateValidationError';
    this.issues = issues;
  }
}

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

function isAddress(value) {
  return typeof value === 'string' && ADDRESS_PATTERN.test(value) && !/^0x0{40}$/i.test(value);
}

export function validateSwapMandate(mandate, { now = Math.floor(Date.now() / 1000) } = {}) {
  const issues = [];

  if (mandate?.version !== 1) issues.push({ code: 'UNSUPPORTED_VERSION', field: 'version' });
  if (mandate?.type !== 'SWAP') issues.push({ code: 'UNSUPPORTED_OPERATION', field: 'type' });
  if (!isAddress(mandate?.assetIn)) issues.push({ code: 'INVALID_ASSET_IN', field: 'assetIn' });
  if (!isAddress(mandate?.assetOut)) issues.push({ code: 'INVALID_ASSET_OUT', field: 'assetOut' });
  if (!isAddress(mandate?.recipient)) issues.push({ code: 'INVALID_RECIPIENT', field: 'recipient' });
  if (typeof mandate?.maxSpend !== 'bigint' || mandate.maxSpend <= 0n) {
    issues.push({ code: 'INVALID_MAX_SPEND', field: 'maxSpend' });
  }
  if (typeof mandate?.minOutput !== 'bigint' || mandate.minOutput <= 0n) {
    issues.push({ code: 'INVALID_MIN_OUTPUT', field: 'minOutput' });
  }
  if (!Number.isInteger(mandate?.deadline) || mandate.deadline < now + 15) {
    issues.push({ code: 'INVALID_DEADLINE', field: 'deadline' });
  } else if (mandate.deadline > now + 86_400) {
    issues.push({ code: 'DEADLINE_TOO_FAR', field: 'deadline' });
  }
  if (
    isAddress(mandate?.assetIn) &&
    isAddress(mandate?.assetOut) &&
    mandate.assetIn.toLowerCase() === mandate.assetOut.toLowerCase()
  ) {
    issues.push({ code: 'IDENTICAL_ASSETS', field: 'assetOut' });
  }

  return Object.freeze({ valid: issues.length === 0, issues: Object.freeze(issues) });
}

function canonicalValue(value) {
  if (typeof value === 'bigint') return value.toString(10);
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((key) => value[key] !== undefined)
        .map((key) => [key, canonicalValue(value[key])]),
    );
  }
  return value;
}

export function canonicalizeMandate(mandate) {
  return JSON.stringify(canonicalValue(mandate));
}

export function hashMandate(mandate) {
  return `0x${createHash('sha256').update(canonicalizeMandate(mandate)).digest('hex')}`;
}

export function compileSwapMandate(input, options) {
  const mandate = Object.freeze({
    version: 1,
    type: 'SWAP',
    assetIn: input.assetIn,
    assetOut: input.assetOut,
    maxSpend: input.maxSpend,
    minOutput: input.minOutput,
    recipient: input.recipient,
    deadline: input.deadline,
  });
  const validation = validateSwapMandate(mandate, options);
  if (!validation.valid) throw new MandateValidationError(validation.issues);

  return Object.freeze({ mandate, mandateHash: hashMandate(mandate) });
}

