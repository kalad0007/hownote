# HowNote

<!-- impeccable:product-schema 1 -->

## Platform

web

## Product Purpose

HowNote hosts existing public engineering reference tools and a private Care journal. The approved IB research extension builds a reusable question-design knowledge base: date-based research articles refer to structured subjects and preserve design, provenance, rights and review information for future AI question generation.

## Users

The owner reads IB research on desktop and mobile with a four-digit numeric PIN. The browser is always read only. Dobby writes and classifies studies through the separate publishing API/MCP credential; a reader PIN never grants writing, editing, deletion or subject-management authority.

## Capabilities and Constraints

- Preserve all existing public routes, Care articles, comments, publication tools and OAuth grants.
- IB research has an independent private storage namespace, identity configuration and publishing credential.
- The agreed structure is a chronological blog with Korean IB market, subject research, platform planning, and development/operations navigation. Multiple subject references point to one research record.
- Subject offerings and priorities in Korea await later research. Candidate subjects are not a popularity ranking.
- Distinguish independent analysis, source material and original questions. Examples are self-authored local fixtures.
- No bulk collection, paid-content download, unauthorized reproduction/translation, scheduling, sharing, production migration or deployment in this task.

## Evidence on Hand

Repository source at main revision 913ac9a47ee5acc4efb84c0c3bf28bef46321343. Existing `/care` design and SQLite Durable Object are the implementation precedent. The owner confirmed the connected Care read tool succeeds; historical disconnected-status documentation is not a current blocker.

## Product Principles

Keep provenance and rights separate from editorial review. Preserve immutable revisions. Retry a stable request without duplication. Use classification and references rather than copying research records. Treat unverified subject offerings as open research.
