import React from "react";
import { Camera, RefreshCw, Check, X, RotateCcw } from "lucide-react";
import { clsx } from "clsx";
import { useBodyScrollLock } from "../utils/useBodyScrollLock";

export const CameraCapture = ({ onCapture, onClose }) => {
  useBodyScrollLock(true);
  const videoRef = React.useRef(null);
  const canvasRef = React.useRef(null);
  const [stream, setStream] = React.useState(null);
  const [preview, setPreview] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [facingMode, setFacingMode] = React.useState("user"); // "user" or "environment"

  React.useEffect(() => {
    startCamera(facingMode);
    return () => stopCamera();
  }, [facingMode]);

  React.useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const startCamera = async (mode) => {
    stopCamera(); // Ensure previous stream is stopped
    setLoading(true);
    setError(null);
    try {
      const constraints = {
        video: {
          facingMode: mode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      };
      const mediaStream = await navigator.mediaDevices.getUserMedia(
        constraints
      );
      setStream(mediaStream);
      setLoading(false);
    } catch (err) {
      console.error("Error accessing camera with constraints:", err);
      try {
        // Fallback to basic video if complex constraints fail
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: true,
        });
        setStream(mediaStream);
        setLoading(false);
      } catch (fallbackErr) {
        console.error(
          "Error accessing camera even with fallback:",
          fallbackErr
        );
        setError(
          "Could not access camera. Please ensure permissions are granted and you are using a secure connection (HTTPS)."
        );
        setLoading(false);
      }
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");

      // Set canvas size to video size
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // Flip context horizontally ONLY if using front camera to match mirrored preview
      if (facingMode === "user") {
        context.translate(canvas.width, 0);
        context.scale(-1, 1);
      }

      // Draw frame to canvas
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Reset transform for future use (if any)
      context.setTransform(1, 0, 0, 1, 0, 0);

      // Convert to base64
      const imageData = canvas.toDataURL("image/jpeg", 0.8);
      setPreview(imageData);
      stopCamera();
    }
  };

  const handleRetake = () => {
    setPreview(null);
    // startCamera is triggered by useEffect on facingMode if we keep it, but here it's already current
    startCamera(facingMode);
  };

  const switchCamera = () => {
    setFacingMode((prev) => (prev === "user" ? "environment" : "user"));
  };

  const handleUsePhoto = () => {
    onCapture(preview);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white dark:bg-[#1e293b] w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl transition-colors duration-300">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-white/5 flex items-center justify-between">
          <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Camera size={20} />
            Capture Student Photo
          </h3>
          <div className="flex items-center gap-2">
            {!preview && !error && (
              <button
                onClick={switchCamera}
                className="p-2 text-slate-400 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                title="Switch Camera"
              >
                <RotateCcw size={20} />
              </button>
            )}
            <button
              onClick={onClose}
              className="text-slate-400 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Camera/Preview Area */}
        <div className="relative aspect-square bg-black flex items-center justify-center overflow-hidden">
          {error ? (
            <div className="text-white text-center p-6 bg-danger/20 rounded-xl m-4">
              <p>{error}</p>
            </div>
          ) : preview ? (
            <img
              src={preview}
              alt="Captured"
              className="w-full h-full object-cover"
            />
          ) : (
            <>
              {loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black z-10">
                  <RefreshCw className="text-primary animate-spin" size={32} />
                </div>
              )}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                onLoadedMetadata={() => videoRef.current?.play()}
                className={clsx(
                  "w-full h-full object-cover",
                  facingMode === "user" && "-scale-x-100"
                )}
              />
            </>
          )}
          <canvas ref={canvasRef} className="hidden" />
        </div>

        {/* Actions */}
        <div className="p-6 bg-slate-50 dark:bg-white/5 border-t border-slate-200 dark:border-white/5">
          {preview ? (
            <div className="flex gap-4">
              <button
                onClick={handleRetake}
                className="flex-1 bg-white dark:bg-white/10 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-slate-100 dark:hover:bg-white/20 transition-all"
              >
                <RefreshCw size={18} />
                Retake
              </button>
              <button
                onClick={handleUsePhoto}
                className="flex-1 bg-primary hover:bg-primary/90 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-primary/20 transition-all active:scale-95"
              >
                <Check size={18} />
                Use Photo
              </button>
            </div>
          ) : (
            <button
              onClick={capturePhoto}
              disabled={!!error}
              className="w-full bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-4 rounded-xl flex items-center justify-center gap-3 shadow-lg shadow-primary/20 transition-all active:scale-95"
            >
              <div className="w-4 h-4 rounded-full bg-white animate-pulse" />
              Capture Photo
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
