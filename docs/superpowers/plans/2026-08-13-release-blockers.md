# Release Blockers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the identified release blockers before the TEAO platform deployment candidate is committed.

**Architecture:** Keep tier validation shared between domestic and international pages, keep quotation totals centralized in the server store, expose spreadsheet upload limits as pure tested helpers, and use native browser autocomplete semantics on login. Upgrade only dependencies with compatible fixes and retain bounded input protection for `xlsx`.

**Tech Stack:** React 19, TypeScript, Ant Design, Express, SQLite, Node assert tests.

## Global Constraints

- Do not commit, push, or deploy.
- Do not duplicate domestic and international tier validation behavior.
- Do not replace `xlsx` in this release; enforce file, row, and column limits.

---

### Task 1: Shared Tier Validation

- [x] Add regression coverage for shared validation behavior.
- [x] Create one configurable confirmation helper for both quotation pages.
- [x] Use tier-aware price validation for international PDF export.
- [x] Apply errors and trend warnings to international submit and PDF.

### Task 2: Quotation Total Calculation

- [x] Add a failing server test for international quantity zero.
- [x] Make server totals market-aware without changing domestic compatibility.
- [x] Confirm tier products remain excluded from false totals.

### Task 3: Login and Spreadsheet Hardening

- [x] Add tested 10 MB, 10,001-row, and 100-column spreadsheet limits.
- [x] Reject oversized files before parsing and oversized sheets before row mapping.
- [x] Add `username` and `current-password` browser autocomplete semantics.

### Task 4: Dependency and Release Verification

- [x] Upgrade React Router and DOMPurify to compatible patched versions.
- [x] Run build, lint, all tests, diff checks, and production dependency audit.
- [x] Re-test domestic/international quotation pages and the real assembly workbook.
