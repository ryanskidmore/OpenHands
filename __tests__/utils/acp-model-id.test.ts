import { describe, expect, it } from "vitest";
import { parseAcpModelId } from "#/utils/acp-model-id";

describe("parseAcpModelId", () => {
  it("splits a claude-code id on a recognized effort suffix", () => {
    expect(parseAcpModelId("sonnet/high", "claude-code")).toEqual({
      base: "sonnet",
      effort: "high",
    });
  });

  it("recognizes every claude-code effort level", () => {
    for (const effort of ["low", "medium", "high", "xhigh", "max"]) {
      expect(parseAcpModelId(`sonnet/${effort}`, "claude-code")).toEqual({
        base: "sonnet",
        effort,
      });
    }
  });

  it("recognizes every codex effort level", () => {
    for (const effort of ["low", "medium", "high", "xhigh"]) {
      expect(parseAcpModelId(`gpt-5.1-codex/${effort}`, "codex")).toEqual({
        base: "gpt-5.1-codex",
        effort,
      });
    }
  });

  it("does not split codex on 'max' (not a codex effort level)", () => {
    // "max" is valid for claude-code but not codex — the check must be
    // per-server, not a global effort-level set.
    expect(parseAcpModelId("gpt-5.1-codex/max", "codex")).toEqual({
      base: "gpt-5.1-codex/max",
      effort: null,
    });
  });

  it("does not split on an unrecognized suffix", () => {
    expect(parseAcpModelId("sonnet/turbo", "claude-code")).toEqual({
      base: "sonnet/turbo",
      effort: null,
    });
  });

  it("never splits gemini-cli ids", () => {
    expect(parseAcpModelId("gemini-2.5-pro/high", "gemini-cli")).toEqual({
      base: "gemini-2.5-pro/high",
      effort: null,
    });
  });

  it("never splits the custom preset's ids", () => {
    expect(parseAcpModelId("my-model/high", "custom")).toEqual({
      base: "my-model/high",
      effort: null,
    });
  });

  it("never splits for an unknown/unregistered server", () => {
    expect(parseAcpModelId("sonnet/high", "some-future-server")).toEqual({
      base: "sonnet/high",
      effort: null,
    });
  });

  it("never splits when no server is known (null/undefined)", () => {
    expect(parseAcpModelId("sonnet/high", null)).toEqual({
      base: "sonnet/high",
      effort: null,
    });
    expect(parseAcpModelId("sonnet/high", undefined)).toEqual({
      base: "sonnet/high",
      effort: null,
    });
  });

  it("leaves an id with no slash untouched", () => {
    expect(parseAcpModelId("sonnet", "claude-code")).toEqual({
      base: "sonnet",
      effort: null,
    });
  });

  it("splits only on the LAST slash", () => {
    expect(parseAcpModelId("vertex/sonnet-4-5/high", "claude-code")).toEqual({
      base: "vertex/sonnet-4-5",
      effort: "high",
    });
  });

  it("does not split when the base would be empty (id is just '/<effort>')", () => {
    expect(parseAcpModelId("/high", "claude-code")).toEqual({
      base: "/high",
      effort: null,
    });
  });

  it("leaves an empty id untouched", () => {
    expect(parseAcpModelId("", "claude-code")).toEqual({
      base: "",
      effort: null,
    });
  });
});
