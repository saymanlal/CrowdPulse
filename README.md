# CivicChain — Decentralised Civic Intelligence on SAYMAN Blockchain

> Report. Verify. Reward. On-chain.

---

## Phase 5 — Gemini Vision Integration

**Status: ✅ Completed**

Replaced keyword matching with real AI image classification.

- Image upload via `multer`
- Gemini 2.5 Flash Vision analysis
- Civic issue detection, severity + confidence scoring

**Endpoint:** `POST /api/ai/analyze`

```json
{
  "isCivicIssue": true,
  "category": "ROAD_DAMAGE",
  "severity": "HIGH",
  "confidence": 96,
  "reason": "Visible pothole detected."
}
```

---

## Phase 6 — IPFS Evidence Storage

**Status: ✅ Completed**

Permanent, tamper-proof evidence storage on IPFS via Pinata.

- Image upload pinned to IPFS
- Returns CID + gateway URL
- Evidence survives beyond the session

**Endpoint:** `POST /api/ipfs/upload`

```json
{
  "success": true,
  "cid": "bafybeig...",
  "gatewayUrl": "https://gateway.pinata.cloud/ipfs/bafybeig..."
}
```

---

## Phase 7 — Unified Processing Pipeline

**Status: ✅ Completed**

Single endpoint combines AI classification and IPFS upload in parallel.

**Flow:**
```
Image → Gemini Vision → Classification
      ↘ Pinata IPFS  → CID
              ↓
       Combined Response
```

**Endpoint:** `POST /api/report/process`

```json
{
  "success": true,
  "analysis": {
    "isCivicIssue": true,
    "category": "ROAD_DAMAGE",
    "severity": "HIGH",
    "confidence": 96,
    "reason": "Visible pothole detected."
  },
  "evidence": {
    "cid": "bafybeig...",
    "gatewayUrl": "https://gateway.pinata.cloud/ipfs/bafybeig...",
    "ipfsUrl": "ipfs://bafybeig...",
    "publicUrl": "https://ipfs.io/ipfs/bafybeig..."
  }
}
```

**Outputs fed into Phase 8 (blockchain):**
- `category`, `severity`, `confidence` → from Gemini
- `cid` → from IPFS / Pinata

---

## Setup

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# → Add GEMINI_API_KEY and PINATA_JWT

# Run backend
npm run backend

# Run frontend
npm run frontend

# Run both
npm run dev
```

---

## Architecture

```
backend/
├── services/
│   ├── ai.service.js       # Gemini 2.5 Flash Vision
│   ├── ipfs.service.js     # Pinata IPFS pinning
│   └── report.service.js   # Unified pipeline (Phase 7)
├── controllers/
│   ├── ai.controller.js
│   ├── ipfs.controller.js
│   └── report.controller.js
├── routes/
│   ├── ai.routes.js
│   ├── ipfs.routes.js
│   └── report.routes.js
└── index.js

contracts/
├── ReportRegistry.js       # SAYMAN VM smart contract
├── ReputationManager.js
└── RewardManager.js

frontend/
└── src/                    # React + Vite UI
```
