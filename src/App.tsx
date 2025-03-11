import { useRef, useState } from "react";
import jsQR from "jsqr";
import { saveAs } from "file-saver";
import JSZip from "jszip";

export default function QRCodeScanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [snapshots, setSnapshots] = useState<
    { blob: Blob; url: string; filename: string }[]
  >([]);

  // 记录已处理的二维码，防止重复截图
  const capturedCodesRef = useRef<Set<string>>(new Set());
  // 防止短时间内重复检测
  const lastDetectedRef = useRef<Map<string, number>>(new Map());

  const handleVideoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const video = videoRef.current;
    if (video) {
      video.src = url;
      video.play();
      video.onloadedmetadata = () => processVideo();
    }
  };

  const processVideo = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const detectQRCode = () => {
      if (video.paused || video.ended) {
        requestAnimationFrame(detectQRCode);
        return;
      }

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const qrCode = jsQR(imageData.data, imageData.width, imageData.height);

      if (qrCode) {
        const data = qrCode.data.trim();
        // 如果返回的二维码内容为空，则跳过
        if (!data) {
          requestAnimationFrame(detectQRCode);
          return;
        }
        const now = Date.now();
        const lastTime = lastDetectedRef.current.get(data);
        if (lastTime && now - lastTime < 3000) {
          requestAnimationFrame(detectQRCode);
          return;
        }
        lastDetectedRef.current.set(data, now);

        // 如果此二维码未曾处理过，则进行截图
        if (!capturedCodesRef.current.has(data)) {
          capturedCodesRef.current.add(data);
          console.log("检测到新二维码:", data);
          saveSnapshot(canvas);
        }
      }
      requestAnimationFrame(detectQRCode);
    };

    detectQRCode();
  };

  const saveSnapshot = (canvas: HTMLCanvasElement) => {
    console.log("正在截图...");
    // 使用同步的 toDataURL 获取当前帧图片
    const dataUrl = canvas.toDataURL("image/png");

    // 将 base64 数据转换为 Blob
    fetch(dataUrl)
      .then((res) => res.blob())
      .then((blob) => {
        validateQRCode(blob, canvas, dataUrl);
      });
  };

  // 对截图进行二次验证，确保截图内确实含有二维码
  const validateQRCode = (
    blob: Blob,
    canvas: HTMLCanvasElement,
    dataUrl: string
  ) => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const image = new Image();
    image.src = dataUrl;
    image.onload = () => {
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const qrCode = jsQR(imageData.data, imageData.width, imageData.height);
      // 同样判断二维码内容是否有效
      if (qrCode && qrCode.data.trim()) {
        console.log("截图含有二维码，保存中...");
        const filename = `qrcode_${Date.now()}.png`;
        const url = URL.createObjectURL(blob);
        setSnapshots((prev) => [...prev, { blob, url, filename }]);
        saveAs(blob, filename);
        console.log("截图已保存:", filename);
      } else {
        console.log("截图不含有效二维码，丢弃...");
      }
    };
  };

  const downloadAllSnapshots = async () => {
    const zip = new JSZip();
    const folder = zip.folder("qrcode_snapshots");
    snapshots.forEach(({ blob, filename }) => {
      folder?.file(filename, blob);
    });
    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, "qrcode_snapshots.zip");
  };

  return (
    <div className="flex flex-col items-center p-4">
      <input
        type="file"
        accept="video/*"
        onChange={handleVideoUpload}
        className="mb-4 p-2 border rounded"
      />
      <video
        ref={videoRef}
        controls
        className="w-full max-w-2xl mb-4 rounded-lg shadow-lg"
      />
      <canvas ref={canvasRef} className="hidden" />

      <button
        onClick={downloadAllSnapshots}
        disabled={snapshots.length === 0}
        className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400"
      >
        下载所有截图（{snapshots.length} 张）
      </button>

      <div className="grid grid-cols-3 gap-4 mt-4 w-full max-w-4xl">
        {snapshots.map(({ url, filename }, index) => (
          <div key={index} className="text-center border p-2 rounded-lg">
            <img
              src={url}
              alt="QR Snapshot"
              className="w-full h-32 object-cover mb-2 rounded"
            />
            <p className="text-sm text-gray-600 truncate">{filename}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
