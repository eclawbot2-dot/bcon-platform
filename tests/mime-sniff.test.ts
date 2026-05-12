/**
 * Tests for the magic-number MIME sniffer. This lib is the only line
 * between malicious uploads and trusting the client-supplied
 * `File.type`, so coverage of each recognized signature matters.
 */
import { describe, it, expect } from "vitest";
import { sniffMime, isImage } from "@/lib/mime-sniff";

const buf = (...bytes: number[]) => Buffer.from(bytes);
const str = (s: string) => Buffer.from(s, "ascii");
const concat = (...parts: Buffer[]) => Buffer.concat(parts);

describe("sniffMime", () => {
  it("detects JPEG", () => {
    expect(sniffMime(concat(buf(0xff, 0xd8, 0xff), buf(0xe0, 0x00)))).toBe("image/jpeg");
  });
  it("detects PNG", () => {
    expect(sniffMime(concat(buf(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), buf(0x00)))).toBe("image/png");
  });
  it("detects GIF87a and GIF89a", () => {
    expect(sniffMime(str("GIF87a"))).toBe("image/gif");
    expect(sniffMime(str("GIF89a"))).toBe("image/gif");
  });
  it("detects WEBP only when RIFF header AND WEBP marker present", () => {
    const webp = concat(str("RIFF"), buf(0, 0, 0, 0), str("WEBP"));
    expect(sniffMime(webp)).toBe("image/webp");
    const fakeRiff = concat(str("RIFF"), buf(0, 0, 0, 0), str("WAVE"));
    expect(sniffMime(fakeRiff)).toBeNull();
  });
  it("detects HEIC", () => {
    expect(sniffMime(buf(0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63))).toBe("image/heic");
  });
  it("detects BMP", () => {
    expect(sniffMime(concat(buf(0x42, 0x4d), buf(0x00, 0x00)))).toBe("image/bmp");
  });
  it("detects TIFF (little + big endian)", () => {
    expect(sniffMime(buf(0x49, 0x49, 0x2a, 0x00))).toBe("image/tiff");
    expect(sniffMime(buf(0x4d, 0x4d, 0x00, 0x2a))).toBe("image/tiff");
  });
  it("detects PDF", () => {
    expect(sniffMime(str("%PDF-1.4"))).toBe("application/pdf");
  });
  it("detects zip-based formats (docx/xlsx/pptx share zip magic)", () => {
    expect(sniffMime(buf(0x50, 0x4b, 0x03, 0x04, 0x00))).toBe("application/zip");
  });
  it("detects legacy MS Office (CFB)", () => {
    expect(sniffMime(buf(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1))).toBe("application/msword");
  });
  it("returns null for unknown buffers", () => {
    expect(sniffMime(buf(0x00, 0x01, 0x02, 0x03))).toBeNull();
    expect(sniffMime(Buffer.alloc(0))).toBeNull();
  });
});

describe("isImage", () => {
  it("returns true for image MIMEs", () => {
    expect(isImage(buf(0xff, 0xd8, 0xff, 0xe0))).toBe(true); // jpeg
    expect(isImage(str("%PDF-"))).toBe(false);
  });
  it("returns false on unrecognized", () => {
    expect(isImage(buf(0x00, 0x00))).toBe(false);
  });
});
