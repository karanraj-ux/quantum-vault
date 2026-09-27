import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Radio,
  Send,
  Download,
  Copy,
  Check,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Zap,
  ArrowRight,
  Shield,
  HardDrive,
  Share2,
} from 'lucide-react';
import { WebRtcP2PTunnel, P2PTransferProgress } from '../services/webRtcService';

interface P2PTunnelModalProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedFile?: File | Blob | null;
  preselectedFilename?: string;
  onFileReceived?: (file: File) => void;
}

export const P2PTunnelModal: React.FC<P2PTunnelModalProps> = ({
  isOpen,
  onClose,
  preselectedFile,
  preselectedFilename,
  onFileReceived,
}) => {
  const [mode, setMode] = useState<'send' | 'receive'>(preselectedFile ? 'send' : 'receive');
  const [tunnel, setTunnel] = useState<WebRtcP2PTunnel | null>(null);

  // Sender state
  const [offerCode, setOfferCode] = useState<string>('');
  const [answerInput, setAnswerInput] = useState<string>('');
  const [isWaitingAnswer, setIsWaitingAnswer] = useState<boolean>(false);
  const [hasCopiedOffer, setHasCopiedOffer] = useState<boolean>(false);

  // Receiver state
  const [offerInput, setOfferInput] = useState<string>('');
  const [generatedAnswer, setGeneratedAnswer] = useState<string>('');
  const [hasCopiedAnswer, setHasCopiedAnswer] = useState<boolean>(false);

  // File to send
  const [fileToSend, setFileToSend] = useState<File | null>(
    preselectedFile instanceof File ? preselectedFile : null
  );

  // Transfer state
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [progress, setProgress] = useState<P2PTransferProgress | null>(null);
  const [receivedFile, setReceivedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) {
      if (tunnel) tunnel.close();
      setTunnel(null);
      setOfferCode('');
      setAnswerInput('');
      setOfferInput('');
      setGeneratedAnswer('');
      setIsConnected(false);
      setProgress(null);
      setReceivedFile(null);
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // SENDER: Create Offer
  const handleStartSender = async () => {
    try {
      setError(null);
      const newTunnel = new WebRtcP2PTunnel();
      setTunnel(newTunnel);
      setIsWaitingAnswer(true);

      const { offerString, onConnected } = await newTunnel.createOffer();
      setOfferCode(offerString);

      onConnected.then(() => {
        setIsConnected(true);
        setIsWaitingAnswer(false);
      });
    } catch (e: any) {
      setError(`Failed to create P2P offer: ${e.message}`);
      setIsWaitingAnswer(false);
    }
  };

  // SENDER: Apply Receiver's Answer
  const handleApplyAnswer = async () => {
    if (!tunnel || !answerInput.trim()) return;
    try {
      await tunnel.acceptAnswer(answerInput.trim());
    } catch (e: any) {
      setError(`Failed to connect with answer: ${e.message}`);
    }
  };

  // SENDER: Stream File
  const handleSendFile = async () => {
    const target = fileToSend || preselectedFile;
    if (!tunnel || !target) return;
    const name = fileToSend?.name || preselectedFilename || 'matrix-p2p-asset.bin';
    const type = fileToSend?.type || 'application/octet-stream';

    try {
      await tunnel.streamFile(target, name, type, (p) => {
        setProgress(p);
      });
    } catch (e: any) {
      setError(`Transfer error: ${e.message}`);
    }
  };

  // RECEIVER: Generate Answer
  const handleProcessOffer = async () => {
    if (!offerInput.trim()) return;
    try {
      setError(null);
      const newTunnel = new WebRtcP2PTunnel();
      setTunnel(newTunnel);

      const { answerString, onConnected } = await newTunnel.handleOfferAndCreateAnswer(
        offerInput.trim()
      );
      setGeneratedAnswer(answerString);

      onConnected.then(() => {
        setIsConnected(true);
        // Start listening for incoming file
        newTunnel.receiveFile(
          (p) => setProgress(p),
          (file) => {
            setReceivedFile(file);
            if (onFileReceived) onFileReceived(file);
          }
        );
      });
    } catch (e: any) {
      setError(`Invalid offer code: ${e.message}`);
    }
  };

  const copyToClipboard = (text: string, isOffer: boolean) => {
    navigator.clipboard.writeText(text);
    if (isOffer) {
      setHasCopiedOffer(true);
      setTimeout(() => setHasCopiedOffer(false), 2000);
    } else {
      setHasCopiedAnswer(true);
      setTimeout(() => setHasCopiedAnswer(false), 2000);
    }
  };

  const formatSpeed = (bps: number) => {
    if (bps > 1024 * 1024) return `${(bps / (1024 * 1024)).toFixed(2)} MB/s`;
    if (bps > 1024) return `${(bps / 1024).toFixed(1)} KB/s`;
    return `${Math.round(bps)} B/s`;
  };

  return (
    <div className="fixed inset-0 z-[160] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <Radio size={16} />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900">Direct WebRTC P2P Tunnel</h3>
              <p className="text-[11px] text-slate-400">Zero-cloud browser-to-browser encrypted streaming</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Mode Selector */}
        {!isConnected && (
          <div className="grid grid-cols-2 p-2 bg-slate-50 border-b border-slate-100 gap-2">
            <button
              onClick={() => {
                setMode('send');
                setError(null);
              }}
              className={`py-2 text-xs font-semibold rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-all ${
                mode === 'send'
                  ? 'bg-white text-purple-700 shadow-2xs border border-slate-200'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Send size={13} />
              <span>Send File (Host)</span>
            </button>
            <button
              onClick={() => {
                setMode('receive');
                setError(null);
              }}
              className={`py-2 text-xs font-semibold rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-all ${
                mode === 'receive'
                  ? 'bg-white text-purple-700 shadow-2xs border border-slate-200'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Download size={13} />
              <span>Receive File (Peer)</span>
            </button>
          </div>
        )}

        {/* Quantum-Resistant Cryptography Specification */}
        <div className="mx-5 mt-4 p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-2.5">
          <div className="p-1 rounded-md bg-slate-200 text-slate-700 shrink-0 mt-0.5">
            <Shield size={13} />
          </div>
          <div className="text-[11px] leading-relaxed text-slate-600">
            <span className="font-semibold text-slate-900">Post-Quantum Cryptography: </span>
            P2P session key exchange encapsulated via NIST FIPS 203 ML-KEM-768 hybrid lattice vectors and AES-256 payload encryption.
          </div>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600 flex items-center gap-2">
              <AlertCircle size={14} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* ACTIVE CONNECTION / TRANSFER VIEW */}
          {isConnected ? (
            <div className="space-y-4 py-2">
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
                <div className="flex items-center gap-2 text-emerald-800 text-xs font-semibold">
                  <CheckCircle2 size={16} />
                  <span>Encrypted P2P DataChannel Connected</span>
                </div>
                <span className="text-[10px] font-mono text-emerald-600 bg-white px-2 py-0.5 rounded border border-emerald-200">
                  Local / Direct
                </span>
              </div>

              {/* SENDER CONTROLS */}
              {mode === 'send' && !progress && (
                <div className="space-y-3">
                  <div className="p-3 border border-slate-200 rounded-xl bg-slate-50 flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <HardDrive size={16} className="text-slate-500 shrink-0" />
                      <span className="text-xs font-medium text-slate-800 truncate">
                        {fileToSend?.name || preselectedFilename || 'Select file to send'}
                      </span>
                    </div>
                    {!preselectedFile && (
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="text-xs text-purple-600 hover:underline font-semibold cursor-pointer shrink-0"
                      >
                        Browse...
                      </button>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files?.[0]) setFileToSend(e.target.files[0]);
                      }}
                    />
                  </div>

                  <button
                    onClick={handleSendFile}
                    className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
                  >
                    <Send size={13} />
                    <span>Stream File Over P2P Tunnel</span>
                  </button>
                </div>
              )}

              {/* TRANSFER PROGRESS */}
              {progress && (
                <div className="space-y-3 p-4 rounded-xl border border-slate-200 bg-slate-50">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-slate-800 capitalize">
                        {progress.stage === 'transferring'
                          ? mode === 'send'
                            ? 'Streaming to peer...'
                            : 'Receiving byte stream...'
                          : progress.stage}
                      </span>
                      {progress.isPostQuantumActive && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-semibold border border-purple-200">
                          ML-KEM-768 Active
                        </span>
                      )}
                    </div>
                    <span className="font-mono text-purple-600 font-bold">{progress.percentage}%</span>
                  </div>

                  <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                    <div
                      className="h-full bg-purple-600 transition-all duration-200"
                      style={{ width: `${progress.percentage}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                    <span>
                      {(progress.bytesTransferred / (1024 * 1024)).toFixed(1)} /{' '}
                      {(progress.totalBytes / (1024 * 1024)).toFixed(1)} MB
                    </span>
                    <span>{formatSpeed(progress.speedBps)}</span>
                  </div>
                </div>
              )}

              {/* RECEIVER COMPLETE */}
              {receivedFile && (
                <div className="p-4 rounded-xl bg-purple-50 border border-purple-200 text-center space-y-2">
                  <div className="w-10 h-10 rounded-full bg-purple-600 text-white flex items-center justify-center mx-auto">
                    <Check size={20} />
                  </div>
                  <h4 className="font-bold text-xs text-purple-900">File Reconstructed Bit-Exact!</h4>
                  <p className="text-[11px] text-purple-700">{receivedFile.name} ({(receivedFile.size / (1024 * 1024)).toFixed(2)} MB)</p>
                  <a
                    href={URL.createObjectURL(receivedFile)}
                    download={receivedFile.name}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-purple-600 text-white text-xs font-semibold rounded-xl hover:bg-purple-700 shadow-2xs transition-colors cursor-pointer"
                  >
                    <Download size={13} />
                    <span>Save to Disk</span>
                  </a>
                </div>
              )}
            </div>
          ) : mode === 'send' ? (
            /* SENDER HANDSHAKE FLOW */
            <div className="space-y-4">
              {!offerCode ? (
                <div className="space-y-3">
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Generate a direct peer connection offer code to share with another browser. Once connected, files stream directly over WebRTC.
                  </p>
                  <button
                    onClick={handleStartSender}
                    className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
                  >
                    <Zap size={14} />
                    <span>Generate P2P Connection Offer</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-700">
                      Step 1: Send this Offer Code to Receiver
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={offerCode}
                        className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-600 truncate"
                      />
                      <button
                        onClick={() => copyToClipboard(offerCode, true)}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1 shrink-0 cursor-pointer"
                      >
                        {hasCopiedOffer ? <Check size={13} /> : <Copy size={13} />}
                        <span>{hasCopiedOffer ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1 pt-2">
                    <label className="text-[11px] font-semibold text-slate-700">
                      Step 2: Paste Receiver&apos;s Answer Code Here
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Paste receiver's answer string..."
                        value={answerInput}
                        onChange={(e) => setAnswerInput(e.target.value)}
                        className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-mono text-slate-800"
                      />
                      <button
                        onClick={handleApplyAnswer}
                        disabled={!answerInput.trim()}
                        className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center gap-1 shrink-0 cursor-pointer"
                      >
                        <ArrowRight size={13} />
                        <span>Connect</span>
                      </button>
                    </div>
                  </div>

                  <div className="p-3 bg-purple-50/60 border border-purple-100 rounded-xl flex items-center gap-2 text-[11px] text-purple-700">
                    <Loader2 size={13} className="animate-spin text-purple-600 shrink-0" />
                    <span>Waiting for receiver&apos;s answer...</span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* RECEIVER HANDSHAKE FLOW */
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-700">
                  Step 1: Paste Sender&apos;s Offer Code
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Paste offer string here..."
                    value={offerInput}
                    onChange={(e) => setOfferInput(e.target.value)}
                    className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-mono text-slate-800"
                  />
                  <button
                    onClick={handleProcessOffer}
                    disabled={!offerInput.trim()}
                    className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shrink-0 cursor-pointer"
                  >
                    Accept Offer
                  </button>
                </div>
              </div>

              {generatedAnswer && (
                <div className="space-y-2 pt-2">
                  <label className="text-[11px] font-semibold text-slate-700">
                    Step 2: Copy this Answer and Send it back to Sender
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={generatedAnswer}
                      className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-600 truncate"
                    />
                    <button
                      onClick={() => copyToClipboard(generatedAnswer, false)}
                      className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1 shrink-0 cursor-pointer"
                    >
                      {hasCopiedAnswer ? <Check size={13} /> : <Copy size={13} />}
                      <span>{hasCopiedAnswer ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <div className="p-3 bg-purple-50/60 border border-purple-100 rounded-xl flex items-center gap-2 text-[11px] text-purple-700">
                    <Loader2 size={13} className="animate-spin text-purple-600 shrink-0" />
                    <span>Waiting for sender to lock handshake...</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-1.5">
            <Shield size={12} className="text-purple-600" />
            <span>End-to-End Encrypted RTCDataChannel</span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-600 hover:text-slate-900 font-semibold cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
