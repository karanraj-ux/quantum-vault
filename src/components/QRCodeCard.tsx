import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { QrCode, Download, Copy, Check, ExternalLink, Sparkles } from 'lucide-react';

interface QRCodeCardProps {
  url: string;
  title?: string;
  subtitle?: string;
  size?: number;
  showDownload?: boolean;
}

export const QRCodeCard: React.FC<QRCodeCardProps> = ({
  url,
  title = 'Scan with Phone Camera',
  subtitle = 'Open file instantly on mobile without typing URLs',
  size = 180,
  showDownload = true,
}) => {
  const [dataUrl, setDataUrl] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!url) return;

    QRCode.toDataURL(url, {
      width: size * 2, // 2x for sharp retina displays
      margin: 2,
      color: {
        dark: '#0f172a', // slate-900
        light: '#ffffff',
      },
      errorCorrectionLevel: 'M',
    })
      .then(result => {
        setDataUrl(result);
        setError(null);
      })
      .catch(err => {
        console.error('QR code generation failed:', err);
        setError('Could not generate QR code');
      });
  }, [url, size]);

  const handleDownloadQR = () => {
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `matrix-qr-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  return (
    <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-4 flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
      {/* QR Code Container */}
      <div className="relative p-2.5 bg-white rounded-xl shadow-xs border border-slate-200 shrink-0 flex items-center justify-center">
        {dataUrl ? (
          <img
            src={dataUrl}
            alt="QR Code"
            className="w-32 h-32 object-contain rounded-lg"
          />
        ) : error ? (
          <div className="w-32 h-32 flex items-center justify-center text-xs text-red-500 p-2">
            {error}
          </div>
        ) : (
          <div className="w-32 h-32 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Description & Action buttons */}
      <div className="flex-1 min-w-0 space-y-2">
        <div>
          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/60 mb-1">
            <QrCode size={11} /> Fast Mobile Hand-off
          </div>
          <h4 className="text-xs font-bold text-slate-900 leading-snug">
            {title}
          </h4>
          <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5">
            {subtitle}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 justify-center sm:justify-start pt-1">
          {showDownload && (
            <button
              onClick={handleDownloadQR}
              disabled={!dataUrl}
              className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
              title="Download QR code image"
            >
              <Download size={13} />
              <span>Save PNG</span>
            </button>
          )}

          <button
            onClick={handleCopyUrl}
            className="px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            <span>{copied ? 'Copied' : 'Copy Link'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
