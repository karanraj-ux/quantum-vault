import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mail, ArrowRight } from 'lucide-react';
import {
  FileText,
  Loader2,
  Download,
  UploadCloud,
  Layers,
  Database,
  CheckCircle2,
  Trash2,
  RefreshCw,
  HardDrive,
  Shield,
  ShieldCheck,
  Zap,
  Info,
  X,
  Lock,
  LifeBuoy,
  KeyRound,
  Share2,
  Copy,
  Check,
  Cloud,
  ArrowDownCircle,
  ExternalLink,
  MoreVertical,
  Globe,
  Radio,
  FolderSync,
  FolderCheck,
  Scale,
  Cpu,
} from 'lucide-react';
import { get, set } from 'idb-keyval';
import { DriveFile, AccountToken, StorageQuotaInfo } from '../types';
import { ShardManifest, uploadShardedFile, saveManifestToDrive, downloadShardedFile, downloadShardedFileStream, deleteShardedFile, verifyShardIntegrity, createMagicShareLink, decodeMagicShareLink, makeManifestChunksPublic, revokeManifestChunksPublic } from '../services/shardingService';
import { getOrGenerateMasterKey, MASTER_KEY_STORAGE_ID } from '../services/cryptoWorkerClient';
import { fetchAccountQuota } from '../services/multiCloudAdapter';
import { StandardUploadPickerModal } from '../components/StandardUploadPickerModal';
import { StandardShareModal } from '../components/StandardShareModal';
import { MultiShareModal, MultiShareItem } from '../components/MultiShareModal';
import { StandardMultiUploadPickerModal } from '../components/StandardMultiUploadPickerModal';
import { MobileActionSheet, MobileActionSheetItem } from '../components/MobileActionSheet';
import { QRCodeCard } from '../components/QRCodeCard';
import { P2PTunnelModal } from '../components/P2PTunnelModal';
import { QuantumAuditModal } from '../components/QuantumAuditModal';

interface DriveViewProps {
  customClientId?: string;
  accounts: AccountToken[];
  activeAccountIds: Set<string>;
  isLoadingStreams: boolean;
  filteredFiles: DriveFile[];
  setTransferFile: (file: DriveFile) => void;
}

interface StoredManifestRecord {
  id: string;
  manifestFileId?: string;
  manifest: ShardManifest;
  sourceAccountEmail: string;
}

export const DriveView: React.FC<DriveViewProps> = (props) => {
  const {
    customClientId,
  accounts,
  activeAccountIds,
  isLoadingStreams,
  filteredFiles,
  setTransferFile
  } = props;
  const [activeTab, setActiveTab] = useState<'frankenstein' | 'all'>('frankenstein');
  const [shardedRecords, setShardedRecords] = useState<StoredManifestRecord[]>([]);

  // Upload States
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadMode, setUploadMode] = useState<'vault' | 'standard'>('vault');
  const [uploadStage, setUploadStage] = useState('');
  const [uploadChunkStats, setUploadChunkStats] = useState<{ current: number; total: number }>({
    current: 0,
    total: 0,
  });

  // Settings for Sharding
  const [enableEncryption, setEnableEncryption] = useState(true);
  const [enableParity, setEnableParity] = useState(true);

  // Status & Notifications
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  // Download & Reassembly States
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadStage, setDownloadStage] = useState('');

  // Integrity Checking
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [integrityResults, setIntegrityResults] = useState<{
    [id: string]: { healthy: boolean; canRecover: boolean; missingChunks: number; parityHealthy: boolean };
  }>({});

  // Master Key Inspector Modal
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [currentMasterKey, setCurrentMasterKey] = useState<string>('');
  const [copiedKey, setCopiedKey] = useState(false);

  // Magic Link Modal
  const [magicLinkModal, setMagicLinkModal] = useState<{ isOpen: boolean; url: string; filename: string }>({
    isOpen: false,
    url: '',
    filename: '',
  });
  const [copiedMagicLink, setCopiedMagicLink] = useState(false);

  // Magic Link Receiver / Import
  const [importMagicInput, setImportMagicInput] = useState('');
  const [isImportingMagic, setIsImportingMagic] = useState(false);

  // Live Storage Quotas per Account
  const [accountQuotas, setAccountQuotas] = useState<Record<string, StorageQuotaInfo>>({});
  const [isLoadingQuotas, setIsLoadingQuotas] = useState(false);

  // Drag-and-drop state
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // Standard Upload Destination Account Picker
  const [standardPickerOpen, setStandardPickerOpen] = useState(false);
  const [pendingUploadFile, setPendingUploadFile] = useState<File | null>(null);

  // Active Standard File Dropdown Menu
  const [activeFileMenuId, setActiveFileMenuId] = useState<string | null>(null);

  // Active Vault Shard Dropdown Menu
  const [activeVaultMenuId, setActiveVaultMenuId] = useState<string | null>(null);

  // Mobile Slide-Up Action Sheet State
  const [mobileSheet, setMobileSheet] = useState<{
    isOpen: boolean;
    title: string;
    subtitle?: string;
    items: MobileActionSheetItem[];
  }>({
    isOpen: false,
    title: '',
    items: [],
  });

  // Multi-Selection State for Bulk Actions & Sharing
  const [selectedVaultFileIds, setSelectedVaultFileIds] = useState<Set<string>>(new Set());
  const [selectedRawFileIds, setSelectedRawFileIds] = useState<Set<string>>(new Set());

  // Multi-Share Modal State
  const [multiShareModal, setMultiShareModal] = useState<{
    isOpen: boolean;
    title: string;
    items: MultiShareItem[];
  }>({
    isOpen: false,
    title: '',
    items: [],
  });

  // Standard Multi-Upload Destination Picker State
  const [multiUploadPickerOpen, setMultiUploadPickerOpen] = useState(false);
  const [pendingUploadFiles, setPendingUploadFiles] = useState<File[]>([]);

  // Standard Upload Instant Share Modal
  const [standardShareModal, setStandardShareModal] = useState<{
    isOpen: boolean;
    url: string;
    filename: string;
    accountEmail: string;
    title?: string;
  }>({
    isOpen: false,
    url: '',
    filename: '',
    accountEmail: '',
    title: 'Public Link & QR Code',
  });

  // WebRTC P2P Direct Tunnel State
  const [p2pModalOpen, setP2pModalOpen] = useState(false);
  const [p2pFile, setP2pFile] = useState<{ file?: File | Blob; filename?: string } | null>(null);

  // Quantum Threat Simulator & Lab State
  const [quantumLabOpen, setQuantumLabOpen] = useState(false);
  const [quantumTargetFile, setQuantumTargetFile] = useState<string>('Confidential_Report.pdf');

  const handleP2PStreamVaultFile = async (record: StoredManifestRecord) => {
    try {
      setDownloadingId(record.id);
      setDownloadProgress(0);
      setDownloadStage(`Reassembling "${record.manifest.filename}" for P2P stream...`);

      const blob = await downloadShardedFile(
        record.manifest,
        accounts,
        (p, cur, tot, stage) => {
          setDownloadProgress(p);
          if (stage) setDownloadStage(stage);
        },
        record.manifest.magicKey
      );

      const file = new File([blob], record.manifest.filename, { type: record.manifest.mimeType });
      setP2pFile({ file, filename: record.manifest.filename });
      setP2pModalOpen(true);
    } catch (e: any) {
      setStatusMessage({ type: 'error', text: `Could not prepare file for P2P streaming: ${e.message}` });
    } finally {
      setDownloadingId(null);
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeAccounts = accounts.filter(a => activeAccountIds.has(a.id) && !a.isExpired);

  // Load existing manifests from IndexedDB
  useEffect(() => {
    get('matrix_frankenstein_shards').then(val => {
      if (val && Array.isArray(val)) {
        setShardedRecords(val);
      } else {
        setShardedRecords([]);
      }
    });

    const handleTestUpload = (e: any) => {
      if (e.detail?.file) {
        handleBatchUploadFiles([e.detail.file]);
      }
    };
    window.addEventListener('MATRIX_START_TEST_UPLOAD', handleTestUpload);
    return () => window.removeEventListener('MATRIX_START_TEST_UPLOAD', handleTestUpload);
  }, []);

  // Fetch live storage quotas
  const refreshStorageQuotas = async () => {
    if (activeAccounts.length === 0) return;
    setIsLoadingQuotas(true);
    try {
      const quotaEntries = await Promise.all(
        activeAccounts.map(async acc => {
          const quota = await fetchAccountQuota(acc);
          return [acc.id, quota] as const;
        })
      );
      setAccountQuotas(Object.fromEntries(quotaEntries));
    } catch (e) {
      console.warn('Failed to load storage quotas', e);
    } finally {
      setIsLoadingQuotas(false);
    }
  };

  useEffect(() => {
    refreshStorageQuotas();
  }, [accounts, activeAccountIds]);

    // Handle URL Hash Magic Link if present on page load
  useEffect(() => {
    if (typeof window !== "undefined" && (window.location.hash.includes("magic=") || window.location.hash.includes("m="))) {
      const decoded = decodeMagicShareLink(window.location.hash);
      if (decoded) {
        // Automatically import it
        setImportMagicInput("");
        const newRecord = {
          id: Math.random().toString(36).substring(2, 9),
          manifest: decoded,
          sourceAccountEmail: "Imported via Magic Link",
        };
        
        // We have to wait for shardedRecords to be loaded, but in useEffect, 
        // using the functional state update is safer:
        setShardedRecords((prev) => {
           const exists = prev.some(r => r.manifest.filename === decoded.filename && r.manifest.totalSize === decoded.totalSize);
           if (exists) return prev; // Avoid duplicates on reload
           const updated = [newRecord, ...prev];
           set("matrix_frankenstein_shards", updated);
           return updated;
        });

        setStatusMessage({
          type: "success",
          text: `Automatically imported Magic Link for "${decoded.filename}". It is now in your Distributed Drive ready for download.`,
        });
        window.history.replaceState(null, "", window.location.pathname);
      }
    }
  }, []);

  // Standard upload execution for a single file or multiple files
  const executeStandardUpload = async (file: File, destinationAccountId: string): Promise<string> => {
    const account = accounts.find(a => a.id === destinationAccountId);
    if (!account) throw new Error('Selected destination account not found or expired');

    const { uploadFileToDriveResumable } = await import('../services/googleService');
    const uploadedFile = await uploadFileToDriveResumable(account.accessToken, file, (prog) => {
      setUploadProgress(prog);
    });

    const shareUrl = uploadedFile?.webViewLink || (uploadedFile?.id ? `https://drive.google.com/file/d/${uploadedFile.id}/view` : '');
    return shareUrl;
  };

  // Upload Multiple Files (Standard or Sharded Vault)
  const handleBatchUploadFiles = async (files: File[]) => {
    if (!files || files.length === 0) return;

    if (activeAccounts.length === 0) {
      setStatusMessage({
        type: 'error',
        text: 'Cannot upload files: No active accounts selected. Enable at least 1 account.',
      });
      return;
    }

    // If single file, pass through
    if (files.length === 1) {
      handleUploadFile(files[0]);
      return;
    }

    // MULTI-FILE STANDARD MODE
    if (uploadMode === 'standard') {
      if (activeAccounts.length > 1) {
        setPendingUploadFiles(files);
        setMultiUploadPickerOpen(true);
        return;
      } else {
        await executeStandardBatchUpload(files, 'single', activeAccounts[0].id);
        return;
      }
    }

    // MULTI-FILE VAULT (RAID-5) MODE
    try {
      setIsUploading(true);
      setUploadProgress(0);
      setStatusMessage(null);

      const uploadedShareItems: MultiShareItem[] = [];
      let latestRecords = [...shardedRecords];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadStage(`Vault Sharding (${i + 1}/${files.length}): "${file.name}"...`);
        setUploadProgress(0);

        const manifest = await uploadShardedFile(file, activeAccounts, {
          enableEncryption,
          enableParity,
          enableQuantumShield: true, // ML-KEM-768 wraps each file's data key
          onProgress: (progress, cur, tot, stage) => {
            setUploadProgress(progress);
            setUploadChunkStats({ current: cur, total: tot });
            if (stage) setUploadStage(`[${i + 1}/${files.length}] ${stage}`);
          },
        });

        // Save manifest file to primary active Google Drive account if available
        const primaryGoogle = activeAccounts.find(a => a.provider === 'google' || !a.provider) || activeAccounts[0];
        let manifestDriveId: string | undefined = undefined;

        try {
          if (primaryGoogle.provider === 'google' || !primaryGoogle.provider) {
            manifestDriveId = await saveManifestToDrive(manifest, primaryGoogle);
          }
        } catch (manifestErr) {
          console.warn('Could not mirror manifest to Google Drive, saved to local IndexDB only:', manifestErr);
        }

        const newRecord: StoredManifestRecord = {
          id: manifestDriveId || Math.random().toString(36).substring(2, 9),
          manifestFileId: manifestDriveId,
          manifest,
          sourceAccountEmail: primaryGoogle.email || 'Multi-Cloud Array',
        };

        latestRecords = [newRecord, ...latestRecords];
        setShardedRecords(latestRecords);
        await set('matrix_frankenstein_shards', latestRecords);

        // Generate magic link for this vaulted file
        const magicLink = await createMagicShareLink(manifest, customClientId);
        uploadedShareItems.push({
          id: newRecord.id,
          name: file.name,
          url: magicLink,
          accountEmail: primaryGoogle.email,
          isVault: true,
        });
      }

      setStatusMessage({
        type: 'success',
        text: `Successfully sharded all ${files.length} files across multi-cloud drives!`,
      });

      refreshStorageQuotas();

      if (uploadedShareItems.length > 0) {
        setMultiShareModal({
          isOpen: true,
          title: `Vault Sharded Files (${uploadedShareItems.length} Links Ready)`,
          items: uploadedShareItems,
        });
      }
    } catch (err: any) {
      console.error('Batch Vault sharding failed:', err);
      setStatusMessage({ type: 'error', text: `Multi-upload failed: ${err.message}` });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      setUploadStage('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Batch Standard Upload Execution
  const executeStandardBatchUpload = async (
    files: File[],
    allocation: 'single' | 'round-robin',
    selectedAccountId?: string
  ) => {
    try {
      setIsUploading(true);
      setUploadProgress(0);
      setStatusMessage(null);

      const uploadedShareItems: MultiShareItem[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const targetAccountId =
          allocation === 'round-robin'
            ? activeAccounts[i % activeAccounts.length].id
            : selectedAccountId || activeAccounts[0].id;

        const targetAccount = accounts.find(a => a.id === targetAccountId);
        setUploadStage(`Standard Upload (${i + 1}/${files.length}): "${file.name}" to ${targetAccount?.email || 'drive'}...`);
        setUploadProgress(0);

        const shareUrl = await executeStandardUpload(file, targetAccountId);

        if (shareUrl) {
          uploadedShareItems.push({
            id: Math.random().toString(36).substring(2, 9),
            name: file.name,
            url: shareUrl,
            accountEmail: targetAccount?.email,
            isVault: false,
          });
        }
      }

      setUploadStage('Complete!');
      setUploadProgress(100);

      setStatusMessage({
        type: 'success',
        text: `Successfully uploaded ${files.length} files to Google Drive!`,
      });

      if (uploadedShareItems.length > 0) {
        setMultiShareModal({
          isOpen: true,
          title: `Standard Upload Complete (${uploadedShareItems.length} Files)`,
          items: uploadedShareItems,
        });
      }

      setTimeout(() => {
        setIsUploading(false);
        setUploadProgress(0);
      }, 1200);
    } catch (e: any) {
      setStatusMessage({ type: 'error', text: e.message || 'Standard batch upload failed' });
      setIsUploading(false);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Single Upload File (Standard or Sharded Vault)
  const handleUploadFile = async (file: File) => {
    if (!file) return;

    if (activeAccounts.length === 0) {
      setStatusMessage({
        type: 'error',
        text: 'Cannot upload file: No active accounts selected. Enable at least 1 account.',
      });
      return;
    }

    // If Standard Mode: let user explicitly choose which account if multiple, or auto-use if only 1
    if (uploadMode === 'standard') {
      if (activeAccounts.length > 1) {
        setPendingUploadFile(file);
        setStandardPickerOpen(true);
        return;
      } else {
        try {
          setIsUploading(true);
          setUploadProgress(0);
          setUploadStage(`Uploading "${file.name}" to ${activeAccounts[0].email}...`);
          setStatusMessage(null);
          const shareUrl = await executeStandardUpload(file, activeAccounts[0].id);
          setUploadStage('Complete!');
          setUploadProgress(100);
          setStatusMessage({
            type: 'success',
            text: `Successfully uploaded "${file.name}" to ${activeAccounts[0].email}`,
          });
          if (shareUrl) {
            setStandardShareModal({
              isOpen: true,
              url: shareUrl,
              filename: file.name,
              accountEmail: activeAccounts[0].email,
            });
          }
          setTimeout(() => {
            setIsUploading(false);
            setUploadProgress(0);
          }, 1200);
        } catch (e: any) {
          setStatusMessage({ type: 'error', text: e.message || 'Standard upload failed' });
          setIsUploading(false);
        }
        return;
      }
    }

    try {
      setIsUploading(true);
      setUploadProgress(0);
      setUploadStage('Initializing distributed multi-cloud worker...');
      setStatusMessage(null);

      const manifest = await uploadShardedFile(file, activeAccounts, {
        enableEncryption,
        enableParity,
        enableQuantumShield: true, // ML-KEM-768 wraps each file's data key
        onProgress: (progress, cur, tot, stage) => {
          setUploadProgress(progress);
          setUploadChunkStats({ current: cur, total: tot });
          if (stage) setUploadStage(stage);
        },
      });

      // Save manifest file to primary active Google Drive account if available
      const primaryGoogle = activeAccounts.find(a => a.provider === 'google' || !a.provider) || activeAccounts[0];
      let manifestDriveId: string | undefined = undefined;

      try {
        if (primaryGoogle.provider === 'google' || !primaryGoogle.provider) {
          manifestDriveId = await saveManifestToDrive(manifest, primaryGoogle);
        }
      } catch (manifestErr) {
        console.warn('Could not mirror manifest to Google Drive, saved to local IndexDB only:', manifestErr);
      }

      const newRecord: StoredManifestRecord = {
        id: manifestDriveId || Math.random().toString(36).substring(2, 9),
        manifestFileId: manifestDriveId,
        manifest,
        sourceAccountEmail: primaryGoogle.email || 'Multi-Cloud Array',
      };

      const updated = [newRecord, ...shardedRecords];
      setShardedRecords(updated);
      await set('matrix_frankenstein_shards', updated);

      setStatusMessage({
        type: 'success',
        text: `Successfully sharded "${file.name}" (${(file.size / (1024 * 1024)).toFixed(
          2
        )} MB) across ${activeAccounts.length} multi-cloud drives with dynamic load balancing, ${
          manifest.isEncrypted ? 'AES-256-GCM zero-knowledge encryption' : 'raw chunks'
        } and ${manifest.parityChunk ? 'RAID-5 fault tolerance' : 'no parity'}!`,
      });

      refreshStorageQuotas();
    } catch (err: any) {
      console.error('Sharding failed:', err);
      setStatusMessage({ type: 'error', text: `Upload failed: ${err.message}` });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      setUploadStage('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Reassemble & Download
  const handleReassembleDownload = async (record: StoredManifestRecord, explicitKey?: string) => {
    try {
      setDownloadingId(record.id);
      setDownloadProgress(0);
      setDownloadStage('Starting parallel multi-cloud retrieval...');
      setStatusMessage(null);


      // Try streaming directly to disk to save RAM when all chunks are healthy
      if ('showSaveFilePicker' in window) {
        try {
          const streamed = await downloadShardedFileStream(
            record.manifest,
            accounts,
            (p, cur, tot, stage) => {
              setDownloadProgress(p);
              if (stage) setDownloadStage(stage);
            },
            explicitKey || record.manifest.magicKey
          );
          if (streamed) {
             setDownloadingId(null);
             setStatusMessage({ type: 'success', text: 'File downloaded directly to disk.' });
             return;
          }
        } catch (streamErr: any) {
          if (streamErr?.name === 'AbortError') {
            setDownloadingId(null);
            return; // User intentionally cancelled the file picker
          }
          console.warn('Streamed disk write failed or chunk missing, engaging parallel fault-tolerant reassembly:', streamErr);
          setDownloadStage('Fault detected in storage. Activating parallel RAID-5 parity reconstruction...');
        }
      }

      // Fallback for browsers without Stream API
      const blob = await downloadShardedFile(

        record.manifest,
        accounts,
        (p, cur, tot, stage) => {
          setDownloadProgress(p);
          if (stage) setDownloadStage(stage);
        },
        explicitKey || record.manifest.magicKey
      );

      // Trigger browser file download
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = record.manifest.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);

      setStatusMessage({
        type: 'success',
        text: `Successfully reassembled, decrypted, and downloaded "${record.manifest.filename}".`,
      });
    } catch (e: any) {
      console.error('Download error:', e);
      setStatusMessage({ type: 'error', text: `Download failed: ${e.message}` });
    } finally {
      setDownloadingId(null);
      setDownloadProgress(0);
      setDownloadStage('');
    }
  };

  // Integrity Check
  const handleIntegrityCheck = async (record: StoredManifestRecord) => {
    setVerifyingId(record.id);
    try {
      const res = await verifyShardIntegrity(record.manifest, accounts);
      setIntegrityResults(prev => ({
        ...prev,
        [record.id]: {
          healthy: res.healthy,
          canRecover: res.canRecover,
          missingChunks: res.missingChunks,
          parityHealthy: res.parityHealthy,
        },
      }));
    } catch (err: any) {
      console.error('Integrity verification failed:', err);
    } finally {
      setVerifyingId(null);
    }
  };

  // Delete Sharded File
  const handleDeleteShardedFile = async (record: StoredManifestRecord) => {
    if (
      !window.confirm(
        `Are you sure you want to completely purge "${record.manifest.filename}"? All chunks across all cloud providers will be permanently deleted.`
      )
    ) {
      return;
    }

    try {
      setStatusMessage({ type: 'info', text: `Purging chunks for "${record.manifest.filename}" across all drives...` });
      await deleteShardedFile(record.manifest, record.manifestFileId || '', accounts);

      const updated = shardedRecords.filter(r => r.id !== record.id);
      setShardedRecords(updated);
      await set('matrix_frankenstein_shards', updated);

      setStatusMessage({
        type: 'success',
        text: `File "${record.manifest.filename}" and its multi-cloud shards were permanently deleted.`,
      });
      refreshStorageQuotas();
    } catch (e: any) {
      console.error('Delete error:', e);
      setStatusMessage({ type: 'error', text: `Failed to delete file shards: ${e.message}` });
    }
  };

  // Generate Magic Share Link

  const handleRevokeMagicLink = async (record: StoredManifestRecord) => {
    setStatusMessage({ type: 'info', text: 'Revoking public permissions...' });
    try {
      await revokeManifestChunksPublic(record.manifest, accounts);
      setStatusMessage({ type: 'success', text: 'Magic Link revoked successfully.' });
    } catch (e) {
      console.warn('Could not revoke all chunks', e);
      setStatusMessage({ type: 'error', text: 'Failed to revoke permissions.' });
    }
  };


  const handleGenerateMagicLink = async (record: StoredManifestRecord) => {
    // Pass customClientId so peer doesn't need to BYOK
    const cId = (props as any).customClientId || '';
    try {
      const link = await createMagicShareLink(record.manifest, cId);
      setMagicLinkModal({
        isOpen: true,
        url: link,
        filename: record.manifest.filename,
      });
      setCopiedMagicLink(false);
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: `Could not generate Device-Sync Link: ${err.message}` });
    }
  };

  // Handle Manual Magic Link Import
  const handleImportMagicLink = () => {
    const trimmed = importMagicInput.trim();
    if (!trimmed) return;
    const decoded = decodeMagicShareLink(trimmed);
    if (!decoded) {
      setStatusMessage({ type: 'error', text: 'Invalid Magic Link. Please verify the URL hash format.' });
      return;
    }

    const newRecord: StoredManifestRecord = {
      id: Math.random().toString(36).substring(2, 9),
      manifest: decoded,
      sourceAccountEmail: 'Imported via Magic Link',
    };

    const updated = [newRecord, ...shardedRecords];
    setShardedRecords(updated);
    set('matrix_frankenstein_shards', updated);
    setImportMagicInput('');
    setStatusMessage({
      type: 'success',
      text: `Successfully imported "${decoded.filename}". You can now Reassemble & Download it!`,
    });
  };

  // Total Quota Computations
  const quotaList = Object.values(accountQuotas) as StorageQuotaInfo[];
  const totalPooledCapacity: number = quotaList.reduce((acc: number, q: StorageQuotaInfo) => acc + (q.totalBytes || 0), 0);
  const totalUsedCapacity: number = quotaList.reduce((acc: number, q: StorageQuotaInfo) => acc + (q.usedBytes || 0), 0);
  const totalFreeCapacity: number = Math.max(0, totalPooledCapacity - totalUsedCapacity);
  const usedPercentage: number =
    totalPooledCapacity > 0 ? Math.min(100, Math.round((totalUsedCapacity / totalPooledCapacity) * 100)) : 0;

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div
      className="h-full flex flex-col bg-[#F8FAFC] overflow-y-auto"
      onDragOver={e => {
        e.preventDefault();
        setIsDraggingOver(true);
      }}
      onDragLeave={() => setIsDraggingOver(false)}
      onDrop={e => {
        e.preventDefault();
        setIsDraggingOver(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          const droppedFiles: File[] = Array.from(e.dataTransfer.files);
          if (droppedFiles.length === 1) {
            handleUploadFile(droppedFiles[0]);
          } else {
            handleBatchUploadFiles(droppedFiles);
          }
        }
      }}
    >
      {/* DRAG-AND-DROP OVERLAY */}
      {isDraggingOver && (
        <div className="fixed inset-0 z-50 bg-blue-900/60 backdrop-blur-xs flex items-center justify-center pointer-events-none p-6">
          <div className="bg-white rounded-3xl p-10 max-w-md w-full text-center shadow-2xl border-4 border-dashed border-blue-500 animate-pulse">
            <UploadCloud className="w-16 h-16 text-blue-600 mx-auto mb-4" />
            <h3 className="text-xl font-black text-slate-900">Drop Any File to Shard</h3>
            <p className="text-xs text-slate-500 mt-2">
              The engine will automatically slice, encrypt (AES-256-GCM), compute RAID-5 parity, and stripe across your
              connected Google Drive, OneDrive, and Dropbox accounts!
            </p>
          </div>
        </div>
      )}

      {/* TOP HEADER */}
      <div className="bg-white border-b border-slate-200/90 px-6 py-5 shrink-0">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center shrink-0">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-slate-900 tracking-tight">
                  Unified Multi-Cloud Virtual Drive
                </h1>
                <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  RAID-5 Array
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Presents multiple Google Drive, OneDrive, and Dropbox accounts as a single secure virtual hard disk with client-side encryption.
              </p>
            </div>
          </div>

          {/* Quick Action Bar */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-xl">
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={enableEncryption}
                  onChange={e => setEnableEncryption(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5"
                />
                <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-700">
                  <Lock size={12} className="text-emerald-600" /> AES-256
                </span>
              </label>

              <span className="text-slate-300">|</span>

              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={enableParity}
                  onChange={e => setEnableParity(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                />
                <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-700">
                  <LifeBuoy size={12} className="text-blue-600" /> RAID-5 Parity
                </span>
              </label>

              <button
                onClick={() => {
                  getOrGenerateMasterKey().then(k => setCurrentMasterKey(k));
                  setShowKeyModal(true);
                }}
                title="View Zero-Knowledge Master Key"
                className="text-slate-400 hover:text-slate-800 ml-1 cursor-pointer"
              >
                <KeyRound size={13} />
              </button>
            </div>

            <input
              type="file"
              ref={fileInputRef}
              multiple
              className="hidden"
              onChange={e => {
                if (e.target.files && e.target.files.length > 0) {
                  const selectedFiles: File[] = Array.from(e.target.files);
                  if (selectedFiles.length === 1) {
                    handleUploadFile(selectedFiles[0]);
                  } else {
                    handleBatchUploadFiles(selectedFiles);
                  }
                }
              }}
            />
            
            <button
              onClick={() => {
                if (shardedRecords.length > 0) {
                  setQuantumTargetFile(shardedRecords[0].manifest.filename);
                }
                setQuantumLabOpen(true);
              }}
              title="Open Quantum Security Audit — per-file HNDL protection grades"
              className="mr-3 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 shadow-2xs active:scale-95"
            >
              <ShieldCheck size={14} className="text-purple-600" />
              <span>Security Audit</span>
            </button>

            <div className="flex bg-slate-100 rounded-lg p-1 mr-4 border border-slate-200">
              <button
                onClick={() => setUploadMode('standard')}
                title="Direct, fast single-cloud upload with native Google Drive link sharing"
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${uploadMode === 'standard' ? 'bg-white shadow-xs text-emerald-800 font-bold' : 'text-slate-500 hover:text-slate-800'}`}
              >
                <Cloud size={13} className={uploadMode === 'standard' ? 'text-emerald-600' : 'text-slate-400'} />
                <span>Standard</span>
              </button>
              <button
                onClick={() => setUploadMode('vault')}
                title="Distributed Reed-Solomon RAID-5 sharded upload across multi-cloud accounts"
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${uploadMode === 'vault' ? 'bg-indigo-600 text-white shadow-xs font-bold' : 'text-slate-500 hover:text-slate-800'}`}
              >
                <ShieldCheck size={13} className={uploadMode === 'vault' ? 'text-white' : 'text-slate-400'} />
                <span>Vault (RAID-5)</span>
              </button>
            </div>

            <button
              disabled={isUploading || activeAccounts.length === 0}
              onClick={() => fileInputRef.current?.click()}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-xs font-semibold shadow-xs transition-all disabled:opacity-50 cursor-pointer ${uploadMode === 'vault' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
            >
              {isUploading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <UploadCloud className="w-3.5 h-3.5" />
              )}
              {isUploading
                ? (uploadMode === 'vault' ? `Sharding... ${uploadProgress}%` : `Uploading... ${uploadProgress}%`)
                : (uploadMode === 'vault' ? 'Upload to Vault (RAID-5)' : 'Upload File (Standard)')}
            </button>
          </div>
        </div>

        {/* Mode Explanation & Distinction Banner */}
        <div className={`max-w-6xl mx-auto mt-4 px-4 py-3 rounded-xl border transition-all flex items-center justify-between gap-4 ${
          uploadMode === 'standard'
            ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
            : 'bg-indigo-50/70 border-indigo-200 text-indigo-950'
        }`}>
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
              uploadMode === 'standard' ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-100 text-indigo-700'
            }`}>
              {uploadMode === 'standard' ? <Cloud size={18} /> : <ShieldCheck size={18} />}
            </div>
            <div className="min-w-0 text-xs">
              <div className="font-bold flex items-center gap-2">
                <span>{uploadMode === 'standard' ? 'Standard Upload Mode' : 'Vault (RAID-5) Mode'}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                  uploadMode === 'standard' ? 'bg-emerald-200/70 text-emerald-800' : 'bg-indigo-200/70 text-indigo-800'
                }`}>
                  {uploadMode === 'standard' ? 'Universal Web Sharing' : 'Multi-Cloud Pooling & Parity'}
                </span>
              </div>
              <p className={`text-[11px] mt-0.5 ${uploadMode === 'standard' ? 'text-emerald-800' : 'text-indigo-800'}`}>
                {uploadMode === 'standard'
                  ? 'Fast direct single-account upload. Automatically creates an instant universal Google Drive public link anyone can open with zero setup.'
                  : 'Pools multi-account storage using client-side AES-256 encryption and Reed-Solomon RAID-5 parity recovery for sensitive data.'}
              </p>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-2 shrink-0 text-[11px] font-medium">
            {uploadMode === 'standard' ? (
              <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                <Globe size={12} /> 1-Tap Public Link
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-indigo-700 font-semibold">
                <Lock size={12} /> Zero-Knowledge Sharding
              </span>
            )}
          </div>
        </div>

        {/* Tab Toggle */}
        <div className="max-w-6xl mx-auto flex items-center justify-between mt-5 border-b border-slate-100 pt-1">
          <div className="flex items-center gap-6">
            <button
              onClick={() => setActiveTab('frankenstein')}
              className={`pb-2.5 text-xs font-semibold transition-all relative ${
                activeTab === 'frankenstein' ? 'text-indigo-700' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
                Personal Multi-Cloud Vault ({shardedRecords.length})
              </span>
              {activeTab === 'frankenstein' && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 rounded-full" />
              )}
            </button>

            <button
              onClick={() => setActiveTab('all')}
              className={`pb-2.5 text-xs font-semibold transition-all relative ${
                activeTab === 'all' ? 'text-emerald-700' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-emerald-600" />
                Direct Share Drive ({filteredFiles.length})
              </span>
              {activeTab === 'all' && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600 rounded-full" />
              )}
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setP2pFile(null);
                setP2pModalOpen(true);
              }}
              className="text-[11px] font-semibold text-purple-600 hover:text-purple-800 flex items-center gap-1 cursor-pointer pb-2"
              title="Stream files peer-to-peer over WebRTC data channel"
            >
              <Radio size={12} />
              <span>P2P Direct Tunnel</span>
            </button>

            <button
              onClick={() => {
                if (shardedRecords.length > 0) {
                  setQuantumTargetFile(shardedRecords[0].manifest.filename);
                }
                setQuantumLabOpen(true);
              }}
              className="text-[11px] font-medium text-slate-600 hover:text-slate-900 flex items-center gap-1 cursor-pointer pb-2"
              title="Open Quantum Security Audit"
            >
              <ShieldCheck size={12} className="text-purple-600" />
              <span>Security Audit</span>
            </button>

            <button
              onClick={refreshStorageQuotas}
              disabled={isLoadingQuotas}
              className="text-[11px] font-medium text-slate-500 hover:text-slate-900 flex items-center gap-1 cursor-pointer pb-2"
            >
              <RefreshCw size={12} className={isLoadingQuotas ? 'animate-spin text-emerald-600' : ''} />
              <span>Refresh Quotas</span>
            </button>
          </div>
        </div>
      </div>

      {/* BODY CONTENT */}
      <div className="p-6 flex-1">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Status Message Banner */}
          {statusMessage && (
            <div
              className={`p-4 rounded-xl text-xs font-medium flex items-center justify-between border ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : statusMessage.type === 'error'
                  ? 'bg-red-50 text-red-800 border-red-200'
                  : 'bg-blue-50 text-blue-800 border-blue-200'
              }`}
            >
              <div className="flex items-center gap-2">
                {statusMessage.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <Info className="w-4 h-4 text-blue-600 shrink-0" />
                )}
                <span>{statusMessage.text}</span>
              </div>
              <div className="flex items-center gap-2">
                {standardShareModal.url && statusMessage.type === 'success' && (
                  <button
                    onClick={() => setStandardShareModal(prev => ({ ...prev, isOpen: true }))}
                    className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-semibold text-[11px] hover:bg-emerald-700 transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <Globe size={11} /> 1-Tap Copy Link
                  </button>
                )}
                <button
                  onClick={() => setStatusMessage(null)}
                  className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          )}

          {/* Upload Progress Bar */}
          {isUploading && (
            <div className="bg-white border border-emerald-200 rounded-2xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                  <Loader2 className="w-4 h-4 text-emerald-600 animate-spin" />
                  <span>{uploadStage || 'Sharding, Encrypting & Distributing to Cloud Providers...'}</span>
                </div>
                <span className="text-xs font-bold text-emerald-600">{uploadProgress}%</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Download Progress Bar */}
          {downloadingId && (
            <div className="bg-white border border-blue-200 rounded-2xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                  <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                  <span>{downloadStage || 'Reassembling & Decrypting Multi-Cloud Shards...'}</span>
                </div>
                <span className="text-xs font-bold text-blue-600">{downloadProgress}%</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-300"
                  style={{ width: `${downloadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* TAB 1: FRANKENSTEIN MULTI-CLOUD HARD DISKS */}
          {activeTab === 'frankenstein' && (
            <div className="space-y-6">
              {/* DYNAMIC QUOTA & CAPACITY OVERVIEW GAUGE */}
              <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-sm">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                  <div className="space-y-1">
                    <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <Database className="w-4 h-4 text-emerald-600" />
                      Multi-Cloud Unified Virtual Hard Disk
                    </h2>
                    <p className="text-xs text-slate-500">
                      Aggregated across {activeAccounts.length} Connected Cloud Accounts (Google, OneDrive, Dropbox).
                    </p>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <div className="text-xs text-slate-400 font-medium">Free Remaining</div>
                      <div className="text-base font-extrabold text-emerald-600">
                        {formatBytes(totalFreeCapacity)}
                      </div>
                    </div>
                    <div className="text-right border-l border-slate-200 pl-6">
                      <div className="text-xs text-slate-400 font-medium">Total Capacity</div>
                      <div className="text-base font-extrabold text-slate-900">
                        {formatBytes(totalPooledCapacity)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Main Storage Progress Bar */}
                <div className="mt-4 space-y-2">
                  <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden flex">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-500"
                      style={{ width: `${usedPercentage}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-500">
                    <span>{formatBytes(totalUsedCapacity)} Used ({usedPercentage}%)</span>
                    <span>{formatBytes(totalFreeCapacity)} Available for Sharding</span>
                  </div>
                </div>

                {/* Per-Account Live Quota Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 mt-5 pt-5 border-t border-slate-100">
                  {activeAccounts.map(acc => {
                    const q = accountQuotas[acc.id];
                    const provider = acc.provider || 'google';
                    const usedPct = q && q.totalBytes > 0 ? Math.round((q.usedBytes / q.totalBytes) * 100) : 0;

                    return (
                      <div
                        key={acc.id}
                        className="p-3 rounded-xl border border-slate-200/70 bg-slate-50 flex flex-col justify-between gap-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="truncate font-semibold text-xs text-slate-800 max-w-[150px]">
                            {acc.email}
                          </span>
                          <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-white text-slate-600 border border-slate-200">
                            {provider}
                          </span>
                        </div>
                        <div>
                          <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                            <span>{q ? formatBytes(q.usedBytes) : '...'} used</span>
                            <span>{q ? formatBytes(q.totalBytes) : '15 GB'}</span>
                          </div>
                          <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500 rounded-full"
                              style={{ width: `${usedPct}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* PERSONAL DEVICE-SYNC RESTORATION BOX */}
              <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-2xl p-5 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs font-bold text-indigo-300">
                    <Share2 size={14} />
                    <span>Sync Personal Vault Across Devices</span>
                  </div>
                  <p className="text-xs text-slate-300">
                    Paste your personal device-sync link to reconstruct and restore vaulted files on this device.
                  </p>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <input
                    type="text"
                    placeholder="https://...#m=..."
                    value={importMagicInput}
                    onChange={e => setImportMagicInput(e.target.value)}
                    className="px-3 py-1.5 rounded-xl bg-white/10 border border-white/20 text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 w-full sm:w-64"
                  />
                  <button
                    onClick={handleImportMagicLink}
                    className="px-3 py-1.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-semibold shrink-0 cursor-pointer"
                  >
                    Restore File
                  </button>
                </div>
              </div>

              {/* Sharded Files List */}
              {shardedRecords.length === 0 ? (
                <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-12 text-center">
                  <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3">
                    <Zap className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-800">No multi-cloud files yet</h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                    Drag and drop any large file here or click the button below to encrypt and stripe across Google
                    Drive, OneDrive, and Dropbox.
                  </p>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-4 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 shadow-xs cursor-pointer"
                  >
                    Select Local File to Shard
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Multi-Selection Action Toolbar for Vault Files */}
                  <div className="flex items-center justify-between bg-white border border-slate-200 px-4 py-3 rounded-2xl shadow-xs">
                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={selectedVaultFileIds.size > 0 && selectedVaultFileIds.size === shardedRecords.length}
                        ref={el => {
                          if (el) {
                            el.indeterminate = selectedVaultFileIds.size > 0 && selectedVaultFileIds.size < shardedRecords.length;
                          }
                        }}
                        onChange={e => {
                          if (e.target.checked) {
                            setSelectedVaultFileIds(new Set(shardedRecords.map(r => r.id)));
                          } else {
                            setSelectedVaultFileIds(new Set());
                          }
                        }}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                        id="select-all-vault"
                      />
                      <label htmlFor="select-all-vault" className="text-xs font-semibold text-slate-700 cursor-pointer select-none">
                        {selectedVaultFileIds.size > 0
                          ? `${selectedVaultFileIds.size} of ${shardedRecords.length} Selected`
                          : `Select All (${shardedRecords.length})`}
                      </label>
                    </div>

                    {selectedVaultFileIds.size > 0 && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={async () => {
                            const matchingRecords = shardedRecords.filter(r => selectedVaultFileIds.has(r.id));
                            const selectedItems: MultiShareItem[] = [];
                            for (const r of matchingRecords) {
                              const url = await createMagicShareLink(r.manifest, customClientId);
                              selectedItems.push({
                                id: r.id,
                                name: r.manifest.filename,
                                url,
                                accountEmail: r.sourceAccountEmail,
                                isVault: true,
                              });
                            }
                            setMultiShareModal({
                              isOpen: true,
                              title: `Export ${selectedItems.length} Device-Sync Links`,
                              items: selectedItems,
                            });
                          }}
                          className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                        >
                          <Share2 size={13} />
                          <span>Export Sync Links ({selectedVaultFileIds.size})</span>
                        </button>

                        <button
                          onClick={() => setSelectedVaultFileIds(new Set())}
                          className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors text-xs"
                          title="Deselect all"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                  {shardedRecords.map(record => {
                    const isDownloadingThis = downloadingId === record.id;
                    const isVerifyingThis = verifyingId === record.id;
                    const integrity = integrityResults[record.id];
                    const isSelected = selectedVaultFileIds.has(record.id);

                    return (
                      <div
                        key={record.id}
                        className={`bg-white border rounded-2xl p-5 shadow-sm hover:shadow-md transition-all space-y-4 ${
                          isSelected ? 'border-indigo-500 ring-1 ring-indigo-500/50 bg-indigo-50/10' : 'border-slate-200/90'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                          <div className="flex items-start gap-3 min-w-0">
                            {/* Checkbox */}
                            <div className="pt-2 shrink-0">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={e => {
                                  e.stopPropagation();
                                  const next = new Set(selectedVaultFileIds);
                                  if (e.target.checked) {
                                    next.add(record.id);
                                  } else {
                                    next.delete(record.id);
                                  }
                                  setSelectedVaultFileIds(next);
                                }}
                                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                              />
                            </div>

                            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200/70 flex items-center justify-center shrink-0">
                              <FileText className="w-5 h-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                                <h3 className="text-sm font-bold text-slate-900 leading-tight truncate max-w-[180px] sm:max-w-xs md:max-w-md" title={record.manifest.filename}>
                                  {record.manifest.filename}
                                </h3>
                                <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                                  {record.manifest.isEncrypted && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
                                      <Lock size={10} /> AES-256
                                    </span>
                                  )}
                                  {record.manifest.quantumShield && (
                                    <span
                                      className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 whitespace-nowrap"
                                      title="File encryption key sealed with ML-KEM-768 (NIST FIPS 203). Resistant to harvest-now-decrypt-later attacks."
                                    >
                                      <ShieldCheck size={10} /> Quantum Shield
                                    </span>
                                  )}
                                  {record.manifest.parityChunk && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 whitespace-nowrap">
                                      <LifeBuoy size={10} /> Multi-Cloud RAID-5
                                    </span>
                                  )}
                                  {record.manifest.isEncrypted && record.manifest.parityChunk && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setQuantumTargetFile(record.manifest.filename);
                                        setQuantumLabOpen(true);
                                      }}
                                      className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 whitespace-nowrap cursor-pointer transition-colors"
                                      title="Open Quantum Security Audit for this file"
                                    >
                                      <Shield size={10} className="text-purple-600" /> Security Audit
                                    </button>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                                <span>{(record.manifest.totalSize / (1024 * 1024)).toFixed(2)} MB</span>
                                <span>•</span>
                                <span>
                                  {record.manifest.totalChunks} Chunks (
                                  {record.manifest.dataChunksCount} Data +{' '}
                                  {record.manifest.parityChunksCount || 0} Parity)
                                </span>
                                <span>•</span>
                                <span>
                                  Created {new Date(record.manifest.createdAt).toLocaleDateString()}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Actions: 1 Primary Button + Clean Mobile 3-Dots Menu */}
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              disabled={isDownloadingThis}
                              onClick={() => handleReassembleDownload(record)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer shadow-xs whitespace-nowrap"
                            >
                              {isDownloadingThis ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Download className="w-3.5 h-3.5" />
                              )}
                              {isDownloadingThis ? `Reassembling ${downloadProgress}%` : 'Download'}
                            </button>

                            {/* Three-dot context menu */}
                            <div className="relative">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  // If mobile screen width (< 640px), open MobileActionSheet
                                  if (typeof window !== 'undefined' && window.innerWidth < 640) {
                                    setMobileSheet({
                                      isOpen: true,
                                      title: record.manifest.filename,
                                      subtitle: `${(record.manifest.totalSize / (1024 * 1024)).toFixed(2)} MB • ${record.manifest.totalChunks} Chunks`,
                                      items: [
                                        {
                                          icon: <Download size={18} className="text-emerald-600" />,
                                          label: 'Download & Decrypt',
                                          sublabel: 'Reassemble chunks in browser',
                                          onClick: () => handleReassembleDownload(record),
                                        },
                                        {
                                          icon: <Share2 size={18} className="text-indigo-600" />,
                                          label: 'Export Device-Sync Link',
                                          sublabel: 'Restore on your other devices',
                                          onClick: () => handleGenerateMagicLink(record),
                                        },
                                        {
                                          icon: isVerifyingThis ? (
                                            <Loader2 size={18} className="animate-spin text-emerald-600" />
                                          ) : (
                                            <ShieldCheck size={18} className="text-emerald-600" />
                                          ),
                                          label: 'Verify RAID-5 Integrity',
                                          sublabel: 'Check chunk health across drives',
                                          disabled: isVerifyingThis,
                                          onClick: () => handleIntegrityCheck(record),
                                        },
                                        {
                                          icon: <Trash2 size={18} className="text-red-500" />,
                                          label: 'Purge All Cloud Shards',
                                          sublabel: 'Permanently remove from providers',
                                          destructive: true,
                                          onClick: () => handleDeleteShardedFile(record),
                                        },
                                      ],
                                    });
                                    return;
                                  }
                                  setActiveVaultMenuId(activeVaultMenuId === record.id ? null : record.id);
                                }}
                                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer border border-slate-200"
                                title="More options"
                              >
                                <MoreVertical size={15} />
                              </button>

                              {/* Desktop dropdown only */}
                              {activeVaultMenuId === record.id && (
                                <>
                                  <div
                                    className="fixed inset-0 z-30"
                                    onClick={() => setActiveVaultMenuId(null)}
                                  />
                                  <div className="hidden sm:block absolute right-0 top-full mt-1 w-52 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-40 animate-in fade-in zoom-in-95 duration-100">
                                    <button
                                      onClick={() => {
                                        setActiveVaultMenuId(null);
                                        handleGenerateMagicLink(record);
                                      }}
                                      className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors text-left cursor-pointer"
                                    >
                                      <Share2 size={13} className="text-indigo-600 shrink-0" />
                                      <span>Export Device-Sync Link</span>
                                    </button>

                                    <button
                                      onClick={() => {
                                        setActiveVaultMenuId(null);
                                        handleP2PStreamVaultFile(record);
                                      }}
                                      className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-purple-50 hover:text-purple-700 transition-colors text-left cursor-pointer"
                                    >
                                      <Radio size={13} className="text-purple-600 shrink-0" />
                                      <span>Stream via WebRTC P2P</span>
                                    </button>

                                    <button
                                      disabled={isVerifyingThis}
                                      onClick={() => {
                                        setActiveVaultMenuId(null);
                                        handleIntegrityCheck(record);
                                      }}
                                      className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-emerald-700 transition-colors text-left cursor-pointer"
                                    >
                                      {isVerifyingThis ? (
                                        <Loader2 size={13} className="animate-spin text-emerald-600 shrink-0" />
                                      ) : (
                                        <ShieldCheck size={13} className="text-emerald-600 shrink-0" />
                                      )}
                                      <span>Verify RAID-5 Integrity</span>
                                    </button>

                                    <div className="h-px bg-slate-100 my-1" />

                                    <button
                                      onClick={() => {
                                        setActiveVaultMenuId(null);
                                        handleDeleteShardedFile(record);
                                      }}
                                      className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors text-left cursor-pointer"
                                    >
                                      <Trash2 size={13} className="text-red-500 shrink-0" />
                                      <span>Purge All Cloud Shards</span>
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Integrity Status Callout */}
                        {integrity && (
                          <div
                            className={`p-2.5 rounded-xl text-xs font-medium flex items-center justify-between border ${
                              integrity.healthy
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : integrity.canRecover
                                ? 'bg-blue-50 text-blue-800 border-blue-200'
                                : 'bg-red-50 text-red-800 border-red-200'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              {integrity.healthy ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                              ) : (
                                <LifeBuoy className="w-4 h-4 text-blue-600" />
                              )}
                              <span>
                                {integrity.healthy
                                  ? 'All chunks 100% healthy across cloud providers.'
                                  : integrity.canRecover
                                  ? `1 chunk missing, but file is 100% RECOVERABLE via RAID-5 parity!`
                                  : `${integrity.missingChunks} chunks missing. Reassembly impossible.`}
                              </span>
                            </div>
                            <span className="text-[10px] font-bold uppercase">
                              {integrity.healthy ? 'Optimal' : integrity.canRecover ? 'Degraded/Recoverable' : 'Failed'}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: ALL RAW DRIVE FILES */}
          {activeTab === 'all' && (
            <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm space-y-3">
              {filteredFiles.length > 0 && (
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={selectedRawFileIds.size > 0 && selectedRawFileIds.size === filteredFiles.length}
                      ref={el => {
                        if (el) {
                          el.indeterminate = selectedRawFileIds.size > 0 && selectedRawFileIds.size < filteredFiles.length;
                        }
                      }}
                      onChange={e => {
                        if (e.target.checked) {
                          setSelectedRawFileIds(new Set(filteredFiles.map(f => f.id)));
                        } else {
                          setSelectedRawFileIds(new Set());
                        }
                      }}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                      id="select-all-raw"
                    />
                    <label htmlFor="select-all-raw" className="text-xs font-semibold text-slate-700 cursor-pointer select-none">
                      {selectedRawFileIds.size > 0
                        ? `${selectedRawFileIds.size} of ${filteredFiles.length} Selected`
                        : `Select All (${filteredFiles.length})`}
                    </label>
                  </div>

                  {selectedRawFileIds.size > 0 && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={async () => {
                          const selectedFiles = filteredFiles.filter(f => selectedRawFileIds.has(f.id));
                          // Ensure files are publicly accessible
                          const items: MultiShareItem[] = [];
                          for (const f of selectedFiles) {
                            try {
                              const acc = accounts.find(a => a.email === f.accountEmail);
                              if (acc) {
                                const { makeFilePublic } = await import('../services/googleService');
                                await makeFilePublic(f.id, acc.accessToken);
                              }
                            } catch (e) {
                              console.warn('Could not set permissions for file', f.name, e);
                            }
                            const shareUrl = f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`;
                            items.push({
                              id: f.id,
                              name: f.name,
                              url: shareUrl,
                              accountEmail: f.accountEmail,
                              isVault: false,
                            });
                          }
                          setMultiShareModal({
                            isOpen: true,
                            title: `Share ${items.length} Drive Files`,
                            items,
                          });
                        }}
                        className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                      >
                        <Share2 size={13} />
                        <span>Multi-Share ({selectedRawFileIds.size})</span>
                      </button>

                      <button
                        onClick={() => setSelectedRawFileIds(new Set())}
                        className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors text-xs"
                        title="Deselect all"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-3">
                {filteredFiles.length === 0 ? (
                  <div className="text-center py-10 text-xs text-slate-400">No raw drive files found.</div>
                ) : (
                  filteredFiles.map(file => {
                    const isSelected = selectedRawFileIds.has(file.id);
                    return (
                      <div
                        key={file.id}
                        className={`relative flex items-center justify-between p-3 rounded-xl border transition-colors ${
                          isSelected ? 'border-emerald-500 bg-emerald-50/20 ring-1 ring-emerald-500/50' : 'border-slate-100 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0 pr-2">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={e => {
                              e.stopPropagation();
                              const next = new Set(selectedRawFileIds);
                              if (e.target.checked) {
                                next.add(file.id);
                              } else {
                                next.delete(file.id);
                              }
                              setSelectedRawFileIds(next);
                            }}
                            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer shrink-0"
                          />
                          <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-slate-800 truncate max-w-[200px] sm:max-w-[340px]">{file.name}</div>
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-400 truncate">
                              <span>{file.accountEmail}</span>
                              {file.provider && file.provider !== 'google' && (
                                <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase ${
                                  file.provider === 'onedrive' ? 'bg-blue-100 text-blue-800' : 'bg-sky-100 text-sky-800'
                                }`}>
                                  {file.provider}
                                </span>
                              )}
                              {file.size ? <span>• {(file.size / (1024 * 1024)).toFixed(1)} MB</span> : null}
                            </div>
                          </div>
                        </div>
                      
                      <div className="flex items-center gap-2 shrink-0">
                        <a
                          href={file.webViewLink}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 font-medium flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-transparent hover:border-blue-100 transition-colors"
                        >
                          Open <ExternalLink size={12} />
                        </a>

                        {/* Three-dot context menu */}
                        <div className="relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (typeof window !== 'undefined' && window.innerWidth < 640) {
                                const acc = accounts.find(a => a.email === file.accountEmail);
                                const sheetItems: MobileActionSheetItem[] = [
                                  {
                                    icon: <ExternalLink size={18} className="text-emerald-600" />,
                                    label: 'Share Public Link',
                                    sublabel: 'Allow public viewing via Drive',
                                    onClick: async () => {
                                      try {
                                        if (!acc) return;
                                        const { makeFilePublic } = await import('../services/googleService');
                                        await makeFilePublic(file.id, acc.accessToken);
                                        setStandardShareModal({
                                          isOpen: true,
                                          url: file.webViewLink,
                                          filename: file.name,
                                          accountEmail: file.accountEmail || acc.email,
                                          title: 'Share Google Drive File'
                                        });
                                      } catch(e) {
                                        alert("Failed to generate link");
                                      }
                                    },
                                  },
                                ];

                                if (setTransferFile) {
                                  sheetItems.push({
                                    icon: <ArrowRight size={18} className="text-indigo-600" />,
                                    label: 'Transfer to Cloud',
                                    sublabel: 'Move or copy to another drive',
                                    onClick: () => setTransferFile(file),
                                  });
                                }

                                setMobileSheet({
                                  isOpen: true,
                                  title: file.name,
                                  subtitle: file.accountEmail,
                                  items: sheetItems,
                                });
                                return;
                              }
                              setActiveFileMenuId(activeFileMenuId === file.id ? null : file.id);
                            }}
                            className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                            title="More options"
                          >
                            <MoreVertical size={15} />
                          </button>

                          {activeFileMenuId === file.id && (
                            <>
                              <div
                                className="fixed inset-0 z-30"
                                onClick={() => setActiveFileMenuId(null)}
                              />
                              <div className="hidden sm:block absolute right-0 top-full mt-1 w-44 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-40 animate-in fade-in zoom-in-95 duration-100">
                                <button
                                  onClick={async () => {
                                    setActiveFileMenuId(null);
                                    try {
                                      const acc = accounts.find(a => a.email === file.accountEmail);
                                      if (!acc) return;
                                      const { makeFilePublic } = await import('../services/googleService');
                                      await makeFilePublic(file.id, acc.accessToken);
                                      setStandardShareModal({
                                        isOpen: true,
                                        url: file.webViewLink,
                                        filename: file.name,
                                        accountEmail: file.accountEmail || acc.email,
                                        title: 'Share Google Drive File'
                                      });
                                    } catch(e) {
                                      alert("Failed to generate link");
                                    }
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-emerald-700 transition-colors text-left cursor-pointer"
                                >
                                  <ExternalLink size={13} className="text-emerald-600" />
                                  <span>Share Public Link</span>
                                </button>

                                {setTransferFile && (
                                  <button
                                    onClick={() => {
                                      setActiveFileMenuId(null);
                                      setTransferFile(file);
                                    }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-indigo-700 transition-colors text-left cursor-pointer"
                                  >
                                    <ArrowRight size={13} className="text-indigo-600" />
                                    <span>Transfer to Cloud</span>
                                  </button>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                    </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* P2P MAGIC LINK MODAL */}
      <AnimatePresence>
        {magicLinkModal.isOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <Share2 size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Personal Device-Sync Link</h3>
                    <p className="text-xs text-slate-400">Cross-Device Vault Reconstitution</p>
                  </div>
                </div>
                <button
                  onClick={() => setMagicLinkModal({ isOpen: false, url: '', filename: '' })}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                This self-contained link encodes the encrypted chunk blueprint and AES-256 decryption key in the URL hash.
                Open this on another device or browser where your accounts are connected to reconstruct this file. Your shards remain 100% private in your personal cloud accounts.
              </p>

              {/* Quantum Cryptography Specification */}
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-2">
                <Shield size={14} className="text-purple-600 shrink-0 mt-0.5" />
                <div className="text-[11px] leading-relaxed text-slate-700">
                  <span className="font-semibold text-slate-900">Post-Quantum Hybrid: </span>
                  Payload protected via NIST FIPS 203 ML-KEM-768 hybrid lattice encapsulation and Grover-safe AES-256-GCM against retrospective quantum cryptanalysis.
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono text-[11px] break-all text-slate-700 max-h-24 overflow-y-auto">
                {magicLinkModal.url}
              </div>

              {/* QR Code Quick Scan for Mobile Phones */}
              <QRCodeCard
                url={magicLinkModal.url}
                title="Scan to Open & Download on Mobile"
                subtitle="Open this self-contained decentralized link instantly with any phone camera"
              />

              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(magicLinkModal.url);
                    setCopiedMagicLink(true);
                    setTimeout(() => setCopiedMagicLink(false), 2000);
                  }}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  {copiedMagicLink ? <Check size={13} /> : <Copy size={13} />}
                  <span>{copiedMagicLink ? 'Copied to Clipboard!' : 'Copy Device-Sync Link'}</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MASTER KEY MODAL */}
      <AnimatePresence>
        {showKeyModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <KeyRound size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Zero-Knowledge Master Key</h3>
                    <p className="text-xs text-slate-400">Device Hardware Key</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowKeyModal(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs break-all text-slate-800 select-all">
                {currentMasterKey}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(currentMasterKey);
                    setCopiedKey(true);
                    setTimeout(() => setCopiedKey(false), 2000);
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedKey ? <Check size={13} /> : <Copy size={13} />}
                  <span>{copiedKey ? 'Copied' : 'Copy Key'}</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Standard Upload Destination Account Selector Modal */}
      <StandardUploadPickerModal
        isOpen={standardPickerOpen}
        onClose={() => {
          setStandardPickerOpen(false);
          setPendingUploadFile(null);
        }}
        file={pendingUploadFile}
        accounts={activeAccounts}
        onSelectAccount={async (accountId) => {
          const fileToUpload = pendingUploadFile;
          setStandardPickerOpen(false);
          setPendingUploadFile(null);
          if (fileToUpload) {
            await executeStandardUpload(fileToUpload, accountId);
          }
        }}
      />

      {/* Standard Upload Instant Share Modal */}
      <StandardShareModal
        isOpen={standardShareModal.isOpen}
        onClose={() => setStandardShareModal(prev => ({ ...prev, isOpen: false }))}
        url={standardShareModal.url}
        filename={standardShareModal.filename}
        accountEmail={standardShareModal.accountEmail}
        title={standardShareModal.title}
      />

      {/* Multi-Share Modal (Both Vault P2P links and Drive Web links) */}
      <MultiShareModal
        isOpen={multiShareModal.isOpen}
        onClose={() => setMultiShareModal(prev => ({ ...prev, isOpen: false }))}
        title={multiShareModal.title}
        items={multiShareModal.items}
      />

      {/* Standard Multi-File Upload Destination Account Picker Modal */}
      <StandardMultiUploadPickerModal
        isOpen={multiUploadPickerOpen}
        onClose={() => {
          setMultiUploadPickerOpen(false);
          setPendingUploadFiles([]);
        }}
        files={pendingUploadFiles}
        accounts={activeAccounts}
        onConfirm={async (allocation, selectedAccountId) => {
          const filesToUpload = pendingUploadFiles;
          setMultiUploadPickerOpen(false);
          setPendingUploadFiles([]);
          if (filesToUpload.length > 0) {
            await executeStandardBatchUpload(filesToUpload, allocation, selectedAccountId);
          }
        }}
      />

      {/* Responsive Mobile Slide-Up Action Sheet */}
      <MobileActionSheet
        isOpen={mobileSheet.isOpen}
        onClose={() => setMobileSheet(prev => ({ ...prev, isOpen: false }))}
        title={mobileSheet.title}
        subtitle={mobileSheet.subtitle}
        items={mobileSheet.items}
      />

      {/* Direct WebRTC P2P Transfer Modal */}
      <P2PTunnelModal
        isOpen={p2pModalOpen}
        onClose={() => {
          setP2pModalOpen(false);
          setP2pFile(null);
        }}
        preselectedFile={p2pFile?.file}
        preselectedFilename={p2pFile?.filename}
        onFileReceived={(received) => {
          setStatusMessage({
            type: 'success',
            text: `Received "${received.name}" (${(received.size / (1024 * 1024)).toFixed(2)} MB) directly via WebRTC P2P tunnel!`,
          });
        }}
      />

      {/* Quantum Security Audit Modal */}
      <QuantumAuditModal
        isOpen={quantumLabOpen}
        onClose={() => setQuantumLabOpen(false)}
        records={shardedRecords}
        focusFileName={quantumTargetFile}
      />
    </div>
  );
};
