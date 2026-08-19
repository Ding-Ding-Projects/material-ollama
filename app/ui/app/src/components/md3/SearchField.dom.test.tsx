import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { SearchField } from "./SearchField";

// SearchField is fully controlled (value/onChange live in the parent), so
// the only honest way to prove typing "works" is to wire it to real state,
// the same as every real caller does — asserting only that onChange fired
// would miss a component that echoes the wrong value back.
function ControlledSearchField() {
  const [value, setValue] = useState("");
  const [regex, setRegex] = useState(false);
  return (
    <SearchField
      value={value}
      onChange={setValue}
      placeholder="Search"
      label="Search field"
      regex={regex}
      onToggleRegex={() => setRegex((current) => !current)}
    />
  );
}

describe("SearchField", () => {
  it("updates the value as the user types", async () => {
    const user = userEvent.setup();
    render(<ControlledSearchField />);

    const input = screen.getByLabelText("Search field");
    await user.type(input, "llama");

    expect(input).toHaveValue("llama");
  });

  it("flips the regex toggle's pressed state on click", async () => {
    const user = userEvent.setup();
    render(<ControlledSearchField />);

    const toggle = screen.getByRole("button", { name: "Regex search" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "false");
  });

  it("omits the .* affordance entirely when neither regex handler is given", () => {
    render(
      <SearchField
        value=""
        onChange={() => {}}
        placeholder="Search"
        label="Plain search"
      />,
    );

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
