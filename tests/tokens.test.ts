import { describe, expect, it } from "vitest";
import { clampToBudget, estimateTokens } from "../src/core/tokens.js";

describe("estimateTokens", () => {
  it("approximates four characters per token", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
  });
});

describe("clampToBudget", () => {
  it("passes short text through unchanged", () => {
    const result = clampToBudget("hello\nworld", 100);
    expect(result).toEqual({ text: "hello\nworld", tokens: estimateTokens("hello\nworld"), truncated: false });
  });

  it("cuts long text on a line boundary", () => {
    const text = Array.from({ length: 100 }, (_, index) => `line-${index} with some words`).join("\n");
    const result = clampToBudget(text, 50);
    expect(result.truncated).toBe(true);
    expect(result.tokens).toBeLessThanOrEqual(50);
    expect(result.text.endsWith("words")).toBe(true);
    expect(text.startsWith(result.text)).toBe(true);
  });
});
