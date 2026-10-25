/**
 * Ports the file-type tables, getFileExtension, getRandomFilename and
 * handleURLDataTransfers from static/js/question_pack.js.
 */

import { api } from "@shared/api";

export const IMAGE_TYPES = [
  "image/apng",
  "image/gif",
  "image/jpeg",
  "image/jpg",
  "image/pjpeg",
  "image/png",
  "image/webp",
];
export const VIDEO_TYPES = ["video/webm", "video/mp4"];
export const AUDIO_TYPES = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav"];

const EXTENSIONS: Record<string, string> = {
  "image/apng": "png",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/pjpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "video/webm": "webm",
  "video/mp4": "mp4",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
};

const LETTERS = "abcdefghijklmnopqrstuvwxyz0123456789";

/**
 * Every staged upload is renamed. The multipart part is keyed by filename, so
 * two questions each given a "image.png" would otherwise collide, and
 * `validate_file` rejects names outside Config.VALID_NAME_CHARACTERS.
 */
export function randomFilename(contentType: string): string | null {
  const extension = EXTENSIONS[contentType];
  if (!extension) return null;

  let name = "";
  for (let i = 0; i < 16; i++) {
    name += LETTERS[Math.floor(Math.random() * LETTERS.length)];
  }
  return `${name}.${extension}`;
}

export function renameForUpload(file: File): File | null {
  const name = randomFilename(file.type);
  return name ? new File([file], name, { type: file.type }) : null;
}

/**
 * Finds the media URL in something dragged from another tab: an <img> (often
 * wrapped in a link) arrives as text/html, a bare link as text/uri-list.
 * Must be called synchronously inside the drop handler.
 */
export function droppedMediaUrl(dataTransfer: DataTransfer): string | null {
  const html = dataTransfer.getData("text/html");
  if (html) {
    // DOMParser rather than innerHTML: nothing in the fragment loads or runs.
    const doc = new DOMParser().parseFromString(html, "text/html");
    const src = (doc.querySelector("a > img") ?? doc.querySelector("img"))?.getAttribute("src");
    if (src) return src;
  }

  const uri = dataTransfer
    .getData("text/uri-list")
    .split(/\r?\n/)
    .find((line) => line && !line.startsWith("#"));
  return uri ?? null;
}

/**
 * Downloads dropped media through the /packs/fetch proxy, since the source
 * site almost never sends CORS headers. data: and blob: URLs are fetched
 * directly; the proxy can't reach those.
 */
export async function fetchMediaUrl(url: string, accept: string[]): Promise<File> {
  const direct = url.startsWith("data:") || url.startsWith("blob:");
  const response = await fetch(direct ? url : api.fetchResourceUrl(url), {
    credentials: "same-origin",
  });
  if (!response.ok) throw new Error(`Fetching media failed with status ${response.status}`);

  const contentType = response.headers.get("Content-Type")?.split(";")[0].trim() ?? "";
  const filename = randomFilename(contentType);
  if (!filename || !accept.includes(contentType)) {
    throw new Error(`Unsupported media type '${contentType}'`);
  }

  return new File([await response.blob()], filename, { type: contentType });
}

/** `<input type="color">` only accepts #rrggbb; older packs stored `rgb(...)`. */
export function toHexColor(color: string | undefined): string {
  if (!color) return "#ffffff";
  if (/^#[0-9a-f]{6}$/i.test(color)) return color;

  const rgb = color.match(/\d+/g);
  if (!rgb || rgb.length < 3) return "#ffffff";
  return `#${rgb
    .slice(0, 3)
    .map((part) => Number(part).toString(16).padStart(2, "0"))
    .join("")}`;
}
