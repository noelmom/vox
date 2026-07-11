import { describe, expect, it } from "vitest";

import { parseServerDate } from "./api";

describe("parseServerDate", () => {
  it("treats timezone-free server timestamps as UTC", () => {
    expect(parseServerDate("2026-07-10 04:05:06").toISOString()).toBe("2026-07-10T04:05:06.000Z");
  });

  it("preserves an explicit offset", () => {
    expect(parseServerDate("2026-07-10T04:05:06-04:00").toISOString()).toBe("2026-07-10T08:05:06.000Z");
  });
});
