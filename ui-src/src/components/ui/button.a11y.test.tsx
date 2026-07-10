import { render } from "@testing-library/react";
import axe from "axe-core";
import { describe, expect, it } from "vitest";

import { Button } from "./button";

describe("Button accessibility", () => {
  it("has no automated violations when it has an accessible name", async () => {
    const { container } = render(<Button>Generate audio</Button>);
    // jsdom has no canvas implementation, so real color contrast is covered by
    // the browser suite rather than this structural accessibility test.
    const results = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
    });

    expect(results.violations).toEqual([]);
  });
});
