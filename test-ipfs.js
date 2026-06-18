import 'dotenv/config';
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function run() {
  const jwt = process.env.PINATA_JWT;
  console.log("1. PINATA_JWT loaded correctly:", !!jwt && jwt !== 'paste_your_pinata_jwt_here');
  console.log("   JWT Preview:", jwt ? `${jwt.slice(0, 15)}...${jwt.slice(-8)} (length: ${jwt.length})` : 'MISSING');

  const authHeader = `Bearer ${jwt}`;
  console.log("2. Authorization Header Format:", authHeader.slice(0, 25) + '...');

  // Read test image
  const imgPath = path.join(__dirname, 'testing', 'phase5', 'pothole3.png');
  console.log("3. Test image path:", imgPath);
  if (!fs.existsSync(imgPath)) {
    console.error("Test image not found!");
    return;
  }
  const buffer = fs.readFileSync(imgPath);
  console.log("   Image Buffer size (bytes):", buffer.length);

  const form = new FormData();
  form.append('file', buffer, {
    filename: 'pothole3.png',
    contentType: 'image/png'
  });

  // Structure identical to the failing code path
  const locationObj = {
    address: 'Test Road',
    city: 'JABALPUR'
  };

  const metadata = {
    source: 'CrowdPulse-report',
    reportId: 'RP-TEST-12345',
    reporter: '0x1234567890123456789012345678901234567890',
    location: locationObj // This is the nested object introduced in Phase 14C
  };

  const pinataMetadata = JSON.stringify({
    name: 'pothole3.png',
    keyvalues: {
      source: 'CrowdPulse',
      uploadedAt: new Date().toISOString(),
      ...metadata
    }
  });

  const pinataOptions = JSON.stringify({ cidVersion: 1 });

  form.append('pinataMetadata', pinataMetadata);
  form.append('pinataOptions', pinataOptions);

  console.log("4. pinataMetadata structure:", pinataMetadata);
  console.log("5. pinataOptions structure:", pinataOptions);

  const PINATA_API_URL = 'https://api.pinata.cloud/pinning/pinFileToIPFS';

  console.log("Sending POST request to Pinata...");
  try {
    const response = await axios.post(PINATA_API_URL, form, {
      maxBodyLength: Infinity,
      headers: {
        Authorization: authHeader,
        ...form.getHeaders()
      },
      timeout: 30000
    });
    console.log("SUCCESS! response data:", response.data);
  } catch (error) {
    console.log("IPFS STATUS:", error.response?.status);
    console.log("IPFS DATA:", JSON.stringify(error.response?.data, null, 2));
    console.log("IPFS HEADERS:", JSON.stringify(error.response?.headers, null, 2));
  }
}

run();
