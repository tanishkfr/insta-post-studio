import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("Studio host", () => {
  it("renders the project, format and three shell regions", () => {
    render(<App />);

    expect(screen.getByRole("textbox", { name: /project name/i })).toHaveValue("Untitled Project");
    expect(screen.getByRole("heading", { name: /canvas workspace/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^layers$/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^inspector$/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/format: instagram post, 1080 by 1080 pixels/i)).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: /editing tools/i })).toBeInTheDocument();
  });

  it("renames the in-memory project", () => {
    render(<App />);
    const input = screen.getByRole("textbox", { name: /project name/i });

    fireEvent.change(input, { target: { value: "Seafoam study" } });

    expect(input).toHaveValue("Seafoam study");
  });

  it("switches tool workspaces without mounting the source tool", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /image/i }));

    expect(screen.getByRole("heading", { name: /image workspace/i })).toBeInTheDocument();
    expect(screen.getByText(/tools\/legacy\/image\/janya.html/)).toBeInTheDocument();
    expect(screen.getByText(/not mounted in phase 0/i)).toBeInTheDocument();
  });
});
