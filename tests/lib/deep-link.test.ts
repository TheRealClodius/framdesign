import { describe, test, expect } from "@jest/globals";
import {
  parseDeepLinkFromSearchParams,
  resolveProjectDeepLink,
  DEEP_LINK_PARAM_Q,
  DEEP_LINK_PARAM_QUERY,
  DEEP_LINK_PARAM_PROJECT,
} from "@/lib/deep-link";

describe("parseDeepLinkFromSearchParams", () => {
  test("returns decoded q text", () => {
    const sp = new URLSearchParams();
    sp.set(DEEP_LINK_PARAM_Q, "hello%20world");
    expect(parseDeepLinkFromSearchParams(sp)).toBe("hello world");
  });

  test("query alias matches q", () => {
    const sp = new URLSearchParams();
    sp.set(DEEP_LINK_PARAM_QUERY, "design%20systems");
    expect(parseDeepLinkFromSearchParams(sp)).toBe("design systems");
  });

  test("q wins over project when both set", () => {
    const sp = new URLSearchParams();
    sp.set(DEEP_LINK_PARAM_Q, "first");
    sp.set(DEEP_LINK_PARAM_PROJECT, "urbanair");
    expect(parseDeepLinkFromSearchParams(sp)).toBe("first");
  });

  test("project param builds Tell me about prompt", () => {
    const sp = new URLSearchParams();
    sp.set(DEEP_LINK_PARAM_PROJECT, "urbanair");
    expect(parseDeepLinkFromSearchParams(sp)).toBe("Tell me about UrbanAir");
  });

  test("returns null for empty q", () => {
    const sp = new URLSearchParams();
    sp.set(DEEP_LINK_PARAM_Q, "   ");
    expect(parseDeepLinkFromSearchParams(sp)).toBeNull();
  });

  test("returns null when no recognized params", () => {
    expect(parseDeepLinkFromSearchParams(new URLSearchParams())).toBeNull();
  });

  test("clamps extremely long q to max length", () => {
    const sp = new URLSearchParams();
    sp.set(DEEP_LINK_PARAM_Q, "x".repeat(5000));
    const out = parseDeepLinkFromSearchParams(sp);
    expect(out).not.toBeNull();
    expect(out!.length).toBe(4000);
  });
});

describe("resolveProjectDeepLink", () => {
  test("matches display name case-insensitively", () => {
    expect(resolveProjectDeepLink("urbanair")).toBe("Tell me about UrbanAir");
    expect(resolveProjectDeepLink("UrbanAir")).toBe("Tell me about UrbanAir");
  });

  test("matches full entity id", () => {
    expect(resolveProjectDeepLink("project:urbanair")).toBe(
      "Tell me about UrbanAir"
    );
  });

  test("returns null for unknown slug", () => {
    expect(resolveProjectDeepLink("not-a-real-project")).toBeNull();
  });
});
