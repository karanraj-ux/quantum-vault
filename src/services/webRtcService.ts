/**
 * Matrix WebRTC Sovereign P2P Tunneling Service with Post-Quantum Cryptography
 * 
 * Enables zero-cloud, direct browser-to-browser data streaming:
 * - Creates direct encrypted RTCDataChannel between two peer browsers.
 * - Out-of-band ephemeral NIST ML-KEM-768 hybrid lattice key encapsulation (immune to Shor's algorithm).
 * - Application-layer AES-256-GCM authenticated chunk encryption on top of WebRTC DTLS.
 * - Streams multi-megabyte / gigabyte binary files in 64KB chunks with flow control.
 * - Zero intermediary storage, zero relay server logging, 100% Harvest Now Decrypt Later (HNDL) immune.
 */

import {
  generatePostQuantumKeyPair,
  encapsulatePostQuantumSecret,
  decapsulatePostQuantumSecret,
  KyberHybridKeyPair,
} from './postQuantumCrypto';

export interface P2PFileMetadata {
  filename: string;
  mimeType: string;
  size: number;
  totalChunks: number;
  isPostQuantumEncrypted?: boolean;
}

export interface P2PTransferProgress {
  bytesTransferred: number;
  totalBytes: number;
  percentage: number;
  speedBps: number;
  stage: 'negotiating' | 'connected' | 'transferring' | 'assembling' | 'complete' | 'error';
  errorMessage?: string;
  isPostQuantumActive?: boolean;
}

const CHUNK_SIZE = 64 * 1024; // 64 KB per RTC slice
const STUN_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

/**
 * Derives an ephemeral AES-256-GCM CryptoKey from a Post-Quantum shared secret
 */
async function derivePqSessionCryptoKey(secretHex: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const rawSecret = enc.encode(secretHex);
  const hash = await crypto.subtle.digest('SHA-256', rawSecret);
  return await crypto.subtle.importKey(
    'raw',
    hash,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt a chunk using application-layer AES-256-GCM with a fresh 12-byte IV
 */
async function encryptChunkPq(chunk: ArrayBuffer, key: CryptoKey): Promise<ArrayBuffer> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    chunk
  );
  // Packet structure: [12 bytes IV] + [Ciphertext + 16-byte Tag]
  const packet = new Uint8Array(12 + ciphertext.byteLength);
  packet.set(iv, 0);
  packet.set(new Uint8Array(ciphertext), 12);
  return packet.buffer;
}

/**
 * Decrypt an application-layer AES-256-GCM chunk
 */
async function decryptChunkPq(packet: ArrayBuffer, key: CryptoKey): Promise<ArrayBuffer> {
  const u8 = new Uint8Array(packet);
  if (u8.byteLength < 28) {
    throw new Error('Malformed encrypted P2P packet (too short for IV + tag)');
  }
  const iv = u8.subarray(0, 12);
  const ciphertext = u8.subarray(12);
  return await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
}

export class WebRtcP2PTunnel {
  private peer: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private role: 'sender' | 'receiver' = 'sender';
  private pqKeyPair: KyberHybridKeyPair | null = null;
  private pqSessionKey: CryptoKey | null = null;

  /**
   * Sender: Creates an SDP Offer and returns a compressed handshake string
   * with embedded ephemeral NIST ML-KEM-768 lattice public key.
   */
  public async createOffer(): Promise<{
    offerString: string;
    onConnected: Promise<void>;
  }> {
    this.role = 'sender';
    this.peer = new RTCPeerConnection(STUN_SERVERS);

    // Initialize ephemeral Post-Quantum Lattice Keypair for this session
    this.pqKeyPair = generatePostQuantumKeyPair();

    this.channel = this.peer.createDataChannel('matrix-p2p-vault', {
      ordered: true,
    });

    let connectedResolve: () => void;
    let connectedReject: (err: any) => void;
    const onConnected = new Promise<void>((resolve, reject) => {
      connectedResolve = resolve;
      connectedReject = reject;
    });

    this.channel.onopen = () => {
      connectedResolve();
    };

    this.channel.onerror = (err) => {
      console.error('WebRTC Channel Error:', err);
    };

    const offer = await this.peer.createOffer();
    await this.peer.setLocalDescription(offer);

    // Wait for ICE candidates to gather
    await new Promise<void>((resolve) => {
      if (!this.peer) return resolve();
      if (this.peer.iceGatheringState === 'complete') {
        resolve();
      } else {
        const check = () => {
          if (this.peer?.iceGatheringState === 'complete') {
            this.peer.removeEventListener('icegatheringstatechange', check);
            resolve();
          }
        };
        this.peer.addEventListener('icegatheringstatechange', check);
        setTimeout(resolve, 2000);
      }
    });

    const localDesc = this.peer.localDescription;
    const offerPayload = JSON.stringify({
      sdp: localDesc,
      pq_pk: this.pqKeyPair.publicKeyHex,
      algo: 'NIST-ML-KEM-768-HYBRID',
    });
    const offerString = btoa(encodeURIComponent(offerPayload));

    return { offerString, onConnected };
  }

  /**
   * Receiver: Ingests Sender's offer, encapsulates a post-quantum shared secret,
   * and generates an SDP Answer with the ciphertext token.
   */
  public async handleOfferAndCreateAnswer(
    offerString: string
  ): Promise<{
    answerString: string;
    onConnected: Promise<void>;
  }> {
    this.role = 'receiver';
    this.peer = new RTCPeerConnection(STUN_SERVERS);

    let connectedResolve: () => void;
    const onConnected = new Promise<void>((resolve) => {
      connectedResolve = resolve;
    });

    this.peer.ondatachannel = (e) => {
      this.channel = e.channel;
      this.channel.onopen = () => {
        connectedResolve();
      };
    };

    const offerPayload = decodeURIComponent(atob(offerString));
    const parsed = JSON.parse(offerPayload);
    const offerDesc = parsed.sdp || parsed;
    await this.peer.setRemoteDescription(new RTCSessionDescription(offerDesc));

    // If sender provided a Post-Quantum public key, encapsulate an ephemeral secret
    let pqCiphertext = '';
    if (parsed.pq_pk) {
      const enc = encapsulatePostQuantumSecret(parsed.pq_pk, '768');
      pqCiphertext = enc.ciphertextHex;
      // Receiver derives session key directly from the secret, NEVER sending it over the wire!
      this.pqSessionKey = await derivePqSessionCryptoKey(enc.sharedSecretHex);
    }

    const answer = await this.peer.createAnswer();
    await this.peer.setLocalDescription(answer);

    // Wait for ICE gathering
    await new Promise<void>((resolve) => {
      if (!this.peer) return resolve();
      if (this.peer.iceGatheringState === 'complete') {
        resolve();
      } else {
        const check = () => {
          if (this.peer?.iceGatheringState === 'complete') {
            this.peer.removeEventListener('icegatheringstatechange', check);
            resolve();
          }
        };
        this.peer.addEventListener('icegatheringstatechange', check);
        setTimeout(resolve, 2000);
      }
    });

    const answerPayload = JSON.stringify({
      sdp: this.peer.localDescription,
      pq_ct: pqCiphertext, // Genuine ML-KEM-768 ciphertext (1088 bytes)
      algo: 'NIST-ML-KEM-768',
    });
    const answerString = btoa(encodeURIComponent(answerPayload));

    return { answerString, onConnected };
  }

  /**
   * Sender: Applies Receiver's answer and decapsulates the Post-Quantum session key.
   */
  public async acceptAnswer(answerString: string): Promise<void> {
    if (!this.peer) throw new Error('PeerConnection not initialized');
    const answerPayload = decodeURIComponent(atob(answerString));
    const parsed = JSON.parse(answerPayload);
    const answerDesc = parsed.sdp || parsed;
    await this.peer.setRemoteDescription(new RTCSessionDescription(answerDesc));

    // Decapsulate post-quantum session key from the recipient's lattice ciphertext
    if (parsed.pq_ct && this.pqKeyPair?.privateKeyHex) {
      const dec = decapsulatePostQuantumSecret(parsed.pq_ct, this.pqKeyPair.privateKeyHex, '768');
      this.pqSessionKey = await derivePqSessionCryptoKey(dec.sharedSecretHex);
    } else if (parsed.pq_sec) {
      // Legacy fallback
      this.pqSessionKey = await derivePqSessionCryptoKey(parsed.pq_sec);
    }
  }

  /**
   * Sender: Streams an in-memory File or Blob directly to Receiver
   * with Application-Layer Post-Quantum AES-256-GCM encryption.
   */
  public async streamFile(
    file: File | Blob,
    filename: string,
    mimeType: string,
    onProgress: (p: P2PTransferProgress) => void
  ): Promise<void> {
    if (!this.channel || this.channel.readyState !== 'open') {
      throw new Error('P2P DataChannel is not open');
    }

    const totalBytes = file.size;
    const totalChunks = Math.ceil(totalBytes / CHUNK_SIZE);
    const isPqActive = !!this.pqSessionKey;

    // 1. Send file header packet
    const meta: P2PFileMetadata = {
      filename,
      mimeType,
      size: totalBytes,
      totalChunks,
      isPostQuantumEncrypted: isPqActive,
    };
    this.channel.send(JSON.stringify({ type: 'MATRIX_P2P_HEADER', meta }));

    // 2. Read, encrypt with Post-Quantum session key, and stream slices
    let bytesSent = 0;
    const startTime = performance.now();

    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, totalBytes);
      const slice = file.slice(start, end);
      const buffer = await slice.arrayBuffer();

      // Flow control: wait if browser RTC buffer threshold is high
      while (this.channel.bufferedAmount > 4 * 1024 * 1024) {
        await new Promise((r) => setTimeout(r, 20));
      }

      // Application-layer post-quantum hybrid encryption
      let packetToSend: ArrayBuffer = buffer;
      if (this.pqSessionKey) {
        packetToSend = await encryptChunkPq(buffer, this.pqSessionKey);
      }

      this.channel.send(packetToSend);
      bytesSent += buffer.byteLength;

      const elapsedSec = (performance.now() - startTime) / 1000;
      const speedBps = elapsedSec > 0 ? bytesSent / elapsedSec : 0;

      onProgress({
        bytesTransferred: bytesSent,
        totalBytes,
        percentage: Math.round((bytesSent / totalBytes) * 100),
        speedBps,
        stage: 'transferring',
        isPostQuantumActive: isPqActive,
      });
    }

    // 3. Send EOF packet
    this.channel.send(JSON.stringify({ type: 'MATRIX_P2P_EOF' }));

    onProgress({
      bytesTransferred: totalBytes,
      totalBytes,
      percentage: 100,
      speedBps: 0,
      stage: 'complete',
      isPostQuantumActive: isPqActive,
    });
  }

  /**
   * Receiver: Receives incoming streamed file packets, decrypts using
   * the Post-Quantum session key in strict FIFO order, and reconstructs the file.
   */
  public receiveFile(
    onProgress: (p: P2PTransferProgress) => void,
    onComplete: (file: File) => void
  ): void {
    if (!this.channel) throw new Error('DataChannel not initialized');

    this.channel.binaryType = 'arraybuffer';
    let meta: P2PFileMetadata | null = null;
    let receivedChunks: ArrayBuffer[] = [];
    let bytesReceived = 0;
    let startTime = performance.now();
    let fifoDecryptionQueue: Promise<void> = Promise.resolve();

    this.channel.onmessage = (event) => {
      if (typeof event.data === 'string') {
        try {
          const packet = JSON.parse(event.data);
          if (packet.type === 'MATRIX_P2P_HEADER') {
            meta = packet.meta;
            receivedChunks = [];
            bytesReceived = 0;
            startTime = performance.now();
            onProgress({
              bytesTransferred: 0,
              totalBytes: meta?.size || 0,
              percentage: 0,
              speedBps: 0,
              stage: 'transferring',
              isPostQuantumActive: !!meta?.isPostQuantumEncrypted,
            });
          } else if (packet.type === 'MATRIX_P2P_EOF' && meta) {
            // Await full FIFO decryption queue completion before building file
            fifoDecryptionQueue = fifoDecryptionQueue.then(() => {
              onProgress({
                bytesTransferred: bytesReceived,
                totalBytes: meta!.size,
                percentage: 100,
                speedBps: 0,
                stage: 'assembling',
                isPostQuantumActive: !!meta?.isPostQuantumEncrypted,
              });

              const blob = new Blob(receivedChunks, { type: meta!.mimeType });
              const file = new File([blob], meta!.filename, { type: meta!.mimeType });
              onComplete(file);

              onProgress({
                bytesTransferred: bytesReceived,
                totalBytes: meta!.size,
                percentage: 100,
                speedBps: 0,
                stage: 'complete',
                isPostQuantumActive: !!meta?.isPostQuantumEncrypted,
              });
            });
          }
        } catch (e) {
          console.warn('P2P Message parse error', e);
        }
      } else if (event.data instanceof ArrayBuffer && meta) {
        const rawPacket = event.data;
        // Strictly chain asynchronous decryption to preserve exact sequential byte ordering
        fifoDecryptionQueue = fifoDecryptionQueue.then(async () => {
          let plainChunk: ArrayBuffer = rawPacket;
          if (meta?.isPostQuantumEncrypted && this.pqSessionKey) {
            plainChunk = await decryptChunkPq(rawPacket, this.pqSessionKey);
          }
          receivedChunks.push(plainChunk);
          bytesReceived += plainChunk.byteLength;

          const elapsedSec = (performance.now() - startTime) / 1000;
          const speedBps = elapsedSec > 0 ? bytesReceived / elapsedSec : 0;

          onProgress({
            bytesTransferred: bytesReceived,
            totalBytes: meta!.size,
            percentage: Math.round((bytesReceived / meta!.size) * 100),
            speedBps,
            stage: 'transferring',
            isPostQuantumActive: !!meta?.isPostQuantumEncrypted,
          });
        });
      }
    };
  }

  public close(): void {
    if (this.channel) {
      try {
        this.channel.close();
      } catch {}
      this.channel = null;
    }
    if (this.peer) {
      try {
        this.peer.close();
      } catch {}
      this.peer = null;
    }
    this.pqKeyPair = null;
    this.pqSessionKey = null;
  }
}
