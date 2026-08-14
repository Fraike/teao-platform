# International Tier Preview and Image Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent international tier-pricing rows from overflowing the quotation preview and ensure international product images use the same drag-and-drop uploader as domestic quotations.

**Architecture:** Extract the tier label into a small shared formatting function that can be regression-tested without rendering React. Render each international tier across Unit Price, QTY, and Amount with a single constrained label. Keep domestic and international image behavior on the existing shared `ProductImageUploader`.

**Tech Stack:** React 19, TypeScript, Ant Design, CSS Modules, Node assert tests.

## Global Constraints

- Do not commit, push, or deploy.
- Do not duplicate domestic/international image upload logic.
- New UI styling must use CSS Modules, not inline style objects.

---

### Task 1: Constrain International Tier Preview Rows

**Files:**
- Create: `src/lib/quotationDisplay.ts`
- Create: `src/components/intl/PreviewPanelIntl.module.css`
- Modify: `src/components/intl/PreviewPanelIntl.tsx`
- Test: `test/quotation-ui-config.test.ts`

**Interfaces:**
- Produces: `formatIntlTierLabel(minQty: number, unit: string, currency: string, price: number): string`
- Consumes: product tier data and quotation currency already held by `PreviewPanelIntl`.

- [x] Add a failing assertion for the exact compact tier label.
- [x] Run the focused test and confirm failure because the formatter does not exist.
- [x] Implement the formatter and render the label in a cell with `colSpan={3}`.
- [x] Style the label through `PreviewPanelIntl.module.css` so it wraps or clips within the merged cell and cannot cross into Freight.
- [x] Run the focused test and confirm it passes.

### Task 2: Verify Shared International Drag-and-Drop Image Upload

**Files:**
- Modify if required: `src/components/ProductImageUploader.tsx`
- Modify if required: `src/components/ProductImageUploader.module.css`
- Verify: `src/components/intl/ProductCardIntl.tsx`
- Test: `test/quotation-ui-config.test.ts`

**Interfaces:**
- Consumes: `ProductImageUploader` with `image`, `onChange`, and `uploadLabel` props.
- Produces: identical click, drag/drop, preview, validation, and removal behavior for both quotation types.

- [x] Assert the shared component contract used by the international product card.
- [x] Confirm the international image column renders `ProductImageUploader` with `Click/Drop`.
- [x] Verify drag enter/drop handlers pass the first image file through the shared processing path.
- [x] Run build, lint, all tests, and `git diff --check`.
- [x] Perform browser verification of merged tier-cell boundaries and the international upload target.
