import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const purchaseNote = readFileSync(join(root, 'src/pages/howspec/purchase-note.astro'), 'utf8');
const handoff = readFileSync(join(root, 'src/components/PurchaseNoteHandoff.astro'), 'utf8');
const failures = [];

const requireText = (source, text, message) => {
  if (!source.includes(text)) failures.push(message);
};
const rejectText = (source, text, message) => {
  if (source.includes(text)) failures.push(message);
};

requireText(purchaseNote, 'clearReferenceFields', 'Custom-size handoffs must clear inherited reference fields.');
requireText(purchaseNote, "if (requestedSize === 'custom')", 'Custom URL state handling is missing.');
requireText(purchaseNote, '2 * wallValue >= odValue', 'Purchase Note geometry must reject 2 × wall ≥ OD.');
requireText(purchaseNote, 'Generated (local date)', 'Exported notes must identify the generated value as a local date.');
requireText(purchaseNote, 'data-supplier-notes', 'Supplier-visible notes field is missing.');
rejectText(purchaseNote, 'data-notes', 'Internal buyer notes must not be included in supplier exports.');
rejectText(purchaseNote, 'BUYER NOTES', 'Supplier exports must not include an internal buyer-notes section.');

for (const requiredFlag of [
  'Manufacturing route is unresolved.',
  'Heat treatment / delivery condition is unresolved.',
  'Surface treatment / coating requirement is unresolved.',
  'Length tolerance is unresolved.',
  'Shipping mark requirement is unresolved.',
  'Delivery term / destination is unresolved.',
  'Other required documents are unresolved.',
]) {
  requireText(purchaseNote, requiredFlag, `Missing unresolved-state flag: ${requiredFlag}`);
}

requireText(handoff, "link.setAttribute('aria-disabled', 'true')", 'Invalid calculator handoffs must be marked disabled.');
requireText(handoff, 'orderValuesValid', 'Calculator handoff must validate length and quantity.');
requireText(handoff, "geometryMode.value === 'id'", 'Calculator handoff must inspect the active geometry mode.');
requireText(handoff, "idInput.value.trim() === ''", 'Calculator handoff must validate the active inside-diameter input.');
requireText(handoff, 'insideMm = odMm - 2 * wallMm', 'Wall mode must derive and validate inside diameter.');
requireText(handoff, '2 * wallMm < odMm', 'Calculator handoff must validate pipe geometry.');
requireText(handoff, "link.removeAttribute('href')", 'Invalid calculator handoffs must not retain a URL.');

if (failures.length) {
  console.error('\nPurchase Note safety verification failed:\n');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Purchase Note safety verification passed.');
