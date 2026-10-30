import sharp from "sharp";
import { StudioError, type Payload } from "./creative-studio-core.ts";
/** A single normalized artifact is stored and downloaded. Any future image-to-video
 * input must reference this artifact, never the uncropped provider URL. */
export async function normalizeStudioImage(input: Buffer, payload: Payload) {
  const ratio = typeof payload.aspect_ratio === "string" ? payload.aspect_ratio : "1:1";
  const match = /^(\d{1,2}):(\d{1,2})$/.exec(ratio);
  if (!match || !Number(match[1]) || !Number(match[2])) throw new StudioError("INVALID_IMAGE_RATIO", "The saved image needs a valid quoted aspect ratio.", 422);
  const width = 1080, height = Math.round(width * Number(match[2]) / Number(match[1]));
  if (height < 270 || height > 4320) throw new StudioError("INVALID_IMAGE_RATIO", "The requested crop is outside the supported image dimensions.", 422);
  const result = await sharp(input, { limitInputPixels: 40_000_000, pages: 1, failOn: "error" })
    .autoOrient()
    .resize(width, height, { fit: "cover", position: "centre" })
    .png()
    .toBuffer({ resolveWithObject: true });
  if (result.info.width !== width || result.info.height !== height || result.info.format !== "png") throw new Error("Image normalization did not match the required output");
  return { body: result.data, contentType: "image/png" as const, width, height };
}
