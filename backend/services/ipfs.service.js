/**
 * ipfs.service.js — CrowdPulse IPFS Storage Service  (Phase 6)
 *
 * Uploads an image buffer to Pinata (IPFS pinning service) and returns
 * the content identifier (CID) plus a public gateway URL.
 *
 * Auth: Pinata JWT  →  PINATA_JWT env var
 * API:  https://api.pinata.cloud/pinning/pinFileToIPFS
 */

import axios      from 'axios';
import FormData   from 'form-data';

// ─── Constants ────────────────────────────────────────────────────────────────

const PINATA_API_URL   = 'https://api.pinata.cloud/pinning/pinFileToIPFS';
const PINATA_GATEWAY   = 'https://gateway.pinata.cloud/ipfs';
const PUBLIC_GATEWAY   = 'https://ipfs.io/ipfs';          // fallback public gateway

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getJwt() {
  const jwt = process.env.PINATA_JWT;
  if (!jwt || jwt === 'paste_your_pinata_jwt_here') {
    throw new Error('PINATA_JWT is not configured. Add it to your .env file.');
  }
  return jwt;
}

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * Upload an image buffer to Pinata / IPFS.
 *
 * @param {Buffer}  buffer       - Raw image bytes (from multer memoryStorage)
 * @param {string}  mimeType     - e.g. "image/jpeg"
 * @param {string}  filename     - Original filename (used as IPFS pin name)
 * @param {object}  [metadata]   - Optional key/value pairs stored as Pinata metadata
 *
 * @returns {Promise<{ cid: string, gatewayUrl: string, ipfsUrl: string }>}
 */
export async function uploadToIPFS(buffer, mimeType, filename, metadata = {}) {
  const jwt = getJwt();

  // Build multipart body
  const form = new FormData();

  // Append file buffer with correct MIME type and filename
  form.append('file', buffer, {
    filename:    filename || 'upload',
    contentType: mimeType,
  });

  // Pinata metadata — stored alongside the pin, queryable via Pinata dashboard
  const finalKeyvalues = {
    source:    'CrowdPulse',
    uploadedAt: new Date().toISOString(),
    ...metadata,
  };

  // If location is an object (e.g. from Phase 14C), serialize to string for Pinata keyvalues
  if (finalKeyvalues.location && typeof finalKeyvalues.location !== 'string') {
    finalKeyvalues.location = JSON.stringify(finalKeyvalues.location);
  }

  const pinataMetadata = JSON.stringify({
    name:      filename || 'CrowdPulse Upload',
    keyvalues: finalKeyvalues,
  });
  form.append('pinataMetadata', pinataMetadata);

  // Pinata options — cidVersion 1 gives a more modern base32 CID
  const pinataOptions = JSON.stringify({ cidVersion: 1 });
  form.append('pinataOptions', pinataOptions);

  // ── DEBUG: log all request parameters before sending ──────────────────────
  const jwt_loaded = jwt ? `${jwt.slice(0, 15)}…${jwt.slice(-8)} (len=${jwt.length})` : 'MISSING';
  console.log('[IPFS_DEBUG] JWT loaded:', jwt_loaded);
  console.log('[IPFS_DEBUG] filename:', filename);
  console.log('[IPFS_DEBUG] mimeType:', mimeType);
  console.log('[IPFS_DEBUG] buffer size (bytes):', buffer?.length);
  console.log('[IPFS_DEBUG] pinataMetadata raw:', pinataMetadata);
  console.log('[IPFS_DEBUG] pinataOptions raw:', pinataOptions);
  console.log('[IPFS_DEBUG] form headers:', form.getHeaders());

  // POST to Pinata
  let response;
  console.log("PINATA METADATA:", pinataMetadata);
  try {
    response = await axios.post(PINATA_API_URL, form, {
      maxBodyLength: Infinity,   // allow large files
      headers: {
        Authorization: `Bearer ${jwt}`,
        ...form.getHeaders(),
      },
      timeout: 60_000,           // 60-second timeout
    });
  } catch (axiosErr) {
    console.log('[IPFS_DEBUG] Axios error caught');
    console.log('[IPFS_DEBUG] IPFS STATUS:', axiosErr.response?.status);
    console.log('[IPFS_DEBUG] IPFS DATA:', JSON.stringify(axiosErr.response?.data, null, 2));
    console.log('[IPFS_DEBUG] IPFS HEADERS:', JSON.stringify(axiosErr.response?.headers, null, 2));
    console.log('[IPFS_DEBUG] Raw response text:', axiosErr.response?.data);
    throw axiosErr;
  }

  const cid = response.data?.IpfsHash;
  if (!cid) {
    throw new Error(`Pinata returned unexpected response: ${JSON.stringify(response.data)}`);
  }

  return {
    cid,
    gatewayUrl: `${PINATA_GATEWAY}/${cid}`,
    ipfsUrl:    `ipfs://${cid}`,
    publicUrl:  `${PUBLIC_GATEWAY}/${cid}`,
  };
}
