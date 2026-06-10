import { describe, it, expect } from "vitest";
import { mapLinkForAddress, mapEmbedUrl } from "../src/lib/maps";

describe("mapLinkForAddress", () => {
  it("returns a Google Maps search URL for a real address", () => {
    const url = mapLinkForAddress("100 Main St, Charleston, SC 29401");
    expect(url).toBe("https://www.google.com/maps/search/?api=1&query=100%20Main%20St%2C%20Charleston%2C%20SC%2029401");
  });

  it("returns null for blank/missing addresses", () => {
    expect(mapLinkForAddress(null)).toBeNull();
    expect(mapLinkForAddress(undefined)).toBeNull();
    expect(mapLinkForAddress("   ")).toBeNull();
  });
});

describe("mapEmbedUrl (env-gated)", () => {
  it("returns null without GOOGLE_MAPS_EMBED_API_KEY (disabled state)", () => {
    expect(mapEmbedUrl("100 Main St", {} as unknown as NodeJS.ProcessEnv)).toBeNull();
  });

  it("returns the Embed API URL when the key is set", () => {
    const url = mapEmbedUrl("100 Main St", { GOOGLE_MAPS_EMBED_API_KEY: "k123" } as unknown as NodeJS.ProcessEnv);
    expect(url).toBe("https://www.google.com/maps/embed/v1/place?key=k123&q=100%20Main%20St");
  });

  it("returns null for a blank address even with a key", () => {
    expect(mapEmbedUrl("", { GOOGLE_MAPS_EMBED_API_KEY: "k123" } as unknown as NodeJS.ProcessEnv)).toBeNull();
  });
});
