# 🛡️ Quantum Vault

> **Post-quantum secure, zero-server, multi-cloud storage for teams.** Your files are encrypted in the browser, sharded across Google Drive, OneDrive, and Dropbox — so no single provider ever holds your complete data, and no quantum computer of the future can read what it intercepts today.

**Track:** Q-HACK India 2026 — Quantum Security & Cryptography

---

## ⚠️ Disclosure of pre-existing work

Quantum Vault is built on **Matrix Workspace**, our pre-existing zero-server multi-cloud storage app (React + Vite, client-side RAID-5 sharding across cloud providers). Per the Devfolio Code of Conduct, we disclose this base openly.

**The new work built for Q-HACK** is the post-quantum security layer:
- ML-KEM-768 (NIST FIPS 203) hybrid encryption wired into the actual stored-file protection flow — key encapsulation protecting file encryption keys, with AES-256-GCM for file contents
- Per-file **Quantum Shield** status showing the quantum-resistance of each stored asset
- Quantum-safe WebRTC P2P tunnel (ML-KEM key exchange at the application layer)

**Shipped for the demo:** Quantum Security Audit view (HNDL threat modeling, per-file A/B/F risk grades from real manifests, migration guidance for legacy files) with an exportable JSON audit report. The ML-KEM/ML-DSA demo benches are kept as clearly-labeled educational tabs.

---

## 🎯 The problem: harvest now, decrypt later

Attackers don't need a quantum computer *today*. They capture encrypted data now and store it — waiting for a cryptographically relevant quantum computer to decrypt it later. Files with a 5–10 year secrecy lifetime (contracts, medical records, IP, government data) are already exposed if their key exchange relies on RSA/ECDH.

**Quantum Vault defends against this in two ways:**
1. **Quantum-resistant key protection** — file encryption keys are wrapped with ML-KEM-768, a NIST-standardized post-quantum key encapsulation mechanism. Even a future quantum adversary that captures the ciphertext cannot recover the keys.
2. **Sharded storage** — no single cloud provider holds a complete file. Shards are spread across Google Drive, OneDrive, and Dropbox with XOR parity (RAID-5 style), so a breach at one provider yields only fragments.

---

## 🔐 Security architecture

```
Your file
   │  1. AES-256-GCM encrypts the file (data key generated in-browser)
   │  2. ML-KEM-768 encapsulates the data key → only the vault keypair holder can unwrap it
   │  3. Encrypted blob is split into shards + parity (RAID-5 style erasure coding)
   ▼
┌──────────┐  ┌──────────┐  ┌──────────┐
│  Google  │  │ OneDrive │  │ Dropbox  │
│  Drive   │  │          │  │          │
└──────────┘  └──────────┘  └──────────┘
   Shard A       Shard B      Parity P
   (fragment)    (fragment)   (fragment)
```

- **Zero servers:** everything runs in the browser. No backend stores keys, files, or metadata.
- **Zero-knowledge:** encryption keys never leave the device; providers only ever see ciphertext fragments.
- **Precise claims:** we use *post-quantum cryptography* (NIST standards), not quantum key distribution or "quantum encryption". Our Shor's-algorithm demo is an educational illustration on small integers, not a break of production RSA.

---

## ✨ Features

- 📊 **Dashboard** — pooled storage, vault files, connected profiles, quantum security posture
- ☁️ **Virtual Drive** — upload/download across the sharded multi-cloud vault
- 🔒 **Quantum Shield** — per-file indicator of quantum-resistant protection status
- 🛡️ **Quantum Security Audit** — HNDL threat model, per-file A/B/F risk grades from real manifests, exportable JSON report
- 🔗 **Magic links** — share files without an account (recipient needs no login)
- 📡 **Quantum-safe P2P tunnel** — WebRTC file transfer with ML-KEM key exchange
- 🔍 **Files-only global search** across connected accounts

---

## 🚀 Quick start

```bash
npm install
npm run dev
```

Connect your Google Drive, OneDrive, and/or Dropbox accounts from **Security & Accounts**, then upload a file to the vault. Open the Quantum Security Audit to see the threat model applied to your own files.

> Bring your own Google OAuth Client ID in Settings (BYOK) for local development, or use the hosted Firebase auth.

---

## 🛠️ Tech stack

- React 19 + TypeScript + Vite
- `@noble/post-quantum` — ML-KEM-768 key encapsulation, ML-DSA signatures
- WebCrypto AES-256-GCM — file content encryption
- Firebase Authentication (Google OAuth) — identity only; no data backend
- Multi-cloud adapters: Google Drive, OneDrive (PKCE), Dropbox
- WebRTC data channels — P2P tunnel

---

## 📅 Roadmap (Round 2)

- Team vaults with per-member ML-KEM keypairs
- Automated HNDL risk monitoring on new uploads
- Formal audit report PDF export
- Migration wizard: re-wrap legacy AES keys under ML-KEM

---

*Built with ♥ for Q-HACK India 2026 — defending today's data against tomorrow's quantum computers.*
