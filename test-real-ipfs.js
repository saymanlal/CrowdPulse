import 'dotenv/config';
import { uploadToIPFS } from './backend/services/ipfs.service.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function run() {
  const imgPath = path.join(__dirname, 'testing', 'phase5', 'pothole3.png');
  const buffer = fs.readFileSync(imgPath);
  const mimeType = 'image/png';
  const filename = 'pothole3.png';

  const locationObj = {
    address: 'Test Road',
    city: 'JABALPUR'
  };

  const metadata = {
    source: 'CrowdPulse-report',
    reportId: 'RP-TEST-12345',
    reporter: '0x1234567890123456789012345678901234567890',
    location: locationObj
  };

  console.log("Calling uploadToIPFS with location object...");
  try {
    const result = await uploadToIPFS(buffer, mimeType, filename, metadata);
    console.log("SUCCESS:", result);
  } catch (error) {
    console.log("Execution failed.");
  }
}

run();
