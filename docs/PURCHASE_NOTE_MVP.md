# Purchase Note MVP Boundary

This document is retained for the next feature branch and does not itself publish a Purchase Note tool.

## Purpose

A Purchase Note converts technical decisions into supplier-facing order requirements. It is not merely a generic checklist and must eventually prioritize risk points found through Standard Compare, Product Compare and Compatibility Analysis.

## Safe first release

The first browser-only template may help a user structure known order requirements, but it must be labeled as a **drafting aid**, not as an automated compatibility decision.

It should separate:

1. governing product standard and edition
2. governing dimension standard and edition
3. nominal size from actual dimensions
4. material grade and mechanical/chemical requirements
5. testing, inspection and certificate requirements
6. marking, packing and shipping requirements
7. unresolved supplier confirmations

## Prohibited claims

The MVP must not:

- state that two standards are equivalent
- determine regulatory or certification compliance
- infer material suitability from a nominal size
- claim that a supplier can manufacture the specified product
- replace the PO, contract, governing standard, MTC/MTR or inspection agreement

## Future integration

The mature flow should be:

```text
Standard Compare
  → Product Compare
  → Compatibility Analysis
  → Extracted Risk Points
  → Purchase Note
  → Supplier Confirmation
  → PO Specification
  → Inspection Checklist
```
