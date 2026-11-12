// MP4 export in the browser with Mediabunny (WebCodecs): decode → draw captions → encode H.264 + AAC.
import * as MB from '/vendor/mediabunny.js';

export async function exportVideo(file, draw, onProgress, signal) {
  const input = new MB.Input({ source: new MB.BlobSource(file), formats: MB.ALL_FORMATS });
  const vt = await input.getPrimaryVideoTrack();
  if (!vt) throw new Error('این فایل ویدیو ندارد');
  const W = vt.displayWidth - (vt.displayWidth % 2);
  const H = vt.displayHeight - (vt.displayHeight % 2);

  // A DOM canvas (not OffscreenCanvas) so the page's loaded/custom fonts are guaranteed to be available.
  const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const ctx = canvas.getContext('2d');
  const output = new MB.Output({ format: new MB.Mp4OutputFormat({ fastStart: 'in-memory' }), target: new MB.BufferTarget() });

  const conversion = await MB.Conversion.init({
    input,
    output,
    video: {
      codec: 'avc',
      quality: MB.QUALITY_VERY_HIGH,
      forceTranscode: true,
      allowTransformationMetadata: false, // bake phone rotation into the pixels
      processedWidth: W,
      processedHeight: H,
      process: (sample) => {
        ctx.clearRect(0, 0, W, H);
        sample.drawWithFit(ctx, { fit: 'fill' });
        draw(ctx, W, H, sample.timestamp);
        return canvas;
      },
    },
    audio: { codec: 'aac' },
  });
  if (!conversion.isValid) {
    throw new Error('تبدیل ممکن نیست: ' + conversion.discardedTracks.map((d) => d.reason).join(', '));
  }
  conversion.onProgress = onProgress;
  signal?.addEventListener('abort', () => conversion.cancel());
  await conversion.execute();
  return new Blob([output.target.buffer], { type: 'video/mp4' });
}
