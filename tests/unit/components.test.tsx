// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { FieldError } from "@/components/ui/field";
import { SkillChip } from "@/components/ui/skill-chip";
import { TierBadge } from "@/components/ui/tier-badge";
import { initials } from "@/components/ui/avatar";

describe("ui primitives", () => {
  it("Button defaults to type=button and disables while loading", () => {
    render(<Button loading>Save</Button>);
    const btn = screen.getByRole("button", { name: "Save" });
    expect(btn).toHaveAttribute("type", "button");
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
  });

  it("errors are icon plus text, announced", () => {
    const { container } = render(<FieldError>Use your university email.</FieldError>);
    expect(screen.getByRole("alert")).toHaveTextContent("Use your university email.");
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("status badges carry an icon, neutral ones don't", () => {
    const { container: a } = render(<Badge tone="error">Failed</Badge>);
    expect(a.querySelector("svg")).not.toBeNull();
    const { container: b } = render(<Badge>Draft</Badge>);
    expect(b.querySelector("svg")).toBeNull();
  });

  it("TierBadge shows the tier name", () => {
    render(<TierBadge tier="radiant" />);
    expect(screen.getByText("Radiant")).toBeInTheDocument();
  });

  it("SkillChip labels level and verification", () => {
    render(<SkillChip name="TypeScript" level={3} verified />);
    expect(screen.getByLabelText("Level 3")).toHaveTextContent("L3");
    expect(screen.getByLabelText("Verified")).toBeInTheDocument();
  });

  it("EmptyState and ErrorState render their content", () => {
    render(<EmptyState title="No ventures yet" />);
    expect(screen.getByRole("heading", { name: "No ventures yet" })).toBeInTheDocument();
    render(<ErrorState requestId="7f3a9c1e-1234" />);
    expect(screen.getByText("Ref: 7f3a9c1e")).toBeInTheDocument();
  });

  it("initials() handles one, two and many names", () => {
    expect(initials("Sara")).toBe("S");
    expect(initials("Ayesha Khan")).toBe("AK");
    expect(initials("Muhammad Ali Jinnah")).toBe("MJ");
    expect(initials("  ")).toBe("?");
  });
});
