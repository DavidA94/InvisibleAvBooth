import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { AdminIndexPage } from "./AdminIndexPage";
import { TEST_ID_ADMIN_INDEX_PAGE } from "../constants/testIds";

const mockNavigate = vi.fn();
vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderPage(): ReturnType<typeof render> {
  return render(
    <MemoryRouter>
      <AdminIndexPage />
    </MemoryRouter>,
  );
}

describe("AdminIndexPage", () => {
  it("renders the page container", () => {
    renderPage();
    expect(screen.getByTestId(TEST_ID_ADMIN_INDEX_PAGE)).toBeInTheDocument();
  });

  it("renders all admin section cards", () => {
    renderPage();
    expect(screen.getByText("User Management")).toBeInTheDocument();
    expect(screen.getByText("Device Management")).toBeInTheDocument();
    expect(screen.getByText("Templates")).toBeInTheDocument();
    expect(screen.getByText("YouTube")).toBeInTheDocument();
    expect(screen.getByText("Facebook")).toBeInTheDocument();
  });

  it("navigates to the correct path when a card is clicked", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText("User Management"));
    expect(mockNavigate).toHaveBeenCalledWith("/admin/users");
  });

  it("navigates to templates path", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText("Templates"));
    expect(mockNavigate).toHaveBeenCalledWith("/admin/templates");
  });

  it("navigates to YouTube path", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText("YouTube"));
    expect(mockNavigate).toHaveBeenCalledWith("/admin/platforms/youtube");
  });
});
