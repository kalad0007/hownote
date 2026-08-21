# Purchase Note MVP

> Status: implemented on `feature/purchase-note-mvp`  
> Route: `/howspec/purchase-note`

## Purpose

A Purchase Note converts known technical and trade requirements into a supplier-facing draft while keeping unresolved points visible. It is not merely a generic checklist and must eventually prioritize risk points found through Standard Compare, Product Compare and Compatibility Analysis.

## Current first release

The first release is a browser-only drafting aid. It does not send form values to a HowNote server and does not require an account or database.

It separates:

1. project, destination and intended service
2. governing product standard and edition
3. governing dimension standard and edition
4. nominal designation from actual OD and wall thickness
5. length, quantity and tolerances
6. material grade, manufacturing route and delivery condition
7. inspection, testing and certificate requirements
8. marking, packing, shipping mark and delivery terms
9. unresolved supplier confirmations
10. buyer notes

The builder automatically flags missing or unresolved fields but does not fill them with guessed technical answers.

## Pipe tool handoff

The first implementation uses the same six-row cross-checked Schedule 40 reference subset as the Pipe Weight Calculator and DN–NPS–A Converter.

The builder accepts URL parameters for the current reference size, OD, wall, length, length unit and quantity so a tool result can be carried into a Purchase Note draft without introducing a database.

## Outputs

- live structured preview
- open-item review flags
- clipboard copy
- downloadable UTF-8 text file
- print-friendly A4 layout

## Prohibited claims

The MVP must not:

- state that two standards are equivalent
- determine regulatory or certification compliance
- infer material suitability from a nominal size
- claim that a supplier can manufacture the specified product
- replace the PO, contract, governing standard, MTC/MTR or inspection agreement

## Future integration

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

A later version should pre-populate risk points only from evidence-backed comparison data, while retaining the source type and confidence of every inserted item.
